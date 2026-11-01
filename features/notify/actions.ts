"use server"

import { randomBytes } from "node:crypto"
import { requireRole, getAppContext } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getIntegration } from "@/features/integrations/store"
import { telegramApi } from "@/lib/notify/channels"
import { defaultRule, sendDigest, type Rule } from "@/lib/notify/digest"

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

/** Telegram: genera un código y el enlace t.me/<bot>?start=<código>. */
export async function telegramStartLink(): Promise<{ ok: boolean; url?: string; msg?: string }> {
  const ctx = await requireRole("viewer")
  const v = await getIntegration(ctx.household.id, "telegram")
  if (!v?.enabled) return { ok: false, msg: "El dueño del hogar debe activar Telegram en Ajustes › Integraciones." }
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
  if (!v?.enabled || !link?.link_code) return { ok: false, msg: "Primero toca “Vincular Telegram”." }
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
