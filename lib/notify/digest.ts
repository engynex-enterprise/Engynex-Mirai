import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { loadBookData } from "@/lib/book-data"
import { notifs, todayBogota, type Notif } from "@/lib/domain"
import { getIntegration } from "@/features/integrations/store"
import { AVISOS, avisoOf, enSilencio, onFor, type Canales, type CanalKey, type Matriz } from "./rules"
import { brandEmail, EMAIL_KINDS, sendEmail } from "./email"
import { pushReady, sendPush, sendTelegram, sendWhatsApp } from "./channels"
import { siteUrl } from "@/lib/site-url"

const MONEY = /\$\s?[\d.]+(,\d+)?/g

export type Rule = {
  user_id: string; book_id: string; matriz: Matriz; canales: Canales; hora: number; frecuencia: string
  silencio: { on?: boolean; desde?: number; hasta?: number }; ocultar_montos: boolean; email_to: string | null; whatsapp_to: string | null; last_sent: Record<string, string>
}

export const defaultRule = (user_id: string, book_id: string): Rule => ({
  user_id, book_id, matriz: {}, canales: { app: true, popup: true }, hora: 7, frecuencia: "diario", silencio: { on: false, desde: 22, hasta: 7 }, ocultar_montos: false, email_to: null, whatsapp_to: null, last_sent: {},
})

/** Hora actual en Colombia (0–23). */
export const horaBogota = (now = new Date()) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "numeric", hourCycle: "h23" }).format(now))

/** Avisos del libro para un canal según la matriz del usuario. */
export async function avisosPara(bookId: string, rule: Rule, canal: CanalKey) {
  const b = await loadBookData(supabaseAdmin(), bookId)
  return notifs(b, todayBogota()).filter((n) => onFor(rule.matriz, avisoOf(n.id), canal))
}

/** Línea del resumen (nLine de la v4): sin montos si el usuario lo pidió. */
const line = (n: Notif, hide: boolean) => `• ${n.t} — ${hide ? n.b.replace(MONEY, "").replace(/\s+/g, " ").trim() : n.b}`

/** Texto del resumen (digestText de la v4: máximo 15 líneas). */
export function digestText(nombre: string, list: Notif[], hide: boolean) {
  const fecha = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long" }).format(new Date())
  const top = list.slice(0, 15).map((n) => line(n, hide))
  const more = list.length > 15 ? `\n…y ${list.length - 15} avisos más.` : ""
  return `Hola ${nombre.split(" ")[0] || ""}, este es tu resumen de Mirai (${fecha}):\n\n${top.join("\n")}${more}\n\nAbre Mirai para ver el detalle: ${siteUrl()}/inicio`
}

export const digestSubject = (n: number) => `Mirai: ${n} aviso${n === 1 ? "" : "s"} para hoy`

function digestHtml(nombre: string, list: Notif[], hide: boolean) {
  const rows = list.slice(0, 15).map((n) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee"><b>${esc(n.t)}</b><br><span style="color:#616161">${esc(hide ? n.b.replace(MONEY, "").trim() : n.b)}</span></td></tr>`).join("")
  return brandEmail(`Hola ${esc(nombre.split(" ")[0] || "")}, tienes ${list.length} aviso${list.length === 1 ? "" : "s"}`,
    `<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>${list.length > 15 ? `<p>…y ${list.length - 15} avisos más.</p>` : ""}
     <p style="margin-top:20px"><a href="${siteUrl()}/inicio" style="background:#1F2B4B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Abrir Mirai</a></p>`)
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

/** Primer proveedor de correo activo del hogar. */
async function emailProvider(householdId: string) {
  for (const k of EMAIL_KINDS) { const v = await getIntegration(householdId, k); if (v?.enabled) return v }
  return null
}

/** Envía el resumen por un canal externo. Devuelve un mensaje para el usuario. */
export async function sendDigest(o: { householdId: string; rule: Rule; canal: Exclude<CanalKey, "app">; email: string; nombre: string; force?: boolean }) {
  const { rule, canal } = o
  const list = await avisosPara(rule.book_id, rule, canal)
  if (!list.length && !o.force) return { sent: false, msg: "No tienes avisos pendientes para enviar." }
  const hide = rule.ocultar_montos
  const text = list.length ? digestText(o.nombre, list, hide) : "Prueba de Mirai — Así te llegarán los avisos."
  if (canal === "email") {
    const v = await emailProvider(o.householdId)
    if (!v) throw new Error("Activa un proveedor de correo en Ajustes › Integraciones.")
    const to = rule.email_to || o.email
    await sendEmail(v, { to, subject: list.length ? digestSubject(list.length) : "Prueba de Mirai", html: list.length ? digestHtml(o.nombre, list, hide) : brandEmail("Prueba de Mirai", "<p>¡Hola! Así te llegarán los avisos de Mirai.</p>"), text })
    return { sent: true, msg: `Resumen enviado a ${to}.` }
  }
  if (canal === "telegram") {
    const v = await getIntegration(o.householdId, "telegram")
    if (!v?.enabled) throw new Error("Activa Telegram en Ajustes › Integraciones.")
    const { data: link } = await supabaseAdmin().from("telegram_links").select("chat_id").eq("user_id", rule.user_id).maybeSingle()
    if (!link?.chat_id) throw new Error("Primero vincula tu chat de Telegram.")
    await sendTelegram(v, link.chat_id, text)
    return { sent: true, msg: "Resumen enviado a tu Telegram." }
  }
  if (canal === "whatsapp") {
    const v = await getIntegration(o.householdId, "whatsapp")
    if (!v?.enabled) throw new Error("Activa WhatsApp Cloud API en Ajustes › Integraciones.")
    if (!rule.whatsapp_to) throw new Error("Escribe tu número de WhatsApp.")
    await sendWhatsApp(v, rule.whatsapp_to, text)
    return { sent: true, msg: "Resumen enviado a tu WhatsApp." }
  }
  if (!pushReady()) throw new Error("Las notificaciones push no están configuradas en este despliegue.")
  const n = await sendPush(rule.user_id, { title: list.length ? digestSubject(list.length) : "Prueba de Mirai", body: list.length ? list.slice(0, 3).map((x) => x.t).join(" · ") : "Así te llegarán los avisos.", url: "/inicio", tag: "mirai-digest" })
  if (!n) throw new Error("Este usuario no tiene dispositivos con push activado.")
  return { sent: true, msg: `Aviso enviado a ${n} dispositivo${n === 1 ? "" : "s"}.` }
}

/** Crea los avisos dentro de la app (campana). Sin duplicados gracias a (user_id, dedupe). */
export async function upsertAppNotifs(rule: Rule, list: Notif[]) {
  if (rule.canales.app === false || !list.length) return 0
  const kindOf = Object.fromEntries(AVISOS.map((a) => [a.k, a.kind]))
  const rows = list.map((n) => ({ user_id: rule.user_id, book_id: rule.book_id, kind: kindOf[avisoOf(n.id)], titulo: n.t, cuerpo: n.b, href: `/${n.go}`, dedupe: `${rule.book_id}:${n.id}` }))
  const { error } = await supabaseAdmin().from("notifications").upsert(rows, { onConflict: "user_id,dedupe", ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  return rows.length
}

/** Proceso del cron para una regla: avisos en la app + resúmenes externos si es su hora. */
export async function runRule(o: { householdId: string; rule: Rule; email: string; nombre: string; now?: Date; daily?: boolean }) {
  const { rule } = o
  const now = o.now ?? new Date()
  const hoy = todayBogota(now)
  const h = horaBogota(now)
  const out: string[] = []
  await upsertAppNotifs(rule, await avisosPara(rule.book_id, rule, "app"))
  if (rule.frecuencia === "nunca") return out
  if (rule.frecuencia === "semanal" && new Date(`${hoy}T12:00:00`).getDay() !== 1) return out
  // Con cron horario se respeta la hora elegida; con el cron diario de Vercel se envía en esa única pasada.
  if (!o.daily && h < rule.hora) return out
  const sent = { ...rule.last_sent }
  for (const canal of ["email", "telegram", "push", "whatsapp"] as const) {
    if (!rule.canales[canal] || sent[canal] === hoy) continue
    if (canal === "push" && enSilencio(h, rule.silencio)) continue
    try {
      const r = await sendDigest({ ...o, canal })
      if (r.sent) out.push(`${canal}: ok`)
      sent[canal] = hoy
    } catch (e) { out.push(`${canal}: ${(e as Error).message}`) }
  }
  await supabaseAdmin().from("notification_rules").update({ last_sent: sent }).eq("user_id", rule.user_id).eq("book_id", rule.book_id)
  return out
}
