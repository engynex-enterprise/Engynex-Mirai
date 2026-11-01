import "server-only"
import webpush from "web-push"
import { supabaseAdmin } from "@/lib/supabase/admin"
import type { IntegrationValue } from "@/features/integrations/store"

// ── Telegram (Bot API) ──
export async function telegramApi<T = unknown>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((x) => x.json())
  if (!r.ok) throw new Error(`Telegram: ${r.description ?? "error"}`)
  return r.result as T
}
export const sendTelegram = (v: IntegrationValue, chatId: string, text: string) =>
  telegramApi(v.secrets.botToken, "sendMessage", { chat_id: chatId, text, disable_web_page_preview: true })

// ── WhatsApp Cloud API ──
export async function sendWhatsApp(v: IntegrationValue, to: string, text: string) {
  const num = to.replace(/\D/g, "")
  const dest = num.length === 10 ? `57${num}` : num
  const template = String(v.config.template ?? "").trim()
  const body = template
    ? { messaging_product: "whatsapp", to: dest, type: "template", template: { name: template, language: { code: String(v.config.lang || "es_CO") }, components: [{ type: "body", parameters: [{ type: "text", text: text.slice(0, 1000) }] }] } }
    : { messaging_product: "whatsapp", to: dest, type: "text", text: { body: text.slice(0, 4000) } }
  const r = await fetch(`https://graph.facebook.com/v21.0/${v.config.phoneId}/messages`, { method: "POST", headers: { authorization: `Bearer ${v.secrets.token}`, "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json())
  if (r.error) throw new Error(`WhatsApp: ${r.error.message}`)
}

// ── Web Push (VAPID) ──
export const pushReady = () => !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
export async function sendPush(userId: string, msg: { title: string; body: string; url?: string; tag?: string }) {
  if (!pushReady()) throw new Error("Faltan las llaves VAPID del despliegue (NEXT_PUBLIC_VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY).")
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:soporte@mirai.app", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
  const admin = supabaseAdmin()
  const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", userId)
  let sent = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 86400 })
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id)
    }
  }
  return sent
}
