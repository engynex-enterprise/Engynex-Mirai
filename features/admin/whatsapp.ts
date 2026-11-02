"use server"

import { z } from "zod"
import { requirePlatformAdmin } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getGlobalIntegration, type IntegrationValue } from "@/features/integrations/store"
import { defaultHeaderImage, sendWhatsApp, waMessage, waTemplates, whatsappNumber } from "@/lib/notify/channels"
import { createTemplate, deleteTemplate, editTemplate } from "@/lib/notify/wa-meta"
import { canEdit, validateDraft, type TemplateDraft } from "@/lib/notify/wa-templates"
import { logSend } from "@/lib/notify/log"
import { maskDest } from "@/lib/notify/rules"
import { publicSiteUrl, siteUrl } from "@/lib/site-url"
import { formatCoPhone, normalizeCoPhone, sampleValues, waSettings, WA_CASE_KEYS, WA_VARS, type MetaTemplate, type ParamPreview, type WaCase, type WaSettings, type WaVar } from "@/lib/notify/whatsapp"

// Consola › WhatsApp: plantillas de la cuenta de Meta, plantilla por caso y pruebas. Errores legibles en { ok: false, msg }.

async function audit(actor: string, accion: string, objetivo: string | null, detalle: Record<string, unknown> = {}) {
  await supabaseAdmin().from("admin_audit").insert({ actor, accion, objetivo, detalle: detalle as never })
}

async function wa(): Promise<IntegrationValue | null> {
  const g = await getGlobalIntegration("whatsapp")
  return g ? { kind: "whatsapp", enabled: g.modo !== "apagada", config: g.config, secrets: g.secrets, source: "plataforma" } : null
}
const fail = (e: unknown) => ({ ok: false as const, msg: (e as Error).message || "Error desconocido" })

export type WaState = {
  ok: boolean; msg?: string
  activa: boolean; configurada: boolean; tieneWaba: boolean
  numero?: string; settings: WaSettings; templates: MetaTemplate[]
  defaultImage: string; base: string
}

/** Estado para la consola: ajustes guardados y plantillas de la cuenta (leídas de Meta en vivo). */
export async function adminWaState(fresh = false): Promise<WaState> {
  await requirePlatformAdmin()
  const v = await wa()
  const settings = waSettings(v?.config)
  const out: WaState = { ok: true, activa: !!v?.enabled, configurada: !!(v?.secrets.token && v.config.phoneId), tieneWaba: !!String(v?.config.wabaId ?? "").trim(), settings, templates: [], defaultImage: defaultHeaderImage(), base: settings.enlaceBase || publicSiteUrl() }
  if (!v || !out.tieneWaba || !v.secrets.token) return { ...out, ok: false, msg: !v ? "Primero configura WhatsApp en Integraciones globales." : "Guarda el ID de la cuenta de WhatsApp Business y el token en Integraciones globales para administrar las plantillas." }
  try {
    const [templates, n] = await Promise.all([waTemplates(v, { fresh }), whatsappNumber(v).catch(() => null)])
    out.templates = templates.sort((a, b) => a.name.localeCompare(b.name) || a.language.localeCompare(b.language))
    if (n?.display_phone_number) out.numero = `${n.display_phone_number}${n.verified_name ? ` · ${n.verified_name}` : ""}`
    return out
  } catch (e) { return { ...out, ...fail(e) } }
}

const Map_ = z.record(z.string().max(40), z.union([z.object({ src: z.enum(WA_VARS.map((x) => x.k) as [WaVar, ...WaVar[]]) }), z.object({ src: z.literal("fijo"), text: z.string().max(500) })]))
const HttpsUrl = z.union([z.literal(""), z.url().max(1000).refine((u) => u.startsWith("https://"), "La dirección debe empezar por https://")])
const TplName = z.union([z.literal(""), z.string().regex(/^[a-z0-9_]{1,512}$/, "Nombre de plantilla inválido")])
const Lang = z.string().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, "Idioma inválido")
const CaseCfg = z.object({ template: TplName.optional(), lang: z.union([z.literal(""), Lang]).optional(), map: Map_.optional(), headerImage: HttpsUrl.optional() })
const Settings = z.object({
  template: TplName, lang: Lang, map: Map_, headerImage: HttpsUrl, enlaceBase: HttpsUrl,
  casos: z.partialRecord(z.enum(WA_CASE_KEYS as [WaCase, ...WaCase[]]), CaseCfg),
})

/** Guarda la plantilla por defecto, la asignación por caso y los demás ajustes (en la config de la integración global). */
export async function adminWaSaveSettings(input: WaSettings): Promise<{ ok: boolean; msg?: string }> {
  const ctx = await requirePlatformAdmin()
  const p = Settings.safeParse(input)
  if (!p.success) return { ok: false, msg: p.error.issues[0]?.message ?? "Datos inválidos" }
  const s = p.data
  const db = supabaseAdmin()
  const { data: row } = await db.from("platform_integrations").select("config").eq("kind", "whatsapp").maybeSingle()
  if (!row) return { ok: false, msg: "Primero configura WhatsApp en Integraciones globales." }
  // Solo se guardan los casos con algo propio.
  const casos = Object.fromEntries(Object.entries(s.casos).filter(([, c]) => c && (c.template || c.headerImage)).map(([k, c]) => [k, c!.template ? c : { headerImage: c!.headerImage }]))
  const config = { ...(row.config as Record<string, unknown>), template: s.template, lang: s.lang, wa: { map: s.map, headerImage: s.headerImage, enlaceBase: s.enlaceBase.replace(/\/+$/, ""), casos } }
  delete (config as Record<string, unknown>).tplSpec
  const { error } = await db.from("platform_integrations").update({ config: config as never, updated_by: ctx.user.id, updated_at: new Date().toISOString() }).eq("kind", "whatsapp")
  if (error) return { ok: false, msg: "No se pudo guardar. Intenta de nuevo." }
  await audit(ctx.user.id, "whatsapp: ajustes de plantillas", "whatsapp", { template: s.template, lang: s.lang, casos: Object.fromEntries(Object.entries(casos).map(([k, c]) => [k, (c as { template?: string }).template ?? "(por defecto)"])) })
  return { ok: true }
}

/** Crea una plantilla en Meta o edita una existente (si su estado lo permite). */
export async function adminWaSaveTemplate(draft: TemplateDraft, edit?: { id: string; status?: string }): Promise<{ ok: boolean; msg: string }> {
  const ctx = await requirePlatformAdmin()
  const check = validateDraft(draft, { editing: !!edit })
  if (check.errors.length) return { ok: false, msg: check.errors.join(" ") }
  const v = await wa()
  if (!v) return { ok: false, msg: "Primero configura WhatsApp en Integraciones globales." }
  try {
    if (edit) {
      if (!canEdit(edit.status)) return { ok: false, msg: "Meta no deja editar una plantilla mientras está en revisión. Espera el resultado." }
      await editTemplate(v, z.string().regex(/^\d{5,30}$/).parse(edit.id), draft)
      await audit(ctx.user.id, "whatsapp: editar plantilla", draft.name, { lang: draft.language, category: draft.category })
      return { ok: true, msg: `Enviamos los cambios de “${draft.name}” a Meta. Vuelve a revisión y suele tardar de minutos a 24 horas.` }
    }
    const r = await createTemplate(v, draft)
    await audit(ctx.user.id, "whatsapp: crear plantilla", draft.name, { lang: draft.language, category: draft.category, status: r.status })
    return { ok: true, msg: `Plantilla “${draft.name}” enviada a Meta (estado: ${r.status === "APPROVED" ? "aprobada" : r.status === "REJECTED" ? "rechazada" : "en revisión"}). Te avisamos el estado aquí al refrescar.` }
  } catch (e) { return fail(e) }
}

/** Elimina una plantilla de la cuenta de Meta (la traducción indicada o todas). */
export async function adminWaDeleteTemplate(name: string, id?: string): Promise<{ ok: boolean; msg: string }> {
  const ctx = await requirePlatformAdmin()
  const n = z.string().regex(/^[a-z0-9_]{1,512}$/).safeParse(name)
  if (!n.success) return { ok: false, msg: "Nombre de plantilla inválido." }
  const v = await wa()
  if (!v) return { ok: false, msg: "Primero configura WhatsApp en Integraciones globales." }
  try {
    await deleteTemplate(v, n.data, id && /^\d{5,30}$/.test(id) ? id : undefined)
    await audit(ctx.user.id, "whatsapp: eliminar plantilla", n.data, { id })
    const s = waSettings(v.config)
    const enUso = s.template === n.data || Object.values(s.casos).some((c) => c?.template === n.data)
    return { ok: true, msg: `Plantilla “${n.data}” eliminada en Meta.${enUso ? " Ojo: estaba asignada a un caso; escoge otra en “Casos de envío”." : ""} Meta no deja reutilizar el nombre durante 30 días.` }
  } catch (e) { return fail(e) }
}

/** Valores que se enviarían para un caso (vista previa del servidor: misma lógica que el envío real). */
export async function adminWaPreview(caso: WaCase, override?: WaSettings["casos"][WaCase]): Promise<{ ok: boolean; msg?: string; preview?: ParamPreview[]; template?: string }> {
  await requirePlatformAdmin()
  const v = await wa()
  if (!v) return { ok: false, msg: "Primero configura WhatsApp en Integraciones globales." }
  try {
    const m = await waMessage(v, "573000000000", sampleValues(caso, siteUrl()), { caso, override: override ?? undefined })
    return { ok: true, preview: m.preview, template: m.template ? `${m.template.name} (${m.template.language})` : "texto libre" }
  } catch (e) { return fail(e) }
}

/**
 * "Probar plantilla": envía el caso con valores de ejemplo al número que escriba el administrador, con la plantilla y
 * la asignación de la pantalla (aunque no estén guardadas). Queda en el registro de envíos.
 */
export async function adminWaSendTest(input: { caso: WaCase; to: string; override?: WaSettings["casos"][WaCase] }): Promise<{ ok: boolean; msg: string; preview?: ParamPreview[] }> {
  const ctx = await requirePlatformAdmin()
  const caso = z.enum(WA_CASE_KEYS as [WaCase, ...WaCase[]]).parse(input.caso)
  const override = input.override ? CaseCfg.safeParse(input.override) : null
  if (override && !override.success) return { ok: false, msg: override.error.issues[0]?.message ?? "Datos inválidos" }
  const dest = normalizeCoPhone(input.to)
  if (!dest) return { ok: false, msg: "Escribe un celular de Colombia de 10 dígitos (por ejemplo 315 123 4567)." }
  const v = await wa()
  if (!v) return { ok: false, msg: "Primero configura WhatsApp en Integraciones globales." }
  const base = { user_id: ctx.user.id, channel: "whatsapp", kind: `prueba_admin:${caso}`, provider: "whatsapp", source: "plataforma", destino: maskDest("whatsapp", dest) } as const
  try {
    const vals = { ...sampleValues(caso, siteUrl()), nombre: ctx.user.nombre.split(" ")[0] || "Alberto" }
    const r = await sendWhatsApp(v, dest, vals, { caso, override: override?.data })
    await logSend({ ...base, status: "enviado", ref: r.id })
    await audit(ctx.user.id, "whatsapp: probar plantilla", caso, { destino: base.destino })
    return { ok: true, msg: `Enviado a ${formatCoPhone(r.to)}${r.id ? ` (id …${r.id.slice(-12)})` : ""}. Si no llega en un minuto, revisa el registro de envíos.`, preview: r.preview }
  } catch (e) {
    const f = fail(e)
    await logSend({ ...base, status: "fallido", error: f.msg })
    return f
  }
}
