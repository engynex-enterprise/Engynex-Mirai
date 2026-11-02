// Precios de los modelos de IA y créditos. Puro (sin red) para probarlo con Vitest.
//
// Los precios son ESTIMADOS (US$ por millón de tokens, lista pública de cada proveedor a finales de 2026) y sirven
// solo cuando el proveedor no informa el costo. El AI Gateway de Vercel y OpenRouter sí lo informan en
// providerMetadata; en ese caso se usa el costo real. El administrador puede sobrescribir cualquier precio en
// consola › Uso de IA (platform_settings.ia_precios), sin desplegar.

export type Price = { in: number; out: number; cached?: number }
export type PriceTable = Record<string, Price>

/**
 * Precio por modelo. La clave se compara sin el prefijo del proveedor ("google/gemini-2.5-flash" → "gemini-2.5-flash")
 * y por prefijo, de lo más específico a lo más general ("gemini-2.5-flash-lite" gana sobre "gemini-2.5-flash").
 */
export const DEFAULT_PRICES: PriceTable = {
  // Google
  "gemini-2.5-flash-lite": { in: 0.1, out: 0.4, cached: 0.025 },
  "gemini-flash-lite-latest": { in: 0.1, out: 0.4, cached: 0.025 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5, cached: 0.075 },
  "gemini-flash-latest": { in: 0.3, out: 2.5, cached: 0.075 },
  "gemini-2.5-pro": { in: 1.25, out: 10, cached: 0.31 },
  "gemini-3-flash": { in: 0.5, out: 3, cached: 0.05 },
  "gemini-3-pro": { in: 2, out: 12, cached: 0.2 },
  "gemini-2.0-flash": { in: 0.1, out: 0.4, cached: 0.025 },
  // OpenAI
  "gpt-5-nano": { in: 0.05, out: 0.4, cached: 0.005 },
  "gpt-5-mini": { in: 0.25, out: 2, cached: 0.025 },
  "gpt-5": { in: 1.25, out: 10, cached: 0.125 },
  "gpt-4.1-nano": { in: 0.1, out: 0.4, cached: 0.025 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6, cached: 0.1 },
  "gpt-4o-mini": { in: 0.15, out: 0.6, cached: 0.075 },
  "gpt-oss-120b": { in: 0.15, out: 0.75 },
  "gpt-oss-20b": { in: 0.075, out: 0.3 },
  // Anthropic
  "claude-haiku-4": { in: 1, out: 5, cached: 0.1 },
  "claude-3-5-haiku": { in: 0.8, out: 4, cached: 0.08 },
  "claude-sonnet-4": { in: 3, out: 15, cached: 0.3 },
  "claude-opus-4": { in: 5, out: 25, cached: 0.5 },
  // Groq (modelos abiertos)
  "llama-3.1-8b-instant": { in: 0.05, out: 0.08 },
  "llama-3.3-70b-versatile": { in: 0.59, out: 0.79 },
  "llama-4": { in: 0.11, out: 0.34 },
  "qwen": { in: 0.29, out: 0.59 },
  "kimi-k2": { in: 1, out: 3 },
}

/** Precio cuando el modelo no está en la tabla (conservador: un modelo "flash/mini" típico). */
export const FALLBACK_PRICE: Price = { in: 0.5, out: 2 }

/** 1 crédito = US$ 0,001 por defecto (se cambia en consola › Uso de IA). */
export const DEFAULT_CREDIT_USD = 0.001

/**
 * Cupo mensual de créditos por plan, por defecto (se cambia en consola › Uso de IA; null = sin límite).
 * Premium: 1.000 créditos = US$ 1 al mes, ~7 % del precio del plan ($ 14.900). Con Gemini Flash alcanza para unas
 * 700 preguntas al chat o miles de clasificaciones (una clasificación con el modelo barato cuesta ~0,1 créditos).
 * Gratis: el plan no incluye IA; 100 créditos por si el administrador la activa para ese plan.
 */
export const DEFAULT_CUPOS: Record<string, number | null> = { premium: 1000, gratis: 100 }

const bare = (model: string) => model.toLowerCase().replace(/^[a-z0-9-]+\//, "").replace(/:free$/, "")

/** Precio de un modelo: primero lo que puso el administrador, luego la tabla, luego el de respaldo. */
export function priceFor(model: string | null | undefined, overrides: PriceTable = {}): Price & { known: boolean } {
  if (!model) return { ...FALLBACK_PRICE, known: false }
  if (/:free$|^openrouter\/free$/i.test(model)) return { in: 0, out: 0, cached: 0, known: true }
  const m = bare(model)
  const pick = (t: PriceTable) => {
    const exact = t[model] ?? t[m]
    if (exact) return exact
    const key = Object.keys(t).filter((k) => m.startsWith(bare(k))).sort((a, b) => b.length - a.length)[0]
    return key ? t[key] : undefined
  }
  const p = pick(overrides) ?? pick(DEFAULT_PRICES)
  return p ? { ...p, known: true } : { ...FALLBACK_PRICE, known: false }
}

export type Usage = { input?: number; output?: number; cached?: number }

/** Costo estimado en US$: los tokens cacheados se cobran a su precio (si no hay, al precio normal). */
export function costUSD(u: Usage, model: string | null | undefined, overrides: PriceTable = {}) {
  const p = priceFor(model, overrides)
  const cached = Math.min(u.cached ?? 0, u.input ?? 0)
  const fresh = (u.input ?? 0) - cached
  return (fresh * p.in + cached * (p.cached ?? p.in) + (u.output ?? 0) * p.out) / 1e6
}

/** Costo real que informa el proveedor en providerMetadata (AI Gateway: gateway.cost; OpenRouter: usage.cost). */
export function costFromMetadata(meta: unknown): number | null {
  const m = (meta ?? {}) as Record<string, Record<string, unknown> | undefined>
  const cands = [m.gateway?.cost, m.gateway?.marketCost, (m.openrouter?.usage as Record<string, unknown> | undefined)?.cost]
  for (const c of cands) {
    const n = typeof c === "string" ? parseFloat(c) : typeof c === "number" ? c : NaN
    if (Number.isFinite(n) && n >= 0) return n
  }
  return null
}

/** Créditos que gasta una llamada (solo si la paga la plataforma). */
export const creditsFor = (usd: number, creditUsd = DEFAULT_CREDIT_USD, dePlataforma = true) =>
  dePlataforma ? Math.round((usd / (creditUsd > 0 ? creditUsd : DEFAULT_CREDIT_USD)) * 1000) / 1000 : 0

/** Estimado de tokens de un texto (~4 caracteres por token en español). */
export const estimateTokens = (s: string | null | undefined) => Math.ceil((s?.length ?? 0) / 4)

/** Modelo barato por proveedor para las tareas simples (clasificar, extraer, reescribir). */
export const CHEAP_MODEL: Record<string, string> = {
  ai_gateway: "google/gemini-2.5-flash-lite",
  ai_gemini: "gemini-flash-lite-latest",
  ai_anthropic: "claude-haiku-4-5",
  ai_openai: "gpt-5-nano",
}

/**
 * Modelo a usar en una tarea "simple": el barato del proveedor (o el que diga `modelSimple` en la configuración de la
 * integración) solo si de verdad es más barato que el configurado; si no, null (se usa el configurado).
 */
export function cheapModelFor(kind: string, configured: string, modelSimple?: string | null, overrides: PriceTable = {}): string | null {
  const cand = (modelSimple || CHEAP_MODEL[kind] || "").trim()
  if (!cand || cand === configured) return null
  const a = priceFor(configured, overrides), b = priceFor(cand, overrides)
  return b.in + b.out < a.in + a.out ? cand : null
}
