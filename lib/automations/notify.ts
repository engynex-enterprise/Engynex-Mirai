import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getIntegration } from "@/features/integrations/store"
import { brandEmail, EMAIL_KINDS, sendEmail } from "@/lib/notify/email"
import { pushReady, sendPush, sendTelegram, sendWhatsApp } from "@/lib/notify/channels"
import { defaultRule, horaBogota, type Rule } from "@/lib/notify/digest"
import { enSilencio, maskDest, onFor, type AvisoKey, type CanalKey } from "@/lib/notify/rules"
import { logSend } from "@/lib/notify/log"
import { waValuesFromText } from "@/lib/notify/whatsapp"
import { siteUrl } from "@/lib/site-url"
import { destinatarios } from "./notify-rules"

const MONEY = /\$\s?[\d.]+(,\d+)?/g
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

/** Canales que se callan en el horario de silencio de la persona (el correo y la campana no hacen ruido). */
const RUIDOSOS: CanalKey[] = ["push", "telegram", "whatsapp"]

/**
 * Aviso de una automatización: siempre en la app (campana) y, si se pidió "todos", por los canales que cada persona
 * tenga activos en Ajustes › Alertas (correo, Telegram, push y WhatsApp). Respeta la matriz del tipo de aviso, el
 * horario de silencio y el ocultar montos, y deja cada envío externo en notification_log (consola › Envíos).
 */
export async function notifyHousehold(o: {
  householdId: string; bookId: string; titulo: string; mensaje: string; canales: "app" | "todos"; dedupe: string
  para?: string; autor?: string | null; creador?: string | null; aviso?: AvisoKey
}) {
  const db = supabaseAdmin()
  const { data: members } = await db.from("household_members").select("user_id").eq("household_id", o.householdId)
  const all = (members ?? []).map((m) => m.user_id)
  if (!all.length) return "No hay personas en el hogar"
  const users = destinatarios(all, o)

  const [{ data: rules }, { data: profiles }, { data: links }] = await Promise.all([
    db.from("notification_rules").select("*").eq("book_id", o.bookId).in("user_id", users),
    o.canales === "todos" ? db.from("profiles").select("id,email").in("id", users) : Promise.resolve({ data: [] as { id: string; email: string | null }[] }),
    o.canales === "todos" ? db.from("telegram_links").select("user_id,chat_id").in("user_id", users) : Promise.resolve({ data: [] as { user_id: string; chat_id: string }[] }),
  ])
  const ruleOf = (u: string) => ((rules ?? []).find((r) => r.user_id === u) as unknown as Rule | undefined) ?? defaultRule(u, o.bookId)
  const quiere = (rule: Rule, canal: CanalKey) => !o.aviso || onFor(rule.matriz, o.aviso, canal)

  const enApp = users.filter((u) => ruleOf(u).canales?.app !== false && quiere(ruleOf(u), "app"))
  if (enApp.length) {
    const rows = enApp.map((u) => ({ user_id: u, book_id: o.bookId, kind: "automatizacion", titulo: o.titulo.slice(0, 200), cuerpo: o.mensaje.slice(0, 1000), href: "/automatizaciones", dedupe: `${o.dedupe}:${u}` }))
    const { error } = await db.from("notifications").upsert(rows, { onConflict: "user_id,dedupe", ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
  const sent: string[] = enApp.length ? [`app (${enApp.length})`] : []
  const quien = users.length === all.length ? "" : users.length === 1 ? " a 1 persona" : ` a ${users.length} personas`
  if (o.canales !== "todos") return enApp.length ? `Aviso enviado en la app${quien || ` a ${enApp.length} persona${enApp.length === 1 ? "" : "s"}`}` : "Nadie tiene activo este tipo de aviso en la app"

  const lazy = <T,>(f: () => Promise<T>) => { let p: Promise<T> | null = null; return () => (p ??= f()) }
  const telegram = lazy(() => getIntegration(o.householdId, "telegram"))
  const whatsapp = lazy(() => getIntegration(o.householdId, "whatsapp"))
  const email = lazy(async () => { for (const k of EMAIL_KINDS) { const v = await getIntegration(o.householdId, k); if (v?.enabled) return { v, k } } return null })
  const h = horaBogota()
  for (const u of users) {
    const rule = ruleOf(u)
    const c = rule.canales ?? {}
    const cuerpo = rule.ocultar_montos ? o.mensaje.replace(MONEY, "").replace(/\s+/g, " ").trim() : o.mensaje
    const titulo = rule.ocultar_montos ? o.titulo.replace(MONEY, "").replace(/\s+/g, " ").trim() : o.titulo
    const text = `${titulo}\n${cuerpo}\n\n${siteUrl()}/automatizaciones`
    const callado = enSilencio(h, rule.silencio)
    const tries: { canal: Exclude<CanalKey, "app">; run: () => Promise<{ provider: string; source?: string | null; destino?: string | null; ref?: string | null }> }[] = []
    const puede = (canal: Exclude<CanalKey, "app">) => !!c[canal] && quiere(rule, canal) && !(callado && RUIDOSOS.includes(canal))
    if (puede("telegram")) tries.push({ canal: "telegram", run: async () => {
      const v = await telegram(); const chat = (links ?? []).find((l) => l.user_id === u)?.chat_id
      if (!v?.enabled || !chat) throw new Error(v?.enabled ? "Telegram sin vincular" : "Telegram inactivo")
      await sendTelegram(v, chat, text)
      return { provider: "telegram", source: v.source ?? null, destino: maskDest("telegram", chat) }
    } })
    if (puede("push") && pushReady()) tries.push({ canal: "push", run: async () => {
      const n = await sendPush(u, { title: titulo, body: cuerpo.slice(0, 180), url: "/automatizaciones", tag: o.dedupe })
      if (!n) throw new Error("Sin dispositivos con push")
      return { provider: "webpush", destino: `${n} dispositivo${n === 1 ? "" : "s"}` }
    } })
    if (puede("whatsapp") && rule.whatsapp_to) tries.push({ canal: "whatsapp", run: async () => {
      const v = await whatsapp()
      if (!v?.enabled) throw new Error("WhatsApp inactivo")
      const r = await sendWhatsApp(v, rule.whatsapp_to!, waValuesFromText(`${titulo}: ${cuerpo}`, { titulo, detalle: cuerpo, enlace: `${siteUrl()}/automatizaciones` }), { caso: "automatizacion", text })
      return { provider: "whatsapp", source: v.source ?? null, destino: maskDest("whatsapp", rule.whatsapp_to), ref: r?.id ?? null }
    } })
    if (puede("email")) tries.push({ canal: "email", run: async () => {
      const e = await email(); const to = rule.email_to || (profiles ?? []).find((p) => p.id === u)?.email
      if (!e || !to) throw new Error(e ? "Sin correo de destino" : "Sin proveedor de correo")
      const ref = await sendEmail(e.v, { to, subject: `Mirai: ${titulo}`, html: brandEmail(esc(titulo), `<p>${esc(cuerpo)}</p><p style="margin-top:20px"><a href="${siteUrl()}/automatizaciones" style="background:#1F2B4B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Abrir Mirai</a></p>`), text })
      return { provider: e.k, source: e.v.source ?? null, destino: maskDest("email", to), ref: typeof ref === "string" ? ref : null }
    } })
    for (const t of tries) {
      const log = { user_id: u, household_id: o.householdId, channel: t.canal, kind: "automatizacion" } as const
      try {
        const r = await t.run()
        sent.push(t.canal === "email" ? "correo" : t.canal)
        await logSend({ ...log, status: "enviado", ...r })
      } catch (e) {
        // Un canal que falla no detiene a los demás; queda en el registro de envíos.
        await logSend({ ...log, status: "fallido", error: (e as Error).message })
      }
    }
  }
  return sent.length ? `Aviso enviado${quien}: ${[...new Set(sent)].join(", ")}` : "Nadie tiene activo este tipo de aviso"
}
