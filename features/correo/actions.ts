"use server"

import { createHash } from "node:crypto"
import { z } from "zod"
import { requireRole } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { supabaseServer } from "@/utils/supabase/server"
import { googleFetch, googleToken } from "@/lib/google"
import { aiObject } from "@/lib/ai/run"
import { aiSettings } from "@/lib/ai/model"
import { loadBookData } from "@/lib/book-data"
import { agenda, todayBogota } from "@/lib/domain"
import { getIntegration } from "@/features/integrations/store"
import { MAILQ_DEFAULT } from "./query"

export type MailRow = { id: string; fecha: string; comercio: string; valor: number; asunto: string; remitente: string }

const hdr = (m: { payload?: { headers?: { name: string; value: string }[] } }, n: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? ""
const pnum = (s: string) => { const t = s.replace(/\s/g, ""); const v = /,\d{2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."); return Math.round(parseFloat(v) || 0) }

/** Lee las notificaciones del banco en Gmail y extrae las compras (mailScan de la v4). */
export async function scanMail(query?: string): Promise<{ ok: boolean; rows: MailRow[]; msg?: string; ia?: boolean }> {
  const ctx = await requireRole("editor")
  if (ctx.plan !== "premium") return { ok: false, rows: [], msg: "Leer el correo del banco es parte de Mirai Premium." }
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
  if (ia.on !== false) {
    try {
      const { object } = await aiObject({
        householdId: ctx.household.id, bookId: ctx.book.id,
        schema: z.object({ items: z.array(z.object({ i: z.number(), es_gasto: z.boolean(), fecha: z.string(), comercio: z.string(), valor: z.number() })) }),
        prompt: `Extrae compras, pagos o débitos de estas notificaciones bancarias colombianas. Ignora publicidad, ofertas, extractos y abonos/ingresos. "valor" en pesos sin puntos. "fecha" YYYY-MM-DD; si no hay fecha clara usa la del correo. "comercio": nombre corto.\nCORREOS: ${JSON.stringify(correos.map(({ i, asunto, texto, fecha_correo, remitente }) => ({ i, asunto, texto, fecha_correo, remitente })))}`,
      })
      const rows = object.items.filter((x) => x.es_gasto && x.valor > 0 && correos[x.i]).map((x) => { const c = correos[x.i]; return { id: c.id, fecha: /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) ? x.fecha : c.fecha_correo, comercio: x.comercio.slice(0, 80), valor: Math.round(x.valor), asunto: c.asunto, remitente: c.remitente } })
      return { ok: true, rows, ia: true }
    } catch { /* respaldo sin IA */ }
  }
  const rows = correos.map((c) => {
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

/** Lleva los próximos pagos y cobros (45 días) a Google Calendar. Ids estables: no duplica. */
export async function syncCalendar(): Promise<{ ok: boolean; msg: string }> {
  const ctx = await requireRole("viewer")
  if (ctx.plan !== "premium") return { ok: false, msg: "Llevar tus pagos a Google Calendar es parte de Mirai Premium." }
  try {
    await googleToken(ctx.user.id, "calendar")
    const cfg = await getIntegration(ctx.household.id, "google_calendar")
    const cal = encodeURIComponent(String(cfg?.config.calendarId || "primary"))
    const sb = await supabaseServer()
    const today = todayBogota()
    const items = agenda(await loadBookData(sb, ctx.book.id), today).filter((x) => x.d >= 0 && x.d <= 45)
    let n = 0
    for (const x of items) {
      const id = createHash("sha1").update(`${ctx.book.id}|${x.k}|${x.id}|${x.fecha}`).digest("hex").slice(0, 32) // base32hex válido (0-9a-f)
      const end = new Date(`${x.fecha}T12:00:00`); end.setDate(end.getDate() + 1)
      const body = { id, summary: `${x.dir === "cobrar" ? "Cobrar" : "Pagar"}: ${x.titulo}`, description: `${x.sub}\nValor: $${Math.round(x.monto).toLocaleString("es-CO")}\nDesde Mirai`, start: { date: x.fecha }, end: { date: end.toISOString().slice(0, 10) }, reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 9 * 60 }] } }
      try { await googleFetch(ctx.user.id, "calendar", `https://www.googleapis.com/calendar/v3/calendars/${cal}/events`, { method: "POST", body: JSON.stringify(body) }); n++ }
      catch (e) { if (!/already exists|duplicate|409/i.test((e as Error).message)) throw e }
    }
    return { ok: true, msg: n ? `Llevamos ${n} pago${n === 1 ? "" : "s"} a tu Google Calendar.` : "Tu calendario ya estaba al día." }
  } catch (e) { return { ok: false, msg: (e as Error).message } }
}
