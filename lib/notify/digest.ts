import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { loadBookData } from "@/lib/book-data"
import { notifs, todayBogota, type Notif } from "@/lib/domain"
import { getIntegration } from "@/features/integrations/store"
import { AVISOS, avisoOf, enSilencio, maskDest, onFor, type Canales, type CanalKey, type Matriz } from "./rules"
import { brandEmail, EMAIL_KINDS, sendEmail } from "./email"
import { fallbackNote, pushReady, sendPush, sendTelegram, sendWhatsApp } from "./channels"
import { caseOfDigest, formatCoPhone, normalizeCoPhone, type WaCase, type WaValues } from "./whatsapp"
import { logSend } from "./log"
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

/** Primer proveedor de correo que Mirai tiene activo para el hogar (lo configura el administrador). */
async function emailProvider(householdId: string) {
  for (const k of EMAIL_KINDS) { const v = await getIntegration(householdId, k); if (v?.enabled) return v }
  return null
}

export type Canal = Exclude<CanalKey, "app">

/** Mensaje si Mirai aún no ofrece un canal (lo activa el administrador en la consola). */
export const NOT_READY: Record<Canal, string> = {
  email: "Mirai aún no tiene activo el envío por correo. Lo activa el administrador de Mirai.",
  whatsapp: "Mirai aún no tiene activo el envío por WhatsApp. Lo activa el administrador de Mirai.",
  telegram: "Mirai aún no tiene activo Telegram. Lo activa el administrador de Mirai.",
  push: "Las notificaciones push no están configuradas en este despliegue.",
}

/** ¿Qué canales ofrece Mirai a este hogar? (para Ajustes › Alertas). */
export async function channelStatus(householdId: string): Promise<Record<Canal, boolean>> {
  const [email, telegram, whatsapp, push] = await Promise.all([emailProvider(householdId), getIntegration(householdId, "telegram"), getIntegration(householdId, "whatsapp"), getIntegration(householdId, "webpush")])
  return { email: !!email, telegram: !!telegram?.secrets.botToken, whatsapp: !!(whatsapp?.secrets.token && whatsapp.config.phoneId), push: !!push && pushReady() }
}

/** Contenido de un envío en cada formato (correo, texto, push y parámetros de la plantilla de WhatsApp). */
export type Msg = { subject: string; html: string; text: string; push: { title: string; body: string }; wa: WaValues; /** Caso de WhatsApp (plantilla que se usa). */ caso: WaCase }

const fechaHoy = () => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long" }).format(new Date())

export function digestMsg(nombre: string, list: Notif[], hide: boolean): Msg {
  const top = list.slice(0, 15).map((n) => line(n, hide))
  return {
    subject: digestSubject(list.length), html: digestHtml(nombre, list, hide), text: digestText(nombre, list, hide),
    push: { title: digestSubject(list.length), body: list.slice(0, 3).map((x) => x.t).join(" · ") },
    wa: {
      nombre: nombre.split(" ")[0] || "", cantidad: String(list.length), resumen: top.join("\n") + (list.length > 15 ? `\n…y ${list.length - 15} avisos más.` : ""), fecha: fechaHoy(), enlace: `${siteUrl()}/${list.length === 1 ? list[0].go : "inicio"}`,
      titulo: list[0]?.t ?? "", detalle: list[0] ? (hide ? list[0].b.replace(MONEY, "").replace(/\s+/g, " ").trim() : list[0].b) : "", monto: hide ? "" : list[0]?.b.match(MONEY)?.[0] ?? "",
    },
    caso: caseOfDigest(list.map((n) => avisoOf(n.id))),
  }
}

export function testMsg(nombre: string): Msg {
  const first = nombre.split(" ")[0] || ""
  const body = "Este es un mensaje de prueba de Mirai. Así te llegará el resumen de tus pagos y cobros."
  return {
    subject: "Mirai: mensaje de prueba", text: `Hola ${first}. ${body}`,
    html: brandEmail(`¡Hola${first ? `, ${esc(first)}` : ""}! Tus avisos por correo funcionan`, `<p>${body}</p><p style="margin-top:20px"><a href="${siteUrl()}/ajustes?tab=alertas" style="background:#1F2B4B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Ver mis alertas</a></p>`),
    push: { title: "Mirai: mensaje de prueba", body: "Así te llegarán los avisos." },
    wa: { nombre: first, cantidad: "0", resumen: body.replace(/\.$/, ""), fecha: fechaHoy(), enlace: `${siteUrl()}/inicio`, titulo: "Mensaje de prueba", detalle: "Así te llegarán los avisos", monto: "" },
    caso: "prueba",
  }
}

/**
 * Envía un mensaje por un canal externo con el servicio que Mirai tiene activo y registra el intento
 * (notification_log). Devuelve un mensaje para el usuario; si falla, lanza el error legible (ya registrado).
 */
export async function deliver(o: { householdId: string; userId: string; canal: Canal; emailTo: string; whatsappTo: string | null; kind: string }, m: Msg): Promise<string> {
  const log = { user_id: o.userId, household_id: o.householdId, channel: o.canal, kind: o.kind }
  let provider: string | null = null, source: string | null = null, destino: string | null = null
  try {
    let msg: string, ref: string | null = null, nota: string | null = null
    if (o.canal === "email") {
      const v = await emailProvider(o.householdId)
      if (!v) throw new Error(NOT_READY.email)
      provider = v.kind; source = v.source ?? null; destino = maskDest("email", o.emailTo)
      if (!o.emailTo) throw new Error("No hay un correo de destino.")
      ref = await sendEmail(v, { to: o.emailTo, subject: m.subject, html: m.html, text: m.text })
      msg = `Enviado a ${o.emailTo}.`
    } else if (o.canal === "telegram") {
      const v = await getIntegration(o.householdId, "telegram")
      if (!v?.secrets.botToken) throw new Error(NOT_READY.telegram)
      provider = "telegram"; source = v.source ?? null
      const { data: link } = await supabaseAdmin().from("telegram_links").select("chat_id").eq("user_id", o.userId).maybeSingle()
      if (!link?.chat_id) throw new Error("Primero vincula tu chat de Telegram.")
      destino = maskDest("telegram", link.chat_id)
      const r = await sendTelegram(v, link.chat_id, m.text) as { message_id?: number }
      ref = r?.message_id ? String(r.message_id) : null
      msg = "Enviado a tu Telegram."
    } else if (o.canal === "whatsapp") {
      const v = await getIntegration(o.householdId, "whatsapp")
      if (!v?.secrets.token) throw new Error(NOT_READY.whatsapp)
      provider = "whatsapp"; source = v.source ?? null; destino = maskDest("whatsapp", normalizeCoPhone(o.whatsappTo) ?? o.whatsappTo)
      if (!o.whatsappTo) throw new Error("Escribe tu número de WhatsApp en Ajustes › Alertas.")
      const r = await sendWhatsApp(v, o.whatsappTo, m.wa, { caso: m.caso, text: m.text })
      ref = r.id
      nota = fallbackNote(r.fallback)
      msg = `Enviado a tu WhatsApp (${formatCoPhone(r.to)}).${nota ? ` ${nota}` : ""}`
    } else {
      provider = "webpush"
      if (!pushReady()) throw new Error(NOT_READY.push)
      const n = await sendPush(o.userId, { title: m.push.title, body: m.push.body, url: "/inicio", tag: "mirai-digest" })
      destino = `${n} dispositivo${n === 1 ? "" : "s"}`
      if (!n) throw new Error("No tienes dispositivos con push activado. Actívalo en este celular o computador.")
      msg = `Enviado a ${n} dispositivo${n === 1 ? "" : "s"}.`
    }
    await logSend({ ...log, status: "enviado", provider, source, destino, ref, error: nota })
    return msg
  } catch (e) {
    const msg = (e as Error).message || "Error desconocido"
    await logSend({ ...log, status: "fallido", provider, source, destino, error: msg })
    throw new Error(msg)
  }
}

/** Envía el resumen por un canal externo. Devuelve un mensaje para el usuario. */
export async function sendDigest(o: { householdId: string; rule: Rule; canal: Canal; email: string; nombre: string; force?: boolean }) {
  const { rule, canal } = o
  const list = await avisosPara(rule.book_id, rule, canal)
  if (!list.length && !o.force) return { sent: false, msg: "No tienes avisos pendientes para enviar." }
  const m = list.length ? digestMsg(o.nombre, list, rule.ocultar_montos) : testMsg(o.nombre)
  const msg = await deliver({ householdId: o.householdId, userId: rule.user_id, canal, emailTo: rule.email_to || o.email, whatsappTo: rule.whatsapp_to, kind: list.length ? "resumen" : "prueba" }, m)
  return { sent: true, msg: list.length ? `Resumen ${msg.charAt(0).toLowerCase()}${msg.slice(1)}` : msg }
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
