"use server"

import { randomBytes } from "node:crypto"
import { requireRole, getAppContext } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getIntegration } from "@/features/integrations/store"
import { telegramApi } from "@/lib/notify/channels"
import { avisosPara, channelStatus, defaultRule, deliver, horaBogota, NOT_READY, sendDigest, testMsg, upsertAppNotifs, type Canal, type Rule } from "@/lib/notify/digest"
import { normalizeCoPhone } from "@/lib/notify/whatsapp"
import { enSilencio } from "@/lib/notify/rules"

async function myRule() {
  const ctx = await getAppContext()
  const { data } = await supabaseAdmin().from("notification_rules").select("*").eq("user_id", ctx.user.id).eq("book_id", ctx.book.id).maybeSingle()
  return { ctx, rule: (data as unknown as Rule) ?? defaultRule(ctx.user.id, ctx.book.id) }
}

/** "Enviar resumen ahora" por un canal (también sirve de prueba si no hay avisos). */
export async function sendDigestNow(canal: "email" | "telegram" | "push" | "whatsapp"): Promise<{ ok: boolean; msg: string }> {
  try {
    const { ctx, rule } = await myRule()
    const r = await sendDigest({ householdId: ctx.household.id, rule, canal, email: ctx.user.email, nombre: ctx.user.nombre, force: true })
    return { ok: true, msg: r.msg }
  } catch (e) { return { ok: false, msg: (e as Error).message } }
}

/** Canales que Mirai ofrece a este hogar (los activa el administrador en la consola). */
export async function notifyChannels(): Promise<Record<Canal, boolean>> {
  try { const ctx = await getAppContext(); return await channelStatus(ctx.household.id) }
  catch { return { email: false, telegram: false, whatsapp: false, push: false } }
}

/** "Enviarme una prueba" por un canal: un mensaje corto, sin el resumen. Queda en el registro de envíos. */
export async function sendTestNow(canal: Canal): Promise<{ ok: boolean; msg: string }> {
  try {
    if (!["email", "telegram", "push", "whatsapp"].includes(canal)) return { ok: false, msg: "Canal desconocido." }
    const { ctx, rule } = await myRule()
    if (canal === "whatsapp" && rule.whatsapp_to && !normalizeCoPhone(rule.whatsapp_to)) return { ok: false, msg: "Tu número de WhatsApp no es válido: escribe un celular de 10 dígitos (por ejemplo 315 123 4567)." }
    const msg = await deliver({ householdId: ctx.household.id, userId: ctx.user.id, canal, emailTo: rule.email_to || ctx.user.email, whatsappTo: rule.whatsapp_to, kind: "prueba" }, testMsg(ctx.user.nombre))
    return { ok: true, msg }
  } catch (e) { return { ok: false, msg: (e as Error).message } }
}

/** Telegram: genera un código y el enlace t.me/<bot>?start=<código>. */
export async function telegramStartLink(): Promise<{ ok: boolean; url?: string; msg?: string }> {
  const ctx = await requireRole("viewer")
  const v = await getIntegration(ctx.household.id, "telegram")
  if (!v?.secrets.botToken) return { ok: false, msg: NOT_READY.telegram }
  try {
    const me = await telegramApi<{ username: string }>(v.secrets.botToken, "getMe")
    const code = randomBytes(6).toString("hex")
    await supabaseAdmin().from("telegram_links").upsert({ user_id: ctx.user.id, link_code: code })
    return { ok: true, url: `https://t.me/${me.username}?start=${code}` }
  } catch (e) { return { ok: false, msg: (e as Error).message } }
}

/** Telegram: busca el mensaje "/start <código>" en el bot y guarda el chat. */
export async function telegramConfirm(): Promise<{ ok: boolean; msg: string }> {
  const ctx = await requireRole("viewer")
  const v = await getIntegration(ctx.household.id, "telegram")
  const db = supabaseAdmin()
  const { data: link } = await db.from("telegram_links").select("*").eq("user_id", ctx.user.id).maybeSingle()
  if (!v?.secrets.botToken) return { ok: false, msg: NOT_READY.telegram }
  if (!link?.link_code) return { ok: false, msg: "Primero toca “Vincular Telegram”." }
  try {
    const ups = await telegramApi<{ message?: { text?: string; chat: { id: number } } }[]>(v.secrets.botToken, "getUpdates", { allowed_updates: ["message"], limit: 100 })
    const hit = ups.reverse().find((u) => u.message?.text?.trim() === `/start ${link.link_code}`)
    if (!hit?.message) return { ok: false, msg: "Aún no vemos tu mensaje. Abre el enlace, toca “Iniciar” en Telegram y vuelve a intentar." }
    const chat = String(hit.message.chat.id)
    await db.from("telegram_links").update({ chat_id: chat, linked_at: new Date().toISOString(), link_code: null }).eq("user_id", ctx.user.id)
    await telegramApi(v.secrets.botToken, "sendMessage", { chat_id: chat, text: `¡Listo, ${ctx.user.nombre.split(" ")[0]}! Desde ahora te llegarán aquí los avisos de Mirai.` })
    return { ok: true, msg: "Telegram vinculado." }
  } catch (e) { return { ok: false, msg: (e as Error).message } }
}

export async function telegramUnlink() {
  const ctx = await requireRole("viewer")
  await supabaseAdmin().from("telegram_links").delete().eq("user_id", ctx.user.id)
}

/** Al abrir la app: actualiza la campana y devuelve hasta 3 avisos urgentes para mostrar (maybePopups de la v4). */
export async function openAppNotifs(): Promise<{ id: string; t: string; b: string; go: string; lvl: string }[]> {
  try {
    const { ctx, rule } = await myRule()
    if (rule.canales?.app === false) return []
    const list = await avisosPara(ctx.book.id, rule, "app")
    await upsertAppNotifs(rule, list)
    if (rule.canales?.popup === false || enSilencio(horaBogota(), rule.silencio)) return []
    return list.filter((n) => n.lvl === "bad" || n.lvl === "warn").slice(0, 6).map((n) => ({ id: n.id, t: n.t, b: n.b, go: n.go, lvl: n.lvl }))
  } catch { return [] }
}
