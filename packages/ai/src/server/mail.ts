// Compras del correo del banco en Gmail (mailScan de la v4): antes scanMail de apps/web/features/correo/actions.ts. F2-E
// dejó Google (OAuth, Calendar) en @mirai/services y esto quedó para F2-F porque usa la IA. La web (Server Action) y la
// API (POST /v1/books/:b/mail/scan) revisan el rol (editor) antes. Solo servidor.
import { z } from "zod"
import { can } from "@mirai/domain/plans"
import { googleFetch } from "@mirai/services/google/oauth"
import { aiObject } from "../run"
import { mailMayBePurchase } from "../router"
import { clip } from "../compact"
import { aiSettings } from "../model"
import { MAILQ_DEFAULT } from "../mail-query"
import { whoOf, type AiCtx, type Sb } from "./ctx"

export { MAILQ_DEFAULT }


export type MailRow = { id: string; fecha: string; comercio: string; valor: number; asunto: string; remitente: string }
export type MailScan = { ok: boolean; rows: MailRow[]; msg?: string; ia?: boolean }

type GMsg = { id: string; snippet: string; internalDate: string; payload?: { headers?: { name: string; value: string }[] } }
/** Gmail de la persona (googleFetch de @mirai/services; las pruebas lo cambian por un doble). */
export type GmailFetch = <T>(userId: string, url: string) => Promise<T>
const gmail: GmailFetch = (userId, url) => googleFetch(userId, "gmail", url)

const hdr = (m: { payload?: { headers?: { name: string; value: string }[] } }, n: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? ""
const pnum = (s: string) => { const t = s.replace(/\s/g, ""); const v = /,\d{2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."); return Math.round(parseFloat(v) || 0) }

/** Lee las notificaciones del banco en Gmail y extrae las compras nuevas (sin las que ya se importaron). */
export async function scanMailWith(ctx: AiCtx, sb: Sb, query?: string, fetchGmail: GmailFetch = gmail): Promise<MailScan> {
  if (!can(ctx.plan, "banco")) return { ok: false, rows: [], msg: "Leer el correo del banco no está incluido en tu plan." }
  const q = (query || MAILQ_DEFAULT).slice(0, 1000)
  let list: { messages?: { id: string }[] }
  try { list = await fetchGmail(ctx.user.id, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=40&q=${encodeURIComponent(q)}`) }
  catch (e) { return { ok: false, rows: [], msg: (e as Error).message } }
  const ids = (list.messages ?? []).map((m) => m.id)
  if (!ids.length) return { ok: true, rows: [] }
  const { data: seen } = await sb.from("expenses").select("external_id").eq("book_id", ctx.book.id).in("external_id", ids.map((i) => `gmail:${i}`))
  const done = new Set((seen ?? []).map((x) => x.external_id))
  const nuevos = ids.filter((i) => !done.has(`gmail:${i}`))
  const msgs = await Promise.all(nuevos.map((id) => fetchGmail<GMsg>(ctx.user.id, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`).catch(() => null)))
  const correos = msgs.filter(Boolean).map((m, i) => ({ i, id: m!.id, asunto: hdr(m!, "subject"), texto: m!.snippet, fecha_correo: new Date(+m!.internalDate).toISOString().slice(0, 10), remitente: hdr(m!, "from") }))
  if (!correos.length) return { ok: true, rows: [] }
  const ia = await aiSettings(ctx.book.id)
  // Sin un monto no puede ser una compra (publicidad, avisos de seguridad…): esos ni se le mandan a la IA.
  const candidatos = correos.filter((c) => mailMayBePurchase(`${c.asunto} ${c.texto}`))
  if (!candidatos.length) return { ok: true, rows: [] }
  if (ia.on !== false) {
    try {
      const { object } = await aiObject({
        ...whoOf(ctx), feature: "correo_banco",
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
