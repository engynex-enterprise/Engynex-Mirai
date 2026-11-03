"use server"

import { z } from "zod"
import { requireRole } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { supabaseServer } from "@/utils/supabase/server"
import { googleFetch } from "@/lib/google"
import { calSyncMsg, calendarConnected, syncCalendarFor } from "@/lib/google-calendar"
import { aiObject } from "@/lib/ai/run"
import { mailMayBePurchase } from "@/lib/ai/router"
import { clip } from "@/lib/ai/compact"
import { aiSettings } from "@/lib/ai/model"
import { todayBogota } from "@/lib/domain"
import { MAILQ_DEFAULT } from "./query"
import { can } from "@/lib/plans"

export type MailRow = { id: string; fecha: string; comercio: string; valor: number; asunto: string; remitente: string }

const hdr = (m: { payload?: { headers?: { name: string; value: string }[] } }, n: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? ""
const pnum = (s: string) => { const t = s.replace(/\s/g, ""); const v = /,\d{2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."); return Math.round(parseFloat(v) || 0) }

/** Lee las notificaciones del banco en Gmail y extrae las compras (mailScan de la v4). */
export async function scanMail(query?: string): Promise<{ ok: boolean; rows: MailRow[]; msg?: string; ia?: boolean }> {
  const ctx = await requireRole("editor")
  if (!can(ctx.plan, "banco")) return { ok: false, rows: [], msg: "Leer el correo del banco no está incluido en tu plan." }
  const q = (query || MAILQ_DEFAULT).slice(0, 1000)
  let list: { messages?: { id: string }[] }
  try { list = await googleFetch(ctx.user.id, "gmail", `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=40&q=${encodeURIComponent(q)}`) }
  catch (e) { return { ok: false, rows: [], msg: (e as Error).message } }
  const ids = (list.messages ?? []).map((m) => m.id)
  if (!ids.length) return { ok: true, rows: [] }
  const sb = await supabaseServer()
  const { data: seen } = await sb.from("expenses").select("external_id").eq("book_id", ctx.book.id).in("external_id", ids.map((i) => `gmail:${i}`))
  const done = new Set((seen ?? []).map((x) => x.external_id))
  const nuevos = ids.filter((i) => !done.has(`gmail:${i}`))
  const msgs = await Promise.all(nuevos.map((id) => googleFetch<{ id: string; snippet: string; internalDate: string; payload?: { headers?: { name: string; value: string }[] } }>(ctx.user.id, "gmail", `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`).catch(() => null)))
  const correos = msgs.filter(Boolean).map((m, i) => ({ i, id: m!.id, asunto: hdr(m!, "subject"), texto: m!.snippet, fecha_correo: new Date(+m!.internalDate).toISOString().slice(0, 10), remitente: hdr(m!, "from") }))
  if (!correos.length) return { ok: true, rows: [] }
  const ia = await aiSettings(ctx.book.id)
  // Sin un monto no puede ser una compra (publicidad, avisos de seguridad…): esos ni se le mandan a la IA.
  const candidatos = correos.filter((c) => mailMayBePurchase(`${c.asunto} ${c.texto}`))
  if (!candidatos.length) return { ok: true, rows: [] }
  if (ia.on !== false) {
    try {
      const { object } = await aiObject({
        householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "correo_banco",
        schema: z.object({ items: z.array(z.object({ i: z.number(), es_gasto: z.boolean(), fecha: z.string(), comercio: z.string(), valor: z.number() })) }),
        prompt: `CORREOS (i | fecha del correo | remitente | asunto | texto):\n${candidatos.map((c) => `${c.i} | ${c.fecha_correo} | ${clip(c.remitente.replace(/.*<|>.*/g, ""), 40)} | ${clip(c.asunto, 100)} | ${clip(c.texto, 260)}`).join("\n")}`,
      })
      const rows = object.items.filter((x) => x.es_gasto && x.valor > 0 && correos[x.i]).map((x) => { const c = correos[x.i]; return { id: c.id, fecha: /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) ? x.fecha : c.fecha_correo, comercio: x.comercio.slice(0, 80), valor: Math.round(x.valor), asunto: c.asunto, remitente: c.remitente } })
      return { ok: true, rows, ia: true }
    } catch { /* respaldo sin IA */ }
  }
  const rows = candidatos.map((c) => {
    const t = `${c.asunto} ${c.texto}`
    const m = t.match(/\$\s?([\d.,]+)/)
    const com = t.match(/en ([A-Z0-9 *.]{3,30})/)
    return { id: c.id, fecha: c.fecha_correo, comercio: (com?.[1] ?? c.asunto).trim().slice(0, 80), valor: m ? pnum(m[1]) : 0, asunto: c.asunto, remitente: c.remitente }
  }).filter((r) => r.valor > 0)
  return { ok: true, rows, ia: false }
}

export async function googleDisconnect() {
  const ctx = await requireRole("viewer")
  await supabaseAdmin().from("google_connections").delete().eq("user_id", ctx.user.id)
}

/**
 * Lleva los próximos pagos y cobros (45 días) a Google Calendar y los mantiene al día: crea los nuevos, actualiza los que
 * cambiaron de monto y quita los que ya pagaste o borraste (lib/google-calendar.ts). Ids estables: no duplica.
 * El cron diario hace lo mismo solo, para quien conectó Calendar.
 */
export async function syncCalendar(): Promise<{ ok: boolean; msg: string }> {
  const ctx = await requireRole("viewer")
  if (!can(ctx.plan, "banco")) return { ok: false, msg: "Llevar tus pagos a Google Calendar no está incluido en tu plan." }
  try {
    const { data: rule } = await supabaseAdmin().from("notification_rules").select("ocultar_montos").eq("user_id", ctx.user.id).eq("book_id", ctx.book.id).maybeSingle()
    const r = await syncCalendarFor({ userId: ctx.user.id, bookId: ctx.book.id, householdId: ctx.household.id, today: todayBogota(), ocultarMontos: !!rule?.ocultar_montos })
    return { ok: true, msg: calSyncMsg(r) }
  } catch (e) { return { ok: false, msg: (e as Error).message } }
}

/** Estado de Google Calendar para Ajustes › Alertas: si está conectado, si el plan lo incluye y cuántos eventos lleva Mirai. */
export async function calendarStatus(): Promise<{ conectado: boolean; plan: boolean; eventos: number }> {
  try {
    const ctx = await requireRole("viewer")
    const [conectado, { count }] = await Promise.all([
      calendarConnected(ctx.user.id),
      supabaseAdmin().from("google_event_map").select("key", { count: "exact", head: true }).eq("user_id", ctx.user.id).eq("book_id", ctx.book.id),
    ])
    return { conectado, plan: can(ctx.plan, "banco"), eventos: count ?? 0 }
  } catch { return { conectado: false, plan: false, eventos: 0 } }
}
