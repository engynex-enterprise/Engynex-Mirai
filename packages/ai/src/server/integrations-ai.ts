// Probar la conexión y listar los modelos de un proveedor de IA del hogar (Ajustes › Inteligencia artificial). Antes en
// apps/web/features/integrations/actions.ts (testIntegration y listModels); F2-E dejó el CRUD en @mirai/services y estas
// dos quedaron para F2-F porque usan el AI SDK. La web (Server Actions) y la API (POST /v1/books/:b/integrations/:kind/
// {test,models}) revisan el rol antes (editor para probar, admin para listar). Solo servidor.
import { generateText } from "ai"
import { can } from "@mirai/domain/plans"
import { ADMIN_MSG } from "@mirai/services/integrations/household"
import { integrationByKind, isAdminOnly } from "@mirai/services/integrations/registry"
import { getIntegration, getOwnIntegration } from "@mirai/services/integrations/store"
import { rt } from "@mirai/services/runtime"
import { aiErrMsg, modelFrom, modelIdOf } from "../model"
import { MODEL_LIST, modelOptions, parseModels, type ModelOption } from "../models"
import { costUSD } from "../pricing"
import { aiPlatformSettings, logUsage } from "../usage"
import type { AiCtx } from "./ctx"

async function metaOf(householdId: string, kind: string) {
  const { data } = await rt().admin().from("integrations").select("meta").eq("household_id", householdId).eq("kind", kind).maybeSingle()
  return (data?.meta ?? {}) as Record<string, unknown>
}

/** Prueba la conexión de un proveedor de IA del hogar. Devuelve un mensaje para la persona (y lo guarda en meta). */
export async function testAiIntegration(ctx: AiCtx, kind: string): Promise<{ ok: boolean; msg: string }> {
  if (isAdminOnly(kind)) return { ok: false, msg: ADMIN_MSG }
  const v = await getIntegration(ctx.household.id, kind)
  const def = integrationByKind(kind)
  const done = async (ok: boolean, msg: string) => {
    if (v) await rt().admin().from("integrations").update({ meta: { ...(await metaOf(ctx.household.id, kind)), lastTest: new Date().toISOString(), lastOk: ok, lastMsg: msg } as never }).eq("household_id", ctx.household.id).eq("kind", kind)
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

export type ModelList = { ok: boolean; models: ModelOption[]; rec?: string; msg?: string }

/**
 * Modelos de chat que la cuenta puede usar, leídos de la API del proveedor. Usa la clave recién escrita o, si está
 * vacía, la propia del hogar (nunca la de la plataforma ni la del despliegue). `fetcher` = fetch (las pruebas lo cambian).
 */
export async function listAiModels(ctx: Pick<AiCtx, "household">, kind: string, apiKey?: string, fetcher: typeof fetch = fetch): Promise<ModelList> {
  const src = MODEL_LIST[kind]
  if (!src) return { ok: false, models: [], msg: "Este proveedor no tiene lista de modelos." }
  if (isAdminOnly(kind)) return { ok: false, models: [], msg: ADMIN_MSG }
  const saved = await getOwnIntegration(ctx.household.id, kind)
  const def = integrationByKind(kind)
  const key = apiKey?.trim() || saved?.secrets.apiKey || ""
  if (!key && !src.keyless) return { ok: false, models: [], msg: "Pega la clave de API para ver los modelos de tu cuenta." }
  try {
    const r = await fetcher(src.url + (key && src.query ? src.query(key) : ""), { headers: key && src.headers ? src.headers(key) : {}, signal: AbortSignal.timeout(12000), cache: "no-store" })
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
    const { options, rec } = modelOptions(kind, parseModels(kind, await r.json()))
    if (!options.length) return { ok: false, models: [], msg: "Tu cuenta no tiene modelos de chat disponibles en este proveedor." }
    return { ok: true, models: options, rec }
  } catch (e) {
    return { ok: false, models: [], msg: aiErrMsg(e, def?.url) }
  }
}
