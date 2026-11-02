import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { loadBookData } from "@/lib/book-data"
import { conFechasDian, fechasDian, miSaldoGrupo, notifs, todayBogota, type AvisoExtras, type Notif, type NotifFlags, type RentaFecha, type RentaRegimen } from "@/lib/domain"
import { getIntegration } from "@/features/integrations/store"
import { AVISOS, avisoOf, enSilencio, maskDest, onFor, type Canales, type CanalKey, type Matriz } from "./rules"
import { brandEmail, EMAIL_KINDS, sendEmail } from "./email"
import { fallbackNote, pushReady, sendPush, sendTelegram, sendWhatsApp } from "./channels"
import { caseOfDigest, formatCoPhone, normalizeCoPhone, type WaCase, type WaValues } from "./whatsapp"
import { claimSend, finishSend, logSend } from "./log"
import { resumenKey, tocaResumen } from "./schedule"
import { siteUrl } from "@/lib/site-url"

const MONEY = /\$\s?[\d.]+(,\d+)?/g

export type Rule = {
  user_id: string; book_id: string; matriz: Matriz; canales: Canales; hora: number; frecuencia: string
  silencio: { on?: boolean; desde?: number; hasta?: number }; ocultar_montos: boolean; email_to: string | null; whatsapp_to: string | null; last_sent: Record<string, string>
  /** Interruptores de cada tipo de aviso de esta persona (sobre los del libro). */
  notif?: NotifFlags | null
}

export const defaultRule = (user_id: string, book_id: string): Rule => ({
  user_id, book_id, matriz: {}, canales: { app: true, popup: true }, hora: 7, frecuencia: "diario", silencio: { on: false, desde: 22, hasta: 7 }, ocultar_montos: false, email_to: null, whatsapp_to: null, last_sent: {}, notif: null,
})

/** Hora actual en Colombia (0–23). */
export const horaBogota = (now = new Date()) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "numeric", hourCycle: "h23" }).format(now))

/** Referencias de la renta (calendario DIAN): cambian una vez al año, se leen una vez por proceso cada 6 horas. */
let rentaRef: { at: number; filas: RentaFecha[]; regimenes: RentaRegimen[] } | null = null
async function rentaRefs() {
  if (rentaRef && Date.now() - rentaRef.at < 6 * 3_600_000) return rentaRef
  const db = supabaseAdmin()
  const [{ data: filas }, { data: regs }] = await Promise.all([db.from("ref_renta_calendar").select("year,digitos,regimen,fecha"), db.from("ref_renta_regimenes").select("key,nombre,seccionales")])
  rentaRef = { at: Date.now(), filas: (filas ?? []).map((f) => ({ ...f, year: +f.year, fecha: String(f.fecha).slice(0, 10) })), regimenes: (regs ?? []) as RentaRegimen[] }
  return rentaRef
}

/**
 * Lo que necesitan los avisos de una persona y que no viene en el libro: sus fechas DIAN (por su cédula), las mesadas
 * del libro y su saldo en cada grupo de gastos compartidos.
 */
export async function avisoCtx(bookId: string, userId: string) {
  const db = supabaseAdmin()
  const [b, { data: prof }, { data: alw }, { data: groups }] = await Promise.all([
    loadBookData(db, bookId),
    db.from("profiles").select("nombre,digitos,ciudad").eq("id", userId).maybeSingle(),
    db.from("allowances").select("id,member_id,mesada,frec").eq("book_id", bookId).is("deleted_at", null),
    db.from("shared_groups").select("id,nombre,personas").eq("book_id", bookId).is("deleted_at", null),
  ])
  const extras: AvisoExtras = {}
  if (alw?.length) {
    const [{ data: fm }, { data: movs }] = await Promise.all([
      db.from("family_members").select("id,nombre").in("id", alw.map((a) => a.member_id)),
      db.from("allowance_movements").select("allowance_id,fecha,valor").eq("book_id", bookId).is("deleted_at", null).gt("valor", 0).order("fecha", { ascending: false }).limit(500),
    ])
    extras.mesadas = alw.map((a) => ({ id: a.id, nombre: fm?.find((m) => m.id === a.member_id)?.nombre ?? "", mesada: +a.mesada, frec: a.frec, ultima: movs?.find((x) => x.allowance_id === a.id)?.fecha ?? null }))
  }
  if (groups?.length && prof?.nombre) {
    const { data: gg } = await db.from("shared_group_expenses").select("group_id,valor,paga,entre").eq("book_id", bookId).is("deleted_at", null)
    extras.compartidos = groups.flatMap((g) => {
      const saldo = miSaldoGrupo(g.personas, (gg ?? []).filter((x) => x.group_id === g.id).map((x) => ({ valor: +x.valor, paga: x.paga, entre: x.entre })), prof.nombre)
      return saldo === null ? [] : [{ id: g.id, nombre: g.nombre, saldo }]
    })
  }
  const dian = /^\d{2}$/.test(prof?.digitos ?? "") ? fechasDian({ digitos: prof!.digitos, ...(await rentaRefs()), ciudad: prof?.ciudad, eventos: b.calendarEvents }) : []
  return { book: conFechasDian(b, dian), extras }
}

/** Todos los avisos de hoy para una persona en un libro (sin filtrar por canal). */
export async function avisosDe(bookId: string, rule: Rule, today = todayBogota()) {
  const { book, extras } = await avisoCtx(bookId, rule.user_id)
  return notifs(book, today, { notif: rule.notif, extras })
}

/** Avisos que salen por un canal según la matriz de la persona. */
export const paraCanal = (list: Notif[], rule: Rule, canal: CanalKey) => list.filter((n) => onFor(rule.matriz, avisoOf(n.id), canal))

/** Avisos del libro para un canal según la matriz y los interruptores de la persona. */
export async function avisosPara(bookId: string, rule: Rule, canal: CanalKey) {
  return paraCanal(await avisosDe(bookId, rule), rule, canal)
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
export async function emailProvider(householdId: string) {
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
export async function deliver(o: { householdId: string; userId: string; canal: Canal; emailTo: string; whatsappTo: string | null; kind: string; bookId?: string | null; /** Fila ya reclamada con claimSend (se cierra en lugar de crear otra). */ claimId?: number | null }, m: Msg): Promise<string> {
  const log = { user_id: o.userId, household_id: o.householdId, book_id: o.bookId ?? null, channel: o.canal, kind: o.kind }
  const close = (l: Parameters<typeof logSend>[0]) => (o.claimId ? finishSend(o.claimId, l) : logSend(l))
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
    await close({ ...log, status: "enviado", provider, source, destino, ref, error: nota })
    return msg
  } catch (e) {
    const msg = (e as Error).message || "Error desconocido"
    await close({ ...log, status: "fallido", provider, source, destino, error: msg })
    throw new Error(msg)
  }
}

/**
 * Envía UNA sola vez por clave (`dedupe`): reclama el envío en notification_log antes de hacerlo. Si ya salió, se está
 * enviando en otra pasada o ya falló MAX_FALLOS veces, no hace nada (`sent: false`).
 */
export async function deliverOnce(o: Parameters<typeof deliver>[0] & { dedupe: string }, m: Msg): Promise<{ sent: boolean; msg: string }> {
  const claimId = await claimSend({ dedupe: o.dedupe, userId: o.userId, householdId: o.householdId, bookId: o.bookId, channel: o.canal, kind: o.kind })
  if (!claimId) return { sent: false, msg: "Ya se había enviado." }
  return { sent: true, msg: await deliver({ ...o, claimId }, m) }
}

/** Envía el resumen por un canal externo ("Enviar resumen ahora": a pedido, sin clave de no-duplicado). Devuelve un mensaje para el usuario. */
export async function sendDigest(o: { householdId: string; rule: Rule; canal: Canal; email: string; nombre: string; force?: boolean; list?: Notif[] }) {
  const { rule, canal } = o
  const list = o.list ?? (await avisosPara(rule.book_id, rule, canal))
  if (!list.length && !o.force) return { sent: false, msg: "No tienes avisos pendientes para enviar." }
  const m = list.length ? digestMsg(o.nombre, list, rule.ocultar_montos) : testMsg(o.nombre)
  const msg = await deliver({ householdId: o.householdId, userId: rule.user_id, bookId: rule.book_id, canal, emailTo: rule.email_to || o.email, whatsappTo: rule.whatsapp_to, kind: list.length ? "resumen" : "prueba" }, m)
  return { sent: true, msg: list.length ? `Resumen ${msg.charAt(0).toLowerCase()}${msg.slice(1)}` : msg }
}

/** ¿La persona tiene a dónde recibir por este canal? (sin destino no se intenta ni se registra un fallo en cada pasada). */
async function tieneDestino(rule: Rule, canal: Canal, email: string) {
  if (canal === "email") return !!(rule.email_to || email)
  if (canal === "whatsapp") return !!normalizeCoPhone(rule.whatsapp_to)
  if (canal === "telegram") return !!(await supabaseAdmin().from("telegram_links").select("chat_id").eq("user_id", rule.user_id).maybeSingle()).data?.chat_id
  return !!(await supabaseAdmin().from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", rule.user_id)).count
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

/**
 * Proceso del cron para una regla: avisos en la app (campana) y, si es su hora, el resumen por cada canal externo.
 * - `horario`: el cron horario está vivo (lib/notify/schedule.ts); entonces se respeta la hora elegida también en la
 *   pasada diaria. Sin él, la pasada diaria envía a todos.
 * - Cada resumen se reclama con su clave (resumen:<persona>:<libro>:<canal>:<día>): nunca sale dos veces el mismo día.
 * - `ready`: canales que Mirai ofrece al hogar. Un canal no disponible o sin destino no se intenta (no llena el registro de fallos).
 */
export async function runRule(o: { householdId: string; rule: Rule; email: string; nombre: string; now?: Date; daily?: boolean; horario?: boolean; ready?: Record<Canal, boolean> }) {
  const { rule } = o
  const now = o.now ?? new Date()
  const hoy = todayBogota(now)
  const h = horaBogota(now)
  const out: string[] = []
  const list = await avisosDe(rule.book_id, rule, hoy)
  await upsertAppNotifs(rule, paraCanal(list, rule, "app"))
  if (!tocaResumen({ frecuencia: rule.frecuencia, hora: rule.hora, hoy, h, daily: !!o.daily, horario: !!o.horario })) return out
  const ready = o.ready ?? (await channelStatus(o.householdId))
  const sent = { ...rule.last_sent }
  for (const canal of ["email", "telegram", "push", "whatsapp"] as const) {
    if (!rule.canales[canal] || sent[canal] === hoy || !ready[canal]) continue
    if (canal === "push" && enSilencio(h, rule.silencio)) continue
    if (!(await tieneDestino(rule, canal, o.email))) continue
    const mine = paraCanal(list, rule, canal)
    // Sin avisos para este canal no se envía nada; el día queda marcado (como en la versión anterior).
    if (!mine.length) { sent[canal] = hoy; continue }
    try {
      const r = await deliverOnce({ householdId: o.householdId, userId: rule.user_id, bookId: rule.book_id, canal, emailTo: rule.email_to || o.email, whatsappTo: rule.whatsapp_to, kind: "resumen", dedupe: resumenKey(rule.user_id, rule.book_id, canal, hoy) }, digestMsg(o.nombre, mine, rule.ocultar_montos))
      out.push(`${canal}: ${r.sent ? "ok" : "ya enviado"}`)
      sent[canal] = hoy
    } catch (e) { out.push(`${canal}: ${(e as Error).message}`) }
  }
  if (JSON.stringify(sent) !== JSON.stringify(rule.last_sent ?? {}))
    await supabaseAdmin().from("notification_rules").update({ last_sent: sent }).eq("user_id", rule.user_id).eq("book_id", rule.book_id)
  return out
}
