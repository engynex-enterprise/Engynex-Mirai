// Avisos de los movimientos de la familia por correo, WhatsApp, push y Telegram. Los arma la base (migración
// 0011_avisos_familia.sql: trigger en gastos, ingresos extra y deudas → family_activity + aviso en la app); aquí se
// envían los que llevan QUIETO_MS sin cambios (la persona dejó de registrar), una sola vez por canal, según
// Ajustes › Alertas: interruptor del canal (`canales`), fila "Movimientos de tu familia" de la matriz y montos ocultos.
// Lo corre el trabajo de cada 5 minutos (/v1/jobs/automations/drain). Solo servidor.
import { rt } from "../runtime"
import { brandEmail } from "./email"
import { channelStatus, defaultRule, deliverOnce, horaBogota, type Canal, type Msg, type Rule } from "./digest"
import { enSilencio, onFor } from "./rules"

/** Tiempo sin movimientos nuevos antes de enviar (así un extracto importado sale en un solo mensaje). */
export const QUIETO_MS = 3 * 60_000
/** Lo que lleve más de esto sin enviarse ya no se envía (p. ej. Mirai no tenía correo activo). */
const VIEJO_MS = 48 * 3_600_000

export type FamiliaRow = { id: string; book_id: string; user_id: string; actor_id: string; n: number; lineas: string[]; href: string | null; updated_at: string }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
const MONEY = /\$\s?[\d.]+/g

/** Canales externos por los que sale este aviso para esta persona (puro: lo prueba familia.test.ts). */
export function canalesFamilia(rule: Rule, ready: Record<Canal, boolean>, hora: number): Canal[] {
  if (rule.notif?.familia === false) return []
  return (["email", "whatsapp", "push", "telegram"] as const).filter((c) =>
    ready[c] && !!rule.canales[c] && onFor(rule.matriz, "familia", c) && !(c === "push" && enSilencio(hora, rule.silencio)))
}

/** Mensaje del aviso en cada formato. Con "ocultar montos", los valores no salen del celular. */
export function familiaMsg(o: { nombre: string; quien: string; libro: string; row: Pick<FamiliaRow, "n" | "lineas" | "href">; hide: boolean; siteUrl: string }): Msg {
  const first = o.nombre.split(" ")[0] || ""
  const quien = o.quien.split(" ")[0] || "Alguien del hogar"
  const titulo = o.row.n === 1 ? `${quien} registró un movimiento` : `${quien} registró ${o.row.n} movimientos`
  const lineas = o.row.lineas.slice(0, 10).map((l) => (o.hide ? l.replace(/ · \$\s?[\d.]+$/, "").replace(MONEY, "") : l))
  const mas = o.row.n > lineas.length ? `…y ${o.row.n - lineas.length} más` : ""
  const url = `${o.siteUrl}${o.row.href || "/gastos-todos"}`
  const enLibro = o.libro ? ` en «${o.libro}»` : ""
  const texto = [...lineas, mas].filter(Boolean)
  return {
    subject: `Mirai: ${titulo}`,
    html: brandEmail(`${first ? `${esc(first)}, ` : ""}${esc(titulo.charAt(0).toLowerCase() + titulo.slice(1))}${esc(enLibro)}`,
      `<ul style="padding-left:18px;margin:12px 0">${texto.map((l) => `<li style="margin:4px 0">${esc(l)}</li>`).join("")}</ul><p style="margin-top:20px"><a href="${url}" style="background:#1F2B4B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Verlo en Mirai</a></p>`,
      { footer: "Te llega porque compartes este libro. Apágalo en Ajustes › Alertas › Movimientos de tu familia." }),
    text: `Hola ${first}. ${titulo}${enLibro}:\n${texto.map((l) => `• ${l}`).join("\n")}\n\n${url}`,
    push: { title: titulo, body: texto.slice(0, 3).join(" · ").slice(0, 180) },
    wa: { nombre: first, cantidad: String(o.row.n), resumen: `${titulo}${enLibro}:\n${texto.join("\n")}`, fecha: "", enlace: url, titulo, detalle: texto[0] ?? "", monto: o.hide ? "" : (texto[0]?.match(MONEY)?.[0] ?? "") },
    caso: "resumen",
  }
}

/**
 * Envía los avisos de la familia que ya están "quietos". Devuelve cuántos mensajes salieron (en simulación, cuántos
 * avisos se revisarían). Cada aviso se toma una sola vez (sent_at) y cada canal tiene su clave de no-duplicado.
 */
export async function familiaAvisos(now = new Date(), o: { dry?: boolean } = {}): Promise<number> {
  const db = rt().admin()
  const { data: rows } = await db.from("family_activity").select("id,book_id,user_id,actor_id,n,lineas,href,updated_at").is("sent_at", null)
    .lte("updated_at", new Date(now.getTime() - QUIETO_MS).toISOString()).order("updated_at").limit(300)
  const list = (rows ?? []) as FamiliaRow[]
  if (!list.length || o.dry) return list.length
  const old = list.filter((r) => now.getTime() - Date.parse(r.updated_at) > VIEJO_MS).map((r) => r.id)
  if (old.length) await db.from("family_activity").update({ sent_at: now.toISOString() }).in("id", old)
  const live = list.filter((r) => !old.includes(r.id))
  if (!live.length) return 0
  const users = [...new Set(live.flatMap((r) => [r.user_id, r.actor_id]))]
  const books = [...new Set(live.map((r) => r.book_id))]
  const [{ data: profs }, { data: bks }, { data: rules }] = await Promise.all([
    db.from("profiles").select("id,email,nombre,apodo").in("id", users),
    db.from("books").select("id,nombre,household_id").in("id", books),
    db.from("notification_rules").select("*").in("book_id", books),
  ])
  const prof = new Map((profs ?? []).map((p) => [p.id, p as { id: string; email: string | null; nombre: string | null; apodo?: string | null }]))
  const book = new Map((bks ?? []).map((b) => [b.id, b as { id: string; nombre: string | null; household_id: string }]))
  const ruleOf = new Map(((rules ?? []) as Rule[]).map((r) => [`${r.user_id}:${r.book_id}`, r]))
  const ready = new Map<string, Promise<Record<Canal, boolean>>>()
  const hora = horaBogota(now)
  let sent = 0
  for (const r of live) {
    // Se toma una sola vez aunque corran dos instancias de la API a la vez.
    const { data: claimed } = await db.from("family_activity").update({ sent_at: now.toISOString() }).eq("id", r.id).is("sent_at", null).select("id")
    if (!claimed?.length) continue
    const b = book.get(r.book_id)
    const p = prof.get(r.user_id)
    if (!b || !p) continue
    if (!ready.has(b.household_id)) ready.set(b.household_id, channelStatus(b.household_id))
    const rule = ruleOf.get(`${r.user_id}:${r.book_id}`) ?? defaultRule(r.user_id, r.book_id)
    const canales = canalesFamilia(rule, await ready.get(b.household_id)!, hora)
    if (!canales.length) continue
    const actor = prof.get(r.actor_id)
    const m = familiaMsg({ nombre: p.nombre ?? "", quien: actor?.apodo || actor?.nombre || "", libro: b.nombre ?? "", row: r, hide: rule.ocultar_montos, siteUrl: rt().siteUrl() })
    for (const canal of canales) {
      try {
        const x = await deliverOnce({ householdId: b.household_id, userId: r.user_id, bookId: r.book_id, canal, emailTo: rule.email_to || p.email || "", whatsappTo: rule.whatsapp_to, kind: "familia", dedupe: `fam:${r.id}:${canal}` }, m)
        if (x.sent) sent++
      } catch { /* quedó en el registro de envíos (consola › Envíos) */ }
    }
  }
  return sent
}
