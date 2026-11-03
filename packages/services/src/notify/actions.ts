// Casos de uso de Ajustes › Alertas, Telegram y el recordatorio de cobro por WhatsApp. Movidos de
// apps/web/features/notify/actions.ts (F2-E-2): la web (Server Actions) y la API (/v1/books/:b/notifications/**) los
// llaman con la persona y el libro ya revisados (sesión, rol y límite de tasa son de cada app). Solo servidor.
// Las condiciones que no se cumplen lanzan ServiceError (mensaje para la persona); un envío que falla lanza el error
// legible del proveedor (ya quedó en notification_log).
import { randomBytes } from "node:crypto"
import { formatCOP, loanEngine, todayBogota } from "@mirai/domain"
import { getIntegration } from "../integrations/store"
import { rt, ServiceError } from "../runtime"
import { fallbackNote, sendWhatsApp, telegramApi } from "./channels"
import { avisosPara, channelStatus, defaultRule, deliver, horaBogota, NOT_READY, sendDigest, testMsg, upsertAppNotifs, type Canal, type Rule } from "./digest"
import { claimSend, finishSend } from "./log"
import { enSilencio, maskDest } from "./rules"
import { caseConfig, formatCoPhone, normalizeCoPhone, waSettings, waValuesFromText } from "./whatsapp"

export const CANALES_EXTERNOS: readonly Canal[] = ["email", "telegram", "push", "whatsapp"]
export const isCanal = (c: string): c is Canal => (CANALES_EXTERNOS as readonly string[]).includes(c)

/** Persona y libro (ya revisados por la app). */
export type Who = { userId: string; householdId: string; bookId: string; email: string; nombre: string }

/** La regla de avisos de la persona en el libro (o la de por defecto si nunca la guardó). */
export async function ruleOf(userId: string, bookId: string): Promise<Rule> {
  const { data } = await rt().admin().from("notification_rules").select("*").eq("user_id", userId).eq("book_id", bookId).maybeSingle()
  return (data as unknown as Rule) ?? defaultRule(userId, bookId)
}

/** "Enviar resumen ahora" por un canal (también sirve de prueba si no hay avisos). Devuelve el mensaje para la persona. */
export async function digestNowFor(w: Who, canal: Canal): Promise<string> {
  if (!isCanal(canal)) throw new ServiceError("Canal desconocido.")
  const rule = await ruleOf(w.userId, w.bookId)
  const r = await sendDigest({ householdId: w.householdId, rule, canal, email: w.email, nombre: w.nombre, force: true })
  return r.msg
}

/** "Enviarme una prueba" por un canal: un mensaje corto, sin el resumen. Queda en el registro de envíos. */
export async function testNowFor(w: Who, canal: Canal): Promise<string> {
  if (!isCanal(canal)) throw new ServiceError("Canal desconocido.")
  const rule = await ruleOf(w.userId, w.bookId)
  if (canal === "whatsapp" && rule.whatsapp_to && !normalizeCoPhone(rule.whatsapp_to)) throw new ServiceError("Tu número de WhatsApp no es válido: escribe un celular de 10 dígitos (por ejemplo 315 123 4567).")
  return deliver({ householdId: w.householdId, userId: w.userId, canal, emailTo: rule.email_to || w.email, whatsappTo: rule.whatsapp_to, kind: "prueba" }, testMsg(w.nombre))
}

/** Canales que Mirai ofrece a este hogar (los activa el administrador en la consola). */
export const channelsFor = (householdId: string) => channelStatus(householdId)

/** Telegram: genera un código y el enlace t.me/<bot>?start=<código>. */
export async function telegramLinkFor(o: { householdId: string; userId: string }): Promise<string> {
  const v = await getIntegration(o.householdId, "telegram")
  if (!v?.secrets.botToken) throw new ServiceError(NOT_READY.telegram)
  const me = await telegramApi<{ username: string }>(v.secrets.botToken, "getMe")
  const code = randomBytes(6).toString("hex")
  await rt().admin().from("telegram_links").upsert({ user_id: o.userId, link_code: code })
  return `https://t.me/${me.username}?start=${code}`
}

/** Telegram: busca el mensaje "/start <código>" en el bot y guarda el chat. */
export async function telegramConfirmFor(o: { householdId: string; userId: string; nombre: string }): Promise<string> {
  const v = await getIntegration(o.householdId, "telegram")
  const db = rt().admin()
  const { data: link } = await db.from("telegram_links").select("*").eq("user_id", o.userId).maybeSingle()
  if (!v?.secrets.botToken) throw new ServiceError(NOT_READY.telegram)
  if (!link?.link_code) throw new ServiceError("Primero toca “Vincular Telegram”.")
  const ups = await telegramApi<{ message?: { text?: string; chat: { id: number } } }[]>(v.secrets.botToken, "getUpdates", { allowed_updates: ["message"], limit: 100 })
  const hit = ups.reverse().find((u) => u.message?.text?.trim() === `/start ${link.link_code}`)
  if (!hit?.message) throw new ServiceError("Aún no vemos tu mensaje. Abre el enlace, toca “Iniciar” en Telegram y vuelve a intentar.")
  const chat = String(hit.message.chat.id)
  await db.from("telegram_links").update({ chat_id: chat, linked_at: new Date().toISOString(), link_code: null }).eq("user_id", o.userId)
  await telegramApi(v.secrets.botToken, "sendMessage", { chat_id: chat, text: `¡Listo, ${o.nombre.split(" ")[0]}! Desde ahora te llegarán aquí los avisos de Mirai.` })
  return "Telegram vinculado."
}

export async function telegramUnlinkFor(userId: string) {
  await rt().admin().from("telegram_links").delete().eq("user_id", userId)
}

export type Popup = { id: string; t: string; b: string; go: string; lvl: string }

/** Al abrir la app: actualiza la campana y devuelve hasta 6 avisos urgentes para mostrar (maybePopups de la v4). */
export async function openAppNotifsFor(o: { userId: string; bookId: string }): Promise<Popup[]> {
  const rule = await ruleOf(o.userId, o.bookId)
  if (rule.canales?.app === false) return []
  const list = await avisosPara(o.bookId, rule, "app")
  await upsertAppNotifs(rule, list)
  if (rule.canales?.popup === false || enSilencio(horaBogota(), rule.silencio)) return []
  return list.filter((n) => n.lvl === "bad" || n.lvl === "warn").slice(0, 6).map((n) => ({ id: n.id, t: n.t, b: n.b, go: n.go, lvl: n.lvl }))
}

export type CobroWaStatus = { disponible: boolean; verificado: boolean; motivo?: string }

/**
 * ¿Se puede enviar el recordatorio desde el número de Mirai? Hace falta: WhatsApp activo, una plantilla PROPIA aprobada para
 * el caso "Recordatorio a quien te debe" (consola › WhatsApp) y que la persona tenga su WhatsApp verificado (ya recibió
 * algún mensaje de Mirai en su número).
 */
export async function cobroWaStatusFor(o: { householdId: string; userId: string; bookId: string }): Promise<CobroWaStatus> {
  const v = await getIntegration(o.householdId, "whatsapp")
  const c = v?.secrets.token && v.config.phoneId ? caseConfig(waSettings(v.config), "cobro_tercero") : null
  if (!c?.propia) return { disponible: false, verificado: false, motivo: "Mirai todavía no tiene lista la plantilla de WhatsApp para recordar cobros." }
  const db = rt().admin()
  const { data: rule } = await db.from("notification_rules").select("whatsapp_to").eq("user_id", o.userId).eq("book_id", o.bookId).maybeSingle()
  const mio = normalizeCoPhone(rule?.whatsapp_to)
  const { count } = mio ? await db.from("notification_log").select("id", { count: "exact", head: true }).eq("user_id", o.userId).eq("channel", "whatsapp").eq("status", "enviado") : { count: 0 }
  return { disponible: true, verificado: !!mio && (count ?? 0) > 0, motivo: mio ? undefined : "Primero escribe tu número de WhatsApp en Ajustes › Alertas y envíate una prueba." }
}

/**
 * Envía a la persona que te debe el recordatorio de su cuota desde el número de Mirai, con la plantilla aprobada del caso
 * "cobro_tercero" (nunca con una de respaldo ni con una de ejemplo de Meta: el mensaje debe decir que es un cobro y de
 * parte de quién). La app ya revisó el consentimiento, el rol y el límite. Uno por préstamo al día; queda en el registro.
 */
export async function sendCobroWhatsAppFor(w: Who, loanId: string): Promise<string> {
  const st = await cobroWaStatusFor(w)
  if (!st.disponible) throw new ServiceError(st.motivo ?? "El envío por WhatsApp desde Mirai no está disponible.")
  if (!st.verificado) throw new ServiceError(st.motivo ?? "Primero verifica tu WhatsApp: en Ajustes › Alertas envíate una prueba.")
  const db = rt().admin()
  const { data: L } = await db.from("loans").select("*, loan_payments(*)").eq("id", loanId).eq("book_id", w.bookId).is("deleted_at", null).maybeSingle()
  if (!L || L.kind !== "cobrar") throw new ServiceError("No encontramos ese préstamo en Me deben.", "NOT_FOUND")
  const { data: contact } = L.contact_id ? await db.from("contacts").select("nombre,telefono").eq("id", L.contact_id).maybeSingle() : { data: null }
  const to = normalizeCoPhone(contact?.telefono)
  if (!contact || !to) throw new ServiceError("El contacto necesita un celular de Colombia válido (10 dígitos).")
  const hoy = todayBogota()
  const e = loanEngine({ ...L, extra: Number(L.extra ?? 0), payments: (L.loan_payments ?? []).filter((p: { deleted_at?: string | null }) => !p.deleted_at) } as never, hoy)
  const cu = e.vencidas.length ? e.vencidas : e.next ? [e.next] : []
  if (!cu.length) throw new ServiceError("Este préstamo no tiene cuotas pendientes.")
  const monto = formatCOP(cu.reduce((a, c) => a + c.valor, 0))
  const fecha = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long" }).format(new Date(`${cu[0].fecha}T12:00:00`))
  const quien = w.nombre || "Tu contacto"
  const concepto = L.concepto || "el préstamo"
  const resumen = `${quien} te recuerda la cuota de ${monto} de ${concepto} (${e.vencidas.length ? `venció el ${fecha}` : `para el ${fecha}`})`
  const v = (await getIntegration(w.householdId, "whatsapp"))!
  const claim = await claimSend({ dedupe: `cobro:${L.id}:${hoy}`, userId: w.userId, householdId: w.householdId, bookId: w.bookId, channel: "whatsapp", kind: "cobro_tercero" })
  if (!claim) throw new ServiceError("Hoy ya le enviaste este recordatorio desde Mirai.", "CONFLICT")
  try {
    const r = await sendWhatsApp(v, to, waValuesFromText(resumen, { nombre: contact.nombre.split(" ")[0] ?? "", cobra: quien, titulo: `Cuota de ${concepto}`, detalle: concepto, monto, fecha, enlace: rt().siteUrl() }), { caso: "cobro_tercero", text: resumen, override: { template: caseConfig(waSettings(v.config), "cobro_tercero").template } })
    await finishSend(claim, { status: "enviado", provider: "whatsapp", source: v.source ?? null, destino: maskDest("whatsapp", to), ref: r.id, error: fallbackNote(r.fallback) })
    return `Recordatorio enviado al WhatsApp de ${contact.nombre} (${formatCoPhone(to)}).`
  } catch (err) {
    const msg = (err as Error).message || "Error desconocido"
    await finishSend(claim, { status: "fallido", provider: "whatsapp", source: v.source ?? null, destino: maskDest("whatsapp", to), error: msg })
    throw new Error(msg)
  }
}
