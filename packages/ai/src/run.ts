import { createHash } from "node:crypto"
import { generateObject, generateText, isStepCount, streamText, type LanguageModelUsage, type ModelMessage, type ToolSet } from "ai"
import type { z } from "zod"
import { aiErrMsg, aiSettings, modelFrom, modelIdOf } from "./model"
import { enabledOf, getIntegration, type IntegrationValue } from "@mirai/services/integrations/store"
import { planOf } from "@mirai/services/plan"
import { rt } from "@mirai/services/runtime"
import { can } from "@mirai/domain/plans"
import { AI_KINDS, integrationByKind } from "@mirai/services/integrations/registry"
import { AI_FEATURES, type AiFeature } from "./features"
import { systemFor } from "./prompts"
import { cheapModelFor, costFromMetadata, costUSD, creditsFor, estimateTokens } from "./pricing"
import { aiPlatformSettings, cacheGet, cacheKey, cacheSet, householdQuota, logUsage } from "./usage"
import { limitMsg, rateLimit as dbRateLimit } from "./limit"

// Punto único para llamar a la IA. Orden de cada llamada:
//   plan (Premium) → IA encendida → caché (respuesta idéntica reciente) → cupo de créditos → límite por hora →
//   proveedores en el orden del hogar (modelo barato primero en tareas simples) → registro en ai_usage → caché.
// El system prompt sale de prompts.ts según la función (`feature`), salvo que se pase uno propio.
// Movido de apps/web/lib/ai/run.ts (F2-F): corre igual en la web y en la API con el runtime de @mirai/services
// (rt().admin() para ai_usage, ai_cache, cupos y límites; rt().env() para AI_GATEWAY_API_KEY y Upstash).

export class AiUnavailable extends Error {}

/** Mensajes de AiUnavailable (la API los traduce a PLAN_REQUIRED, VALIDATION o RATE_LIMITED con el mismo texto). */
export const AI_PLAN_MSG = "La inteligencia artificial no está incluida en tu plan. Conoce los planes en /planes."
export const AI_OFF_MSG = "La inteligencia artificial está apagada. Actívala en Ajustes › Inteligencia artificial."

type Base = {
  householdId: string; bookId: string; userId?: string | null
  /** Para qué es la llamada (métricas, prompt, modelo, tope de salida y caché: lib/ai/features.ts). Por defecto "otro". */
  feature?: AiFeature
  /** Tono del chat (elige la variante del system prompt). */
  tono?: "simple" | "fin"
  system?: string; prompt?: string; messages?: ModelMessage[]; images?: { data: string; mediaType: string }[]
  maxOutputTokens?: number
  /** false = no usar la caché aunque la función la tenga. */
  cache?: boolean
}

const asMessages = (b: Base): ModelMessage[] =>
  b.messages ?? [{ role: "user", content: [...(b.images ?? []).map((i) => ({ type: "image" as const, image: i.data, mediaType: i.mediaType })), { type: "text" as const, text: b.prompt ?? "" }] }]

/** Límite de consultas de IA por hogar y hora con Upstash Redis (si la integración o las variables existen). */
async function rateLimit(householdId: string) {
  const up = await getIntegration(householdId, "upstash")
  const url = (up?.enabled && String(up.config.url || "")) || rt().env("UPSTASH_REDIS_REST_URL")
  const token = (up?.enabled && up.secrets.token) || rt().env("UPSTASH_REDIS_REST_TOKEN")
  if (!url || !token) {
    // Sin Upstash: el límite compartido de la base (rate_limits), por hogar y hora.
    const r = await dbRateLimit("ia", householdId)
    if (!r.ok) throw new AiUnavailable(limitMsg(r.resetMs, "Tu hogar hizo muchas consultas de IA en la última hora"))
    return
  }
  const max = +(up?.config.aiPerHour ?? 0) || 60
  const key = `mirai:ai:${householdId}:${new Date().toISOString().slice(0, 13)}`
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/pipeline`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify([["INCR", key], ["EXPIRE", key, 3600, "NX"]]) }).then((x) => x.json())
    if (+r?.[0]?.result > max) throw new AiUnavailable(`Llegaste al límite de ${max} consultas de IA por hora en tu hogar. Intenta de nuevo en un rato.`)
  } catch (e) { if (e instanceof AiUnavailable) throw e }
}

/** ¿El hogar puede usar IA ahora (plan + interruptor del libro)? Para saltarse trabajo previo si no. */
export async function aiAllowed(householdId: string, bookId: string) {
  const [plan, ia] = await Promise.all([planOf(householdId), aiSettings(bookId)])
  return can(plan, "ia") && ia.on !== false
}

/** Registra una respuesta resuelta con algoritmo (0 tokens) para medir el ahorro. */
export async function logAlgorithm(r: { householdId: string; bookId?: string | null; userId?: string | null; feature: AiFeature; evitados: number }) {
  await logUsage({ ...r, fuente: "algoritmo" })
}

type ProviderOptions = Parameters<typeof generateText>[0]["providerOptions"]

type Attempt = { v: IntegrationValue; model: string; cheap: boolean }

/** Intentos en orden: por cada proveedor, el modelo barato (si la tarea es simple y conviene) y luego el configurado. */
function attempts(list: IntegrationValue[], feature: AiFeature, precios: Record<string, { in: number; out: number }>): Attempt[] {
  const tier = AI_FEATURES[feature].tier
  return list.flatMap((v) => {
    const conf = modelIdOf(v)
    const cheap = tier === "simple" ? cheapModelFor(v.kind, conf, String(v.config.modelSimple ?? "") || null, precios) : null
    return cheap ? [{ v, model: cheap, cheap: true }, { v, model: conf, cheap: false }] : [{ v, model: conf, cheap: false }]
  })
}

const usageOf = (u: LanguageModelUsage | undefined) => ({ input: u?.inputTokens ?? 0, output: u?.outputTokens ?? 0, cached: u?.inputTokenDetails?.cacheReadTokens ?? 0 })

type Raw = { usage?: LanguageModelUsage; providerMetadata?: unknown; response?: { modelId?: string } }

async function run<T>(b: Base, call: (a: { model: ReturnType<typeof modelFrom>; system: string; messages: ModelMessage[]; providerOptions?: ProviderOptions; maxOutputTokens: number; anthropicCache: boolean }) => Promise<Raw & { value: T }>): Promise<{ value: T; provider: string; fuente: "ia" | "cache"; creditos: number }> {
  const feature: AiFeature = b.feature ?? "otro"
  const f = AI_FEATURES[feature]
  const [plan, ia, s] = await Promise.all([planOf(b.householdId), aiSettings(b.bookId), aiPlatformSettings()])
  if (!can(plan, "ia")) throw new AiUnavailable(AI_PLAN_MSG)
  if (ia.on === false) throw new AiUnavailable(AI_OFF_MSG)
  const system = b.system ?? systemFor(feature, { tono: b.tono })
  const messages = asMessages(b)
  const who = { householdId: b.householdId, bookId: b.bookId, userId: b.userId ?? null, plan: plan.id, feature }

  // Caché: la misma entrada (system + mensajes + imágenes) en las últimas horas → misma respuesta, 0 tokens.
  const ttl = Math.min(f.cacheH, s.cacheHoras)
  const key = b.cache !== false && ttl > 0
    ? cacheKey(feature, b.householdId, { system, prompt: b.prompt, messages: b.messages, images: (b.images ?? []).map((i) => createHash("sha256").update(i.data).digest("hex")) })
    : null
  if (key) {
    const hit = await cacheGet<T>(key)
    if (hit) { await logUsage({ ...who, fuente: "cache", evitados: hit.tokens }); return { value: hit.result, provider: "Respuesta guardada", fuente: "cache", creditos: 0 } }
  }

  // Proveedores y cupo: si el hogar agotó sus créditos, solo quedan los proveedores con su propia clave.
  let list = await enabledOf(b.householdId, [...new Set([...(ia.orden ?? []), ...AI_KINDS])].filter((k) => AI_KINDS.includes(k)))
  if (!list.length) throw new AiUnavailable("Activa un proveedor de IA en Ajustes › Inteligencia artificial (Gemini tiene plan gratis).")
  if (s.cuposActivo && list.some((v) => v.source === "plataforma")) {
    const q = await householdQuota(b.householdId, plan.id)
    if (q.nivel === "agotado") {
      list = list.filter((v) => v.source !== "plataforma")
      if (!list.length) throw new AiUnavailable(`Usaste todos los créditos de IA de este mes (${Math.round(q.cupo ?? 0).toLocaleString("es-CO")}). Se renuevan el primer día del próximo mes; mientras tanto Mirai sigue funcionando con tus reglas y cálculos. Mira el detalle en Ajustes › Uso de IA.`)
    }
  }
  await rateLimit(b.householdId)

  const maxOutputTokens = b.maxOutputTokens ?? f.maxOut
  let last: unknown
  for (const a of attempts(list, feature, s.precios)) {
    const t0 = Date.now()
    const provider = integrationByKind(a.v.kind)?.n ?? a.v.kind
    const dePlataforma = a.v.source === "plataforma"
    try {
      const anthropicCache = a.v.kind === "ai_anthropic" || a.model.startsWith("anthropic/")
      // En el modelo barato de OpenAI se pide razonamiento mínimo (los tokens de razonamiento se cobran como salida).
      const providerOptions: ProviderOptions = a.cheap && /gpt-5/.test(a.model) ? { openai: { reasoningEffort: "minimal" } } : undefined
      const r = await call({ model: modelFrom(a.v, a.model), system, messages, providerOptions, maxOutputTokens, anthropicCache })
      let u = usageOf(r.usage)
      // Algunos proveedores (o modelos gratis) no informan tokens: se estiman (~4 caracteres por token).
      // Cada imagen cuenta como ~1.000 tokens (orden de magnitud de una foto en los modelos de visión).
      if (!u.input && !u.output) u = { input: estimateTokens(system) + estimateTokens(b.prompt ?? JSON.stringify(b.messages ?? [])) + (b.images?.length ?? 0) * 1000, output: estimateTokens(typeof r.value === "string" ? r.value : JSON.stringify(r.value)), cached: 0 }
      const modelId = r.response?.modelId || a.model
      const real = costFromMetadata(r.providerMetadata)
      const usd = real ?? costUSD(u, modelId, s.precios)
      const creditos = creditsFor(usd, s.creditUsd, dePlataforma)
      await logUsage({ ...who, fuente: "ia", provider: a.v.kind, model: modelId, dePlataforma, ...u, usd, real: real !== null, creditos, ms: Date.now() - t0 })
      if (key) await cacheSet(key, { householdId: b.householdId, feature, result: r.value, tokens: u.input + u.output, ttlHours: ttl })
      return { value: r.value, provider, fuente: "ia", creditos }
    } catch (e) {
      last = e
      await logUsage({ ...who, fuente: "ia", provider: a.v.kind, model: a.model, dePlataforma, ms: Date.now() - t0, ok: false, error: aiErrMsg(e) })
    }
  }
  throw new Error(aiErrMsg(last))
}

/** System como primer mensaje con cacheControl para Anthropic (caché de prompt); en los demás, `system` normal. */
const withSystem = (system: string, messages: ModelMessage[], anthropicCache: boolean) =>
  anthropicCache
    ? { messages: [{ role: "system" as const, content: system, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } }, ...messages] }
    : { system, messages }

/** Texto libre con respaldo entre proveedores. */
export async function aiText(b: Base) {
  const r = await run(b, async ({ model, system, messages, providerOptions, maxOutputTokens, anthropicCache }) => {
    const x = await generateText({ model, ...withSystem(system, messages, anthropicCache), providerOptions, maxOutputTokens })
    return { value: x.text, usage: x.usage, providerMetadata: x.providerMetadata, response: x.response }
  })
  return { text: r.value, provider: r.provider, fuente: r.fuente, creditos: r.creditos }
}

/** Objeto validado con zod (equivale a .json() de la v4) con respaldo entre proveedores. */
export async function aiObject<S extends z.ZodType>(b: Base & { schema: S }) {
  const r = await run<z.infer<S>>(b, async ({ model, system, messages, providerOptions, maxOutputTokens, anthropicCache }) => {
    const x = await generateObject({ model, ...withSystem(system, messages, anthropicCache), schema: b.schema, providerOptions, maxOutputTokens })
    return { value: x.object as z.infer<S>, usage: x.usage, providerMetadata: x.providerMetadata, response: x.response }
  })
  return { object: r.value, provider: r.provider, fuente: r.fuente, creditos: r.creditos }
}

/**
 * Texto en streaming (chat), con herramientas y el mismo respaldo entre proveedores, créditos, límites y registro de uso
 * que aiText. Si un proveedor falla ANTES de mostrar algo, se prueba el siguiente; si falla a mitad de la respuesta, se
 * devuelve lo que alcanzó a llegar (no se repite el texto con otro proveedor). `shown()` dice si las herramientas ya
 * mostraron algo (p. ej. una tarjeta para confirmar) y por eso tampoco se debe reintentar.
 */
export async function aiStream(b: Base & { tools?: ToolSet; maxSteps?: number; abortSignal?: AbortSignal; onDelta: (text: string) => void; shown?: () => boolean }) {
  let emitted = false
  const r = await run(b, async ({ model, system, messages, providerOptions, maxOutputTokens, anthropicCache }) => {
    let text = ""
    let err: unknown = null
    const s = streamText({
      model, ...withSystem(system, messages, anthropicCache), ...(anthropicCache ? { allowSystemInMessages: true } : {}),
      providerOptions, maxOutputTokens, tools: b.tools, stopWhen: isStepCount(b.maxSteps ?? 4), abortSignal: b.abortSignal,
    })
    try {
      for await (const p of s.fullStream) {
        if (p.type === "text-delta" && p.text) { text += p.text; emitted = true; b.onDelta(p.text) }
        else if (p.type === "error") { err = p.error; break }
        else if (p.type === "abort") break
      }
    } catch (e) { err = e }
    if (err && !emitted && !b.shown?.() && !b.abortSignal?.aborted) throw err
    // Uso real del proveedor (si lo informa a tiempo); si no, run() lo estima.
    const settle = <T,>(x: PromiseLike<T>) => Promise.race([Promise.resolve(x), new Promise<undefined>((ok) => setTimeout(() => ok(undefined), 1500))]).catch(() => undefined)
    const [usage, providerMetadata, response] = await Promise.all([settle(s.totalUsage), settle(s.providerMetadata), settle(s.response)])
    return { value: text, usage: usage ?? undefined, providerMetadata, response: response ? { modelId: response.modelId } : undefined }
  })
  return { text: r.value, provider: r.provider, creditos: r.creditos }
}

/** Tokens que se ahorran al resolver algo sin IA: el prompt que se habría enviado + una respuesta típica. */
export const tokensFor = (feature: AiFeature, prompt: string) => estimateTokens(systemFor(feature)) + estimateTokens(prompt) + Math.round(AI_FEATURES[feature].maxOut / 6)
