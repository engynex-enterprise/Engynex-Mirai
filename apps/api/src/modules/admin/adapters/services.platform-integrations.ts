// Adaptador real del puerto PlatformIntegrationsPort: el mismo código de la web (@mirai/services para correo, WhatsApp,
// Telegram y datos; @mirai/ai para la IA). Corre con el runtime que configura ServicesRuntime (IntegrationsModule).
// Ningún secreto sale de aquí: solo textos para la persona y referencias de envío.
import { Injectable } from "@nestjs/common"
import { generateText } from "ai"
import { aiErrMsg, modelFrom } from "@mirai/ai/model"
import { fetchFestivos, fetchFx, fetchTrm, fetchUsura } from "@mirai/services/integrations/data-sources"
import type { IntegrationDef } from "@mirai/services/integrations/registry"
import type { IntegrationValue } from "@mirai/services/integrations/store"
import { defaultHeaderImage, fallbackNote, fetchTemplateSpec, sendWhatsApp, telegramApi, waMessage, waTemplates, whatsappNumber } from "@mirai/services/notify/channels"
import { testMsg } from "@mirai/services/notify/digest"
import { createTemplate, deleteTemplate, editTemplate } from "@mirai/services/notify/wa-meta"
import type { TemplateDraft } from "@mirai/services/notify/wa-templates"
import { brandEmail, EMAIL_KINDS, sendEmail } from "@mirai/services/notify/email"
import { formatCoPhone, sampleValues, type WaCase, type WaCaseCfg } from "@mirai/services/notify/whatsapp"
import { rt } from "@mirai/services/runtime"
import { ServicesEnv } from "../../integrations/services-env"
import { PlatformIntegrationsPort, type WaCaseOverride } from "../platform-integrations.port"

const cop = (n: number) => Math.round(n).toLocaleString("es-CO")

@Injectable()
export class ServicesPlatformIntegrations extends PlatformIntegrationsPort {
  constructor(private readonly env: ServicesEnv) {
    super()
  }

  hasEnv(name: string) {
    return !!this.envValue(name)
  }
  envValue(name: string) {
    return this.env.values.vars[name] ?? process.env[name]
  }
  publicSiteUrl() {
    return rt().publicSiteUrl()
  }
  defaultHeaderImage() {
    return defaultHeaderImage()
  }
  errorMsg(e: unknown, url?: string) {
    return aiErrMsg(e, url)
  }

  async test(v: IntegrationValue, def: IntegrationDef, adminEmail: string): Promise<{ msg: string; ref?: string | null }> {
    const kind = def.kind
    if (def.cat === "ia") {
      const { text } = await generateText({ model: modelFrom(v), prompt: "Responde solo con la palabra: listo", maxOutputTokens: 20 })
      return { msg: `Conexión exitosa. Respondió: “${text.trim().slice(0, 40)}”.` }
    }
    if (EMAIL_KINDS.includes(kind)) {
      const ref = await sendEmail(v, { to: adminEmail, subject: "Mirai: prueba del correo de la plataforma", html: brandEmail("El correo de la plataforma funciona", "<p>Desde ahora Mirai puede enviar avisos con esta cuenta.</p>") })
      return { msg: `Te enviamos un correo de prueba a ${adminEmail}.`, ref }
    }
    if (kind === "telegram") {
      const r = await telegramApi<{ username?: string }>(v.secrets.botToken ?? "", "getMe")
      return { msg: `Bot conectado: @${r.username ?? "?"}.` }
    }
    if (kind === "whatsapp") {
      const n = await whatsappNumber(v)
      let msg = `Número conectado: ${n.display_phone_number ?? "?"}${n.verified_name ? ` (${n.verified_name})` : ""}${n.quality_rating ? ` · calidad ${n.quality_rating}` : ""}.`
      if (v.config.template) {
        const spec = await fetchTemplateSpec(v).catch((e) => {
          msg += ` ${(e as Error).message}`
          return null
        })
        if (spec) msg += ` Plantilla "${spec.name}" aprobada en ${spec.lang} con ${spec.body.length} parámetro${spec.body.length === 1 ? "" : "s"} en el cuerpo.`
      }
      return { msg }
    }
    if (kind === "trm") {
      const t = await fetchTrm()
      return { msg: `TRM de hoy: $${t.valor.toLocaleString("es-CO")} (vigente desde ${t.fecha}).` }
    }
    if (kind === "usura") {
      const u = await fetchUsura()
      return { msg: `Tasa de usura vigente: ${u.usura.toFixed(2).replace(".", ",")} % E.A.` }
    }
    if (kind === "festivos") return { msg: `${(await fetchFestivos(new Date().getFullYear())).length} festivos encontrados este año.` }
    if (kind === "fx") {
      const r = await fetchFx()
      return { msg: `1 USD = $${cop(r.USD)} · 1 EUR = $${cop(r.EUR)}.` }
    }
    if (kind === "coingecko") {
      const r = (await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=cop", { headers: v.secrets.apiKey ? { "x-cg-demo-api-key": v.secrets.apiKey } : {}, signal: AbortSignal.timeout(10_000) }).then((x) => x.json())) as { bitcoin: { cop: number } }
      return { msg: `1 BTC = $${cop(r.bitcoin.cop)}.` }
    }
    if (kind === "stocks") {
      const key = encodeURIComponent(v.secrets.apiKey ?? "")
      const url = v.config.provider === "twelvedata" ? `https://api.twelvedata.com/price?symbol=SPY&apikey=${key}` : `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=SPY&apikey=${key}`
      const r = (await fetch(url, { signal: AbortSignal.timeout(10_000) }).then((x) => x.json())) as Record<string, unknown> & { price?: string; "Global Quote"?: Record<string, string> }
      const p = r.price ?? r["Global Quote"]?.["05. price"]
      if (!p) throw new Error(String(r.message ?? r.Note ?? r.Information ?? "invalid api key"))
      return { msg: `SPY = US$${Number(p).toFixed(2)}.` }
    }
    return { msg: "Esta integración no necesita prueba." }
  }

  async templateLang(v: IntegrationValue) {
    return (await fetchTemplateSpec(v))?.lang ?? null
  }

  async sendTest(v: IntegrationValue, channel: "email" | "whatsapp", dest: string, nombre: string) {
    const m = testMsg(nombre)
    if (channel === "email") return { ref: await sendEmail(v, { to: dest, subject: m.subject, html: m.html, text: m.text }), msg: `Correo de prueba enviado a ${dest}.` }
    const r = await sendWhatsApp(v, dest, m.wa, { caso: m.caso, text: m.text })
    const note = fallbackNote(r.fallback)
    return { ref: r.id, msg: `WhatsApp de prueba enviado a ${formatCoPhone(r.to)}${r.id ? ` (id ${r.id.slice(-12)})` : ""}.${note ? ` ${note}` : ""} Si no llega en un minuto, revisa el registro de envíos.` }
  }

  async waTemplates(v: IntegrationValue, fresh: boolean) {
    return (await waTemplates(v, { fresh })) as unknown as Record<string, unknown>[]
  }

  async waNumber(v: IntegrationValue) {
    const n = await whatsappNumber(v).catch(() => null)
    return n?.display_phone_number ? `${n.display_phone_number}${n.verified_name ? ` · ${n.verified_name}` : ""}` : undefined
  }

  async waPreview(v: IntegrationValue, caso: string, override?: WaCaseOverride) {
    const m = await waMessage(v, "573000000000", sampleValues(caso as WaCase, rt().siteUrl()), { caso: caso as WaCase, override: override as WaCaseCfg | undefined })
    return { preview: m.preview, template: m.template ? `${m.template.name} (${m.template.language})` : "texto libre" }
  }

  async waSend(v: IntegrationValue, dest: string, caso: string, override: WaCaseOverride | undefined, nombre: string) {
    const vals = { ...sampleValues(caso as WaCase, rt().siteUrl()), nombre: nombre.split(" ")[0] || "Alberto" }
    const r = await sendWhatsApp(v, dest, vals, { caso: caso as WaCase, override: override as WaCaseCfg | undefined })
    return { ref: r.id, preview: r.preview, msg: `Enviado a ${formatCoPhone(r.to)}${r.id ? ` (id …${r.id.slice(-12)})` : ""}. Si no llega en un minuto, revisa el registro de envíos.` }
  }

  async waCreateTemplate(v: IntegrationValue, draft: TemplateDraft) {
    const r = await createTemplate(v, draft)
    return { id: r.id, status: r.status }
  }

  async waEditTemplate(v: IntegrationValue, templateId: string, draft: TemplateDraft) {
    await editTemplate(v, templateId, draft)
  }

  async waDeleteTemplate(v: IntegrationValue, name: string, templateId?: string) {
    await deleteTemplate(v, name, templateId)
  }
}
