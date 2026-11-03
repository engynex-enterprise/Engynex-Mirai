import "server-only"
import { createHash } from "node:crypto"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { G_SCOPES, googleToken } from "@/lib/google"
import { agenda, todayBogota, type AgendaItem } from "@/lib/domain"
import { getIntegration } from "@/features/integrations/store"
import { avisoCtx } from "@/lib/notify/digest"
import { householdCan } from "@/lib/plan-server"
import { siteUrl } from "@/lib/site-url"

// Google Calendar de cada persona: Mirai lleva ahí los pagos y cobros de los próximos 45 días y los mantiene al día.
// google_event_map guarda qué evento creó Mirai para cada pago (clave estable) y una huella de su contenido:
// - pago nuevo → se crea (POST); si el evento ya existía (lo creó el botón de antes) se actualiza;
// - cambió el monto o el texto → se actualiza (PATCH);
// - se pagó, se borró o cambió de fecha antes de llegar → se borra (DELETE). Los pasados se dejan como historial.

const CAL = "https://www.googleapis.com/calendar/v3/calendars"
const VENTANA = 45

export type CalSync = { creados: number; actualizados: number; borrados: number; total: number }

/** Clave estable de un pago de la agenda y el id del evento (base32hex válido: 0-9a-f, igual que el botón anterior). */
export const calKey = (x: Pick<AgendaItem, "k" | "id" | "fecha">) => `${x.k}|${x.id}|${x.fecha}`
export const calEventId = (bookId: string, key: string) => createHash("sha1").update(`${bookId}|${key}`).digest("hex").slice(0, 32)

/** Cuerpo del evento (día completo, recordatorio la tarde anterior). Sin montos si la persona los oculta en sus avisos. */
export function calBody(x: AgendaItem, o: { ocultarMontos?: boolean } = {}) {
  const end = new Date(`${x.fecha}T12:00:00`)
  end.setDate(end.getDate() + 1)
  const valor = x.monto > 0 && !o.ocultarMontos ? `\nValor: $${Math.round(x.monto).toLocaleString("es-CO")}` : ""
  return {
    summary: `${x.dir === "cobrar" ? "Cobrar" : "Pagar"}: ${x.titulo}`,
    description: `${x.sub}${valor}${x.nota ? `\n${x.nota}` : ""}\nDesde Mirai: ${siteUrl()}/${x.go}`,
    start: { date: x.fecha }, end: { date: end.toISOString().slice(0, 10) },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 9 * 60 }] },
  }
}
export const calHash = (body: unknown) => createHash("sha1").update(JSON.stringify(body)).digest("hex").slice(0, 16)

/** Plan de cambios (función pura para las pruebas): qué crear, actualizar y borrar frente a lo que ya está en el mapa. */
export function calPlan(items: { key: string; hash: string; fecha: string }[], map: { key: string; hash: string; fecha: string }[], today: string) {
  const have = new Map(map.map((m) => [m.key, m]))
  const want = new Set(items.map((i) => i.key))
  return {
    crear: items.filter((i) => !have.has(i.key)).map((i) => i.key),
    actualizar: items.filter((i) => have.has(i.key) && have.get(i.key)!.hash !== i.hash).map((i) => i.key),
    borrar: map.filter((m) => !want.has(m.key) && m.fecha >= today).map((m) => m.key),
    olvidar: map.filter((m) => !want.has(m.key) && m.fecha < today).map((m) => m.key),
  }
}

async function gcal(token: string, url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
  const r = await fetch(url, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(15000) })
  if (r.ok || r.status === 204) return { ok: true as const, status: r.status }
  const j = await r.json().catch(() => ({}))
  return { ok: false as const, status: r.status, msg: (j as { error?: { message?: string } })?.error?.message ?? `Google respondió ${r.status}` }
}

/** ¿La persona conectó Google Calendar? */
export async function calendarConnected(userId: string) {
  const { data } = await supabaseAdmin().from("google_connections").select("scopes").eq("user_id", userId).maybeSingle()
  return !!data?.scopes?.includes(G_SCOPES.calendar)
}

/**
 * Sincroniza los pagos y cobros de un libro con el Google Calendar de una persona. Idempotente: correrla dos veces seguidas
 * no cambia nada la segunda vez.
 */
export async function syncCalendarFor(o: { userId: string; bookId: string; householdId: string; today?: string; ocultarMontos?: boolean }): Promise<CalSync> {
  const today = o.today ?? todayBogota()
  const token = await googleToken(o.userId, "calendar")
  const cfg = await getIntegration(o.householdId, "google_calendar")
  const calId = String(cfg?.config.calendarId || "primary")
  const base = `${CAL}/${encodeURIComponent(calId)}/events`
  const db = supabaseAdmin()
  const { book } = await avisoCtx(o.bookId, o.userId)
  const items = agenda(book, today).filter((x) => x.d >= 0 && x.d <= VENTANA).map((x) => {
    const key = calKey(x), body = calBody(x, { ocultarMontos: o.ocultarMontos })
    return { key, body, hash: calHash(body), fecha: x.fecha, event_id: calEventId(o.bookId, key) }
  })
  const { data: rows } = await db.from("google_event_map").select("key,event_id,hash,fecha,calendar_id").eq("user_id", o.userId).eq("book_id", o.bookId)
  const map = (rows ?? []).filter((r) => r.calendar_id === calId)
  const plan = calPlan(items, map, today)
  const byKey = new Map(items.map((i) => [i.key, i]))
  const mapOf = new Map(map.map((m) => [m.key, m]))
  const out: CalSync = { creados: 0, actualizados: 0, borrados: 0, total: items.length }
  const save = (i: (typeof items)[number], eventId: string) =>
    db.from("google_event_map").upsert({ user_id: o.userId, book_id: o.bookId, key: i.key, event_id: eventId, calendar_id: calId, hash: i.hash, fecha: i.fecha, updated_at: new Date().toISOString() })

  for (const k of plan.crear) {
    const i = byKey.get(k)!
    const r = await gcal(token, base, "POST", { id: i.event_id, ...i.body })
    if (r.ok) out.creados++
    else if (r.status === 409) { const u = await gcal(token, `${base}/${i.event_id}`, "PATCH", { ...i.body, status: "confirmed" }); if (!u.ok) throw new Error(u.msg); out.actualizados++ }
    else throw new Error(r.msg)
    await save(i, i.event_id)
  }
  for (const k of plan.actualizar) {
    const i = byKey.get(k)!, m = mapOf.get(k)!
    let r = await gcal(token, `${base}/${m.event_id}`, "PATCH", { ...i.body, status: "confirmed" })
    if (!r.ok && (r.status === 404 || r.status === 410)) r = await gcal(token, base, "POST", { id: i.event_id, ...i.body })
    if (!r.ok) throw new Error(r.msg)
    out.actualizados++
    await save(i, m.event_id)
  }
  for (const k of plan.borrar) {
    const m = mapOf.get(k)!
    const r = await gcal(token, `${base}/${m.event_id}`, "DELETE")
    if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(r.msg)
    out.borrados++
  }
  const quitar = [...plan.borrar, ...plan.olvidar]
  if (quitar.length) await db.from("google_event_map").delete().eq("user_id", o.userId).eq("book_id", o.bookId).in("key", quitar)
  return out
}

/** Mensaje para la persona después de sincronizar. */
export function calSyncMsg(r: CalSync) {
  const partes = [r.creados && `${r.creados} nuevo${r.creados === 1 ? "" : "s"}`, r.actualizados && `${r.actualizados} actualizado${r.actualizados === 1 ? "" : "s"}`, r.borrados && `${r.borrados} quitado${r.borrados === 1 ? "" : "s"}`].filter(Boolean)
  return partes.length ? `Tu Google Calendar quedó al día: ${partes.join(", ")}.` : "Tu Google Calendar ya estaba al día."
}

/**
 * Pasada diaria del cron: sincroniza a cada persona que conectó Google Calendar, en cada libro de sus hogares con el plan
 * que lo incluye ("banco"), salvo que lo haya apagado en Ajustes › Alertas (`notification_rules.canales.gcal = false`).
 */
export async function syncAllCalendars() {
  const db = supabaseAdmin()
  const { data: conns } = await db.from("google_connections").select("user_id,scopes").contains("scopes", [G_SCOPES.calendar])
  const out: string[] = []
  for (const c of conns ?? []) {
    const { data: mem } = await db.from("household_members").select("household_id").eq("user_id", c.user_id)
    for (const m of mem ?? []) {
      if (!(await householdCan(m.household_id, "banco"))) continue
      const { data: books } = await db.from("books").select("id").eq("household_id", m.household_id).is("deleted_at", null)
      for (const b of books ?? []) {
        const { data: rule } = await db.from("notification_rules").select("canales,ocultar_montos").eq("user_id", c.user_id).eq("book_id", b.id).maybeSingle()
        if ((rule?.canales as { gcal?: boolean } | null)?.gcal === false) continue
        try { const r = await syncCalendarFor({ userId: c.user_id, bookId: b.id, householdId: m.household_id, ocultarMontos: !!rule?.ocultar_montos }); out.push(`${c.user_id.slice(0, 8)}:${b.id.slice(0, 8)} +${r.creados} ~${r.actualizados} -${r.borrados}`) }
        catch (e) { out.push(`${c.user_id.slice(0, 8)}:${b.id.slice(0, 8)} ERROR ${(e as Error).message}`) }
      }
    }
  }
  return out
}
