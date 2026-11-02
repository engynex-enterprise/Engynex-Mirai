import "server-only"
import webpush from "web-push"
import { supabaseAdmin } from "@/lib/supabase/admin"
import type { IntegrationValue } from "@/features/integrations/store"
import { publicSiteUrl } from "@/lib/site-url"
import { buildTemplateMessage, caseConfig, esPlantillaDeMeta, fallbackTemplate, normalizeCoPhone, pickTemplate, plantillaDeRespaldo, templateSlots, waErrorMsg, waSettings, waValuesFromText, withBase, type MetaTemplate, type WaCase, type WaCaseCfg, type WaValues } from "./whatsapp"

// ── Telegram (Bot API) ──
export async function telegramApi<T = unknown>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((x) => x.json())
  if (!r.ok) throw new Error(`Telegram: ${r.description ?? "error"}`)
  return r.result as T
}
export const sendTelegram = (v: IntegrationValue, chatId: string, text: string) =>
  telegramApi(v.secrets.botToken, "sendMessage", { chat_id: chatId, text, disable_web_page_preview: true })

// ── WhatsApp Cloud API ──
export const GRAPH = "https://graph.facebook.com/v23.0"

/** Error de la API de Meta con su código (para decidir si se reintenta). */
export class WaError extends Error { constructor(msg: string, public code?: number) { super(msg) } }

export async function graph<T = Record<string, unknown>>(token: string, path: string, body?: unknown, method?: "GET" | "POST" | "DELETE"): Promise<T> {
  const url = /^https:\/\//.test(path) ? path : `${GRAPH}/${path}`
  const r = await fetch(url, { method: method ?? (body ? "POST" : "GET"), headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(20000) })
  const j = await r.json().catch(() => ({ error: { message: `HTTP ${r.status}` } }))
  if (j.error) throw new WaError(`WhatsApp: ${waErrorMsg(j.error)}`, Number(j.error.code) || undefined)
  return j as T
}

const TPL_FIELDS = "id,name,status,language,category,components,parameter_format,rejected_reason,quality_score"
/** Caché corta (10 min) de las plantillas leídas de Meta, por cuenta y nombre: evita una consulta por cada envío del cron. */
const tplCache = new Map<string, { at: number; list: MetaTemplate[] }>()

/** Plantillas de la cuenta de WhatsApp Business (todas o las de un nombre), leídas de Meta. */
export async function waTemplates(v: IntegrationValue, o: { name?: string; fresh?: boolean } = {}): Promise<MetaTemplate[]> {
  const waba = String(v.config.wabaId ?? "").trim()
  if (!waba || !v.secrets.token) throw new Error("Falta el ID de la cuenta de WhatsApp Business o el token (consola › Integraciones globales › WhatsApp).")
  const ck = `${waba}:${o.name ?? "*"}`
  const hit = tplCache.get(ck)
  if (!o.fresh && hit && Date.now() - hit.at < 600_000) return hit.list
  const list: MetaTemplate[] = []
  let next: string | undefined = `${waba}/message_templates?fields=${TPL_FIELDS}&limit=100${o.name ? `&name=${encodeURIComponent(o.name)}` : ""}`
  for (let i = 0; next && i < 10; i++) {
    const r: { data?: MetaTemplate[]; paging?: { next?: string } } = await graph(v.secrets.token, next)
    list.push(...(r.data ?? []))
    next = r.paging?.next
  }
  tplCache.set(ck, { at: Date.now(), list })
  return list
}
export const clearTemplateCache = () => tplCache.clear()

/** La plantilla pedida no se puede usar ahora (en revisión, rechazada, pausada o no existe). */
export class TemplateUnavailable extends Error {}

/**
 * Plantilla de respaldo cuando la del caso no está aprobada: la por defecto y luego una propia aprobada con variable en el
 * cuerpo (primero en español). Nunca las de ejemplo de Meta.
 */
const approvedFallback = async (v: IntegrationValue, defaultName: string, skip: string) => plantillaDeRespaldo(await waTemplates(v), defaultName, skip)

/** Estructura real de la plantilla aprobada (de Meta). Sin ID de la cuenta: respaldo de un solo parámetro. */
export async function loadTemplate(v: IntegrationValue, name: string, lang: string, fresh = false): Promise<{ tpl: MetaTemplate; live: boolean }> {
  if (!String(v.config.wabaId ?? "").trim()) return { tpl: fallbackTemplate(name, lang), live: false }
  let all = await waTemplates(v, { name, fresh })
  let t = pickTemplate(all, name, lang)
  // La caché puede tener un estado viejo (p. ej. "en revisión" justo antes de que Meta la apruebe): se lee de nuevo una vez.
  if (!t && !fresh) { all = await waTemplates(v, { name, fresh: true }); t = pickTemplate(all, name, lang) }
  if (!t) {
    // Existe pero no está aprobada: decir el estado real (editar una plantilla aprobada la devuelve a revisión).
    const x = all.find((y) => y.name === name)
    const st = String(x?.status ?? "").toUpperCase()
    if (st === "PENDING" || st === "IN_APPEAL") throw new TemplateUnavailable(`WhatsApp: la plantilla "${name}" está en revisión de Meta. Se podrá usar cuando la aprueben (suele tardar de minutos a unas horas); mientras tanto escoge otra aprobada en consola › WhatsApp.`)
    if (st === "REJECTED") throw new TemplateUnavailable(`WhatsApp: Meta rechazó la plantilla "${name}"${x?.rejected_reason && x.rejected_reason !== "NONE" ? ` (motivo: ${x.rejected_reason})` : ""}. Corrígela o escoge otra en consola › WhatsApp.`)
    if (st === "PAUSED" || st === "DISABLED") throw new TemplateUnavailable(`WhatsApp: Meta ${st === "PAUSED" ? "pausó" : "desactivó"} la plantilla "${name}" por su calidad. Escoge otra en consola › WhatsApp.`)
    throw new TemplateUnavailable(`WhatsApp: la plantilla "${name}" no existe en esa cuenta de WhatsApp Business.`)
  }
  return { tpl: t, live: true }
}

/** Compatibilidad: estructura de la plantilla por defecto (nombre, idioma y cantidad de parámetros). */
export async function fetchTemplateSpec(v: IntegrationValue) {
  const s = waSettings(v.config)
  if (!s.template || !String(v.config.wabaId ?? "").trim() || !v.secrets.token) return null
  const { tpl } = await loadTemplate(v, s.template, s.lang)
  return { name: tpl.name, lang: tpl.language, body: templateSlots(tpl).filter((x) => x.comp === "body") }
}

/** Datos del número de WhatsApp de Mirai (sirve para validar el Phone number ID y el token). */
export const whatsappNumber = (v: IntegrationValue) =>
  graph<{ display_phone_number?: string; verified_name?: string; quality_rating?: string }>(v.secrets.token, `${encodeURIComponent(String(v.config.phoneId ?? ""))}?fields=display_phone_number,verified_name,quality_rating`)

/** Dirección pública (https) de Mirai para lo que Meta debe descargar (imagen por defecto del encabezado). */
export const WA_DEFAULT_HEADER = "/brand/whatsapp-header.png"
export const defaultHeaderImage = () => `${publicSiteUrl()}${WA_DEFAULT_HEADER}`

export type WaSendOpts = { caso?: WaCase; text?: string; /** Prueba desde la consola: plantilla/asignación sin guardar. */ override?: WaCaseCfg }

/** Arma el mensaje (plantilla del caso con todos sus componentes, o texto libre si no hay plantilla). */
export async function waMessage(v: IntegrationValue, dest: string, values: WaValues, o: WaSendOpts = {}, fresh = false) {
  const s = waSettings(v.config)
  const c = o.override ? { ...caseConfig(s, o.caso), ...Object.fromEntries(Object.entries(o.override).filter(([, x]) => x !== undefined && x !== "")) } : caseConfig(s, o.caso)
  const vals = { ...values, enlace: withBase(values.enlace, s.enlaceBase) }
  const texto = (motivo?: string) => {
    const text = (o.text ?? vals.resumen).slice(0, 4000)
    return { message: { messaging_product: "whatsapp", recipient_type: "individual", to: dest, type: "text", text: { body: text, preview_url: false } }, preview: [{ key: "texto", label: "Texto libre", value: text, src: "texto" }], live: false, template: null as MetaTemplate | null,
      fallback: motivo ? { de: c.template, a: "texto libre", motivo } : null }
  }
  // Una plantilla de ejemplo de Meta ("Integration Test", hello_world) nunca se envía a una persona en un aviso real.
  if (!c.template || (esPlantillaDeMeta(c.template) && !o.override)) return texto(c.template ? `"${c.template}" es una plantilla de ejemplo de Meta` : undefined)
  let loaded: { tpl: MetaTemplate; live: boolean }
  let fallback: { de: string; a: string; motivo: string } | null = null
  try {
    loaded = await loadTemplate(v, c.template, c.lang, fresh)
  } catch (e) {
    // Una prueba de la consola con plantilla escogida muestra el error; los envíos normales usan una de respaldo propia
    // y, si no hay ninguna aprobada, texto libre (Meta lo entrega si la persona escribió en las últimas 24 horas).
    if (!(e instanceof TemplateUnavailable) || o.override) throw e
    const alt = await approvedFallback(v, s.template, c.template)
    if (!alt) return texto(e.message.replace(/^WhatsApp: /, ""))
    loaded = { tpl: alt, live: true }
    fallback = { de: c.template, a: alt.name, motivo: e.message.replace(/^WhatsApp: /, "") }
  }
  const map = fallback ? (fallback.a === s.template ? s.map : {}) : c.map
  const { message, preview } = buildTemplateMessage(dest, loaded.tpl, vals, { map, media: { link: c.headerImage || s.headerImage || defaultHeaderImage() } })
  return { message, preview, live: loaded.live, template: loaded.tpl, fallback }
}

/** Nota para el registro y el mensaje de éxito cuando se usó una plantilla de respaldo. */
export const fallbackNote = (f: { de: string; a: string } | null | undefined) =>
  !f ? null : f.a === "texto libre"
    ? `Se envió como texto libre porque "${f.de}" no está disponible en Meta (solo llega si la persona escribió al número en las últimas 24 horas).`
    : `Se usó la plantilla "${f.a}" porque "${f.de}" no está disponible en Meta (en revisión, rechazada o pausada).`

/**
 * Envía por WhatsApp con la plantilla del caso (estructura leída de Meta: encabezado, cuerpo y botones) o texto libre
 * si no hay plantilla. Si Meta dice que los parámetros no coinciden, vuelve a leer la plantilla y reintenta una vez.
 * `opts` puede ser el texto libre (compatibilidad). Devuelve el id del mensaje y el número usado.
 */
export async function sendWhatsApp(v: IntegrationValue, to: string, values: WaValues | string, opts: WaSendOpts | string = {}) {
  const o: WaSendOpts = typeof opts === "string" ? { text: opts } : opts
  if (typeof values === "string") { o.text ??= values; values = waValuesFromText(values) }
  const dest = normalizeCoPhone(to)
  if (!dest) throw new Error("El número de WhatsApp no es válido: escribe un celular de Colombia de 10 dígitos (por ejemplo 315 123 4567).")
  if (!v.secrets.token || !v.config.phoneId) throw new Error("WhatsApp no está configurado por completo (falta el ID del número o el token).")
  const path = `${encodeURIComponent(String(v.config.phoneId))}/messages`
  let m = await waMessage(v, dest, values, o)
  try {
    const r = await graph<{ messages?: { id: string }[] }>(v.secrets.token, path, m.message)
    return { id: r.messages?.[0]?.id ?? null, to: dest, preview: m.preview, fallback: m.fallback }
  } catch (e) {
    if (!(e instanceof WaError) || !m.live || ![132000, 132012].includes(e.code ?? 0)) throw e
    m = await waMessage(v, dest, values, o, true)
    const r = await graph<{ messages?: { id: string }[] }>(v.secrets.token, path, m.message)
    return { id: r.messages?.[0]?.id ?? null, to: dest, preview: m.preview, fallback: m.fallback }
  }
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
