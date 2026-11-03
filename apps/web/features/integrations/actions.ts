"use server"

import { generateText } from "ai"
import { requireRole } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { encrypt, mask } from "@/lib/crypto"
import { integrationByKind, isAdminOnly } from "@/lib/integrations/registry"
import { aiErrMsg, modelFrom, modelIdOf } from "@/lib/ai/model"
import { aiPlatformSettings, logUsage } from "@/lib/ai/usage"
import { costUSD } from "@/lib/ai/pricing"
import { can } from "@/lib/plans"
import { MODEL_LIST, modelOptions, parseModels, type ModelOption } from "@/lib/ai/models"
import { getGlobalIntegration, getIntegration, getOwnIntegration } from "./store"
import { USE_PLATFORM } from "@/lib/integrations/resolve"

/** Los hogares solo configuran la IA; el resto lo administra Mirai en la consola. */
const ADMIN_MSG = "Esta integración la administra Mirai. Los avisos se eligen en Ajustes › Alertas."

/** Guarda la configuración (los secretos vacíos conservan los guardados) y la activa. */
export async function saveIntegration(kind: string, values: Record<string, string | number | boolean>, enabled = true) {
  const ctx = await requireRole("admin")
  const def = integrationByKind(kind)
  if (!def) throw new Error("Integración desconocida")
  if (isAdminOnly(def)) throw new Error(ADMIN_MSG)
  const prev = await getOwnIntegration(ctx.household.id, kind)
  const config: Record<string, unknown> = {}
  const secrets: Record<string, string> = { ...(prev?.secrets ?? {}) }
  const meta: Record<string, string> = {}
  for (const f of def.fields) {
    const v = values[f.k]
    if (f.type === "secret") {
      if (typeof v === "string" && v.trim()) secrets[f.k] = v.trim()
      if (secrets[f.k]) meta[f.k] = mask(secrets[f.k])
    } else config[f.k] = v ?? f.def ?? ""
  }
  const missing = def.fields.filter((f) => (f.required || (def.scope === "platform" && f.k === "apiKey")) && !(f.type === "secret" ? secrets[f.k] : config[f.k]))
  if (enabled && missing.length) throw new Error(`Falta: ${missing.map((f) => f.l).join(", ")}`)
  const { error } = await supabaseAdmin().from("integrations").upsert({
    household_id: ctx.household.id, kind, enabled, config: config as never, meta: meta as never,
    secrets_enc: Object.keys(secrets).length ? encrypt(JSON.stringify(secrets)) : null, updated_by: ctx.user.id,
  }, { onConflict: "household_id,kind" })
  if (error) throw new Error(error.message)
}

export async function toggleIntegration(kind: string, enabled: boolean) {
  const ctx = await requireRole("admin")
  const def = integrationByKind(kind)
  if (isAdminOnly(def)) throw new Error(ADMIN_MSG)
  const own = await getOwnIntegration(ctx.household.id, kind)
  const global = await getGlobalIntegration(kind)
  const offered = !!global && global.modo !== "apagada" && (!global.planes.length || global.planes.includes(ctx.plan.id))
  if (global?.modo === "obligatoria" && offered) throw new Error("Mirai administra esta integración para todos: no se puede apagar.")
  // Sin datos propios, prender = usar la de la plataforma (si la ofrece).
  const useGlobal = enabled && offered && !Object.keys(own?.secrets ?? {}).length
  if (enabled && !useGlobal && def?.fields.some((f) => f.required) && !own) throw new Error("Primero completa sus datos")
  const { error } = await supabaseAdmin().from("integrations").upsert({ household_id: ctx.household.id, kind, enabled, updated_by: ctx.user.id, ...(useGlobal ? { config: { ...(own?.config ?? {}), [USE_PLATFORM]: true } as never } : {}) }, { onConflict: "household_id,kind" })
  if (error) throw new Error(error.message)
}

export async function deleteIntegration(kind: string) {
  const ctx = await requireRole("admin")
  if (isAdminOnly(kind)) throw new Error(ADMIN_MSG)
  await supabaseAdmin().from("integrations").delete().eq("household_id", ctx.household.id).eq("kind", kind)
}

/** Prueba la conexión de un proveedor de IA del hogar. Devuelve un mensaje para el usuario. */
export async function testIntegration(kind: string): Promise<{ ok: boolean; msg: string }> {
  const ctx = await requireRole("editor")
  if (isAdminOnly(kind)) return { ok: false, msg: ADMIN_MSG }
  const v = await getIntegration(ctx.household.id, kind)
  const def = integrationByKind(kind)
  const done = async (ok: boolean, msg: string) => {
    if (v) await supabaseAdmin().from("integrations").update({ meta: { ...(await metaOf(ctx.household.id, kind)), lastTest: new Date().toISOString(), lastOk: ok, lastMsg: msg } as never }).eq("household_id", ctx.household.id).eq("kind", kind)
    return { ok, msg }
  }
  try {
    if (def?.cat === "ia") {
      if (!v) return { ok: false, msg: "Primero guarda la clave de API." }
      // Solo se prueban las claves del hogar: la IA de la plataforma la administra Mirai (y probarla gastaría sus créditos).
      if (v.source === "plataforma") return { ok: true, msg: `Usas ${def.n} de Mirai: ya está lista y no hace falta probarla.` }
      if (!can(ctx.plan, "ia")) return { ok: false, msg: "La inteligencia artificial no está incluida en tu plan. Conoce los planes en /planes." }
      // La prueba queda en el uso de IA del hogar (feature "prueba"), como cualquier otra llamada.
      const t0 = Date.now()
      const model = modelIdOf(v)
      const who = { householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, plan: ctx.plan.id, feature: "prueba" as const, fuente: "ia" as const, provider: kind, dePlataforma: false }
      try {
        const r = await generateText({ model: modelFrom(v), prompt: "Responde solo con la palabra: listo", maxOutputTokens: 20 })
        const u = { input: r.usage?.inputTokens ?? 0, output: r.usage?.outputTokens ?? 0, cached: 0 }
        const modelId = r.response?.modelId || model
        await logUsage({ ...who, model: modelId, ...u, usd: costUSD(u, modelId, (await aiPlatformSettings()).precios), creditos: 0, ms: Date.now() - t0 })
        return done(true, `Conexión exitosa con ${def.n}. Respondió: “${r.text.trim().slice(0, 40)}”.`)
      } catch (e) {
        await logUsage({ ...who, model, ms: Date.now() - t0, ok: false, error: aiErrMsg(e) })
        throw e
      }
    }
    return { ok: true, msg: "Esta integración no necesita prueba." }
  } catch (e) {
    return done(false, aiErrMsg(e, def?.url))
  }
}

/**
 * Modelos de chat que la cuenta puede usar, leídos de la API del proveedor. Usa la clave recién escrita
 * o, si está vacía, la guardada (o la del despliegue para el AI Gateway).
 */
export async function listModels(kind: string, apiKey?: string): Promise<{ ok: boolean; models: ModelOption[]; rec?: string; msg?: string }> {
  const ctx = await requireRole("admin")
  const src = MODEL_LIST[kind]
  if (!src) return { ok: false, models: [], msg: "Este proveedor no tiene lista de modelos." }
  if (isAdminOnly(kind)) return { ok: false, models: [], msg: ADMIN_MSG }
  // Solo la clave escrita o la propia del hogar (nunca la de la plataforma ni la del despliegue).
  const saved = await getOwnIntegration(ctx.household.id, kind)
  const def = integrationByKind(kind)
  const key = apiKey?.trim() || saved?.secrets.apiKey || ""
  if (!key && !src.keyless) return { ok: false, models: [], msg: "Pega la clave de API para ver los modelos de tu cuenta." }
  try {
    const r = await fetch(src.url + (key && src.query ? src.query(key) : ""), { headers: key && src.headers ? src.headers(key) : {}, signal: AbortSignal.timeout(12000), cache: "no-store" })
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
    const { options, rec } = modelOptions(kind, parseModels(kind, await r.json()))
    if (!options.length) return { ok: false, models: [], msg: "Tu cuenta no tiene modelos de chat disponibles en este proveedor." }
    return { ok: true, models: options, rec }
  } catch (e) {
    return { ok: false, models: [], msg: aiErrMsg(e, def?.url) }
  }
}

async function metaOf(householdId: string, kind: string) {
  const { data } = await supabaseAdmin().from("integrations").select("meta").eq("household_id", householdId).eq("kind", kind).maybeSingle()
  return (data?.meta ?? {}) as Record<string, unknown>
}
