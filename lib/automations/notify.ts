import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getIntegration } from "@/features/integrations/store"
import { brandEmail, EMAIL_KINDS, sendEmail } from "@/lib/notify/email"
import { pushReady, sendPush, sendTelegram, sendWhatsApp } from "@/lib/notify/channels"
import { defaultRule, horaBogota, type Rule } from "@/lib/notify/digest"
import { enSilencio } from "@/lib/notify/rules"
import { waValuesFromText } from "@/lib/notify/whatsapp"
import { siteUrl } from "@/lib/site-url"

const MONEY = /\$\s?[\d.]+(,\d+)?/g
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

/**
 * Aviso de una automatización para todo el hogar: siempre en la app (campana) y, si se pidió "todos", por los canales
 * que cada persona tenga activos en Ajustes › Avisos (correo, Telegram, push y WhatsApp), con las funciones de lib/notify.
 */
export async function notifyHousehold(o: { householdId: string; bookId: string; titulo: string; mensaje: string; canales: "app" | "todos"; dedupe: string }) {
  const db = supabaseAdmin()
  const { data: members } = await db.from("household_members").select("user_id").eq("household_id", o.householdId)
  const users = (members ?? []).map((m) => m.user_id)
  if (!users.length) return "No hay personas en el hogar"
  const rows = users.map((u) => ({ user_id: u, book_id: o.bookId, kind: "automatizacion", titulo: o.titulo.slice(0, 200), cuerpo: o.mensaje.slice(0, 1000), href: "/automatizaciones", dedupe: `${o.dedupe}:${u}` }))
  const { error } = await db.from("notifications").upsert(rows, { onConflict: "user_id,dedupe", ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  const sent: string[] = [`app (${users.length})`]
  if (o.canales !== "todos") return `Aviso enviado en la app a ${users.length} persona${users.length === 1 ? "" : "s"}`

  const [{ data: rules }, { data: profiles }, { data: links }] = await Promise.all([
    db.from("notification_rules").select("*").eq("book_id", o.bookId).in("user_id", users),
    db.from("profiles").select("id,email").in("id", users),
    db.from("telegram_links").select("user_id,chat_id").in("user_id", users),
  ])
  const ruleOf = (u: string) => ((rules ?? []).find((r) => r.user_id === u) as unknown as Rule | undefined) ?? defaultRule(u, o.bookId)
  const lazy = <T,>(f: () => Promise<T>) => { let p: Promise<T> | null = null; return () => (p ??= f()) }
  const telegram = lazy(() => getIntegration(o.householdId, "telegram"))
  const whatsapp = lazy(() => getIntegration(o.householdId, "whatsapp"))
  const email = lazy(async () => { for (const k of EMAIL_KINDS) { const v = await getIntegration(o.householdId, k); if (v?.enabled) return v } return null })
  const h = horaBogota()
  for (const u of users) {
    const rule = ruleOf(u)
    const c = rule.canales ?? {}
    const cuerpo = rule.ocultar_montos ? o.mensaje.replace(MONEY, "").replace(/\s+/g, " ").trim() : o.mensaje
    const titulo = rule.ocultar_montos ? o.titulo.replace(MONEY, "").replace(/\s+/g, " ").trim() : o.titulo
    const text = `${titulo}\n${cuerpo}\n\n${siteUrl()}/automatizaciones`
    const tries: [string, () => Promise<unknown>][] = []
    if (c.telegram) tries.push(["telegram", async () => {
      const v = await telegram(); const chat = (links ?? []).find((l) => l.user_id === u)?.chat_id
      if (v?.enabled && chat) return sendTelegram(v, chat, text)
      throw new Error("sin vincular")
    }])
    if (c.push && pushReady() && !enSilencio(h, rule.silencio)) tries.push(["push", () => sendPush(u, { title: titulo, body: cuerpo.slice(0, 180), url: "/automatizaciones", tag: o.dedupe })])
    if (c.whatsapp && rule.whatsapp_to) tries.push(["whatsapp", async () => {
      const v = await whatsapp()
      if (v?.enabled) return sendWhatsApp(v, rule.whatsapp_to!, waValuesFromText(`${titulo}: ${cuerpo}`, { titulo, detalle: cuerpo, enlace: `${siteUrl()}/automatizaciones` }), { caso: "automatizacion", text })
      throw new Error("inactivo")
    }])
    if (c.email) tries.push(["correo", async () => {
      const v = await email(); const to = rule.email_to || (profiles ?? []).find((p) => p.id === u)?.email
      if (v && to) return sendEmail(v, { to, subject: `Mirai: ${titulo}`, html: brandEmail(esc(titulo), `<p>${esc(cuerpo)}</p><p style="margin-top:20px"><a href="${siteUrl()}/automatizaciones" style="background:#1F2B4B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Abrir Mirai</a></p>`), text })
      throw new Error("sin proveedor")
    }])
    for (const [name, run] of tries) {
      try { await run(); sent.push(name) } catch { /* un canal que falla no detiene a los demás */ }
    }
  }
  return `Aviso enviado: ${[...new Set(sent)].join(", ")}`
}
