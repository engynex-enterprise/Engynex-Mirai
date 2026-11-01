import "server-only"
import type { LanguageModel } from "ai"
import { createGateway } from "ai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createGroq } from "@ai-sdk/groq"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { AI_KINDS, integrationByKind } from "@/lib/integrations/registry"
import { enabledOf, type IntegrationValue } from "@/features/integrations/store"
import { supabaseAdmin } from "@/lib/supabase/admin"

const def = (kind: string) => String(integrationByKind(kind)?.fields.find((f) => f.k === "model")?.def ?? "")

/** Construye el modelo de un proveedor con su clave y modelo configurados. */
export function modelFrom(v: IntegrationValue): LanguageModel {
  const m = String(v.config.model || def(v.kind))
  const key = v.secrets.apiKey
  switch (v.kind) {
    case "ai_gateway": return createGateway({ apiKey: key || process.env.AI_GATEWAY_API_KEY })(m)
    case "ai_gemini": return createGoogleGenerativeAI({ apiKey: key })(m)
    case "ai_groq": return createGroq({ apiKey: key })(m)
    case "ai_openrouter": return createOpenRouter({ apiKey: key }).chat(m)
    case "ai_anthropic": return createAnthropic({ apiKey: key })(m)
    case "ai_openai": return createOpenAI({ apiKey: key })(m)
    default: throw new Error(`Proveedor de IA desconocido: ${v.kind}`)
  }
}

export type AiChoice = { model: LanguageModel; kind: string; name: string }

/**
 * Proveedores de IA activos del hogar, en el orden de respaldo configurado en book_settings.ia.orden
 * (por defecto: Gateway, Gemini, Groq, OpenRouter, Claude, OpenAI). Si uno falla se usa el siguiente.
 */
export async function aiProviders(householdId: string, order?: string[]): Promise<AiChoice[]> {
  const kinds = [...new Set([...(order ?? []), ...AI_KINDS])].filter((k) => AI_KINDS.includes(k))
  const list = await enabledOf(householdId, kinds)
  return list.map((v) => ({ model: modelFrom(v), kind: v.kind, name: integrationByKind(v.kind)!.n }))
}

/** Orden y estado de la IA guardados en los ajustes del libro. */
export async function aiSettings(bookId: string) {
  const { data } = await supabaseAdmin().from("book_settings").select("ia").eq("book_id", bookId).single()
  return (data?.ia ?? {}) as { on?: boolean; orden?: string[]; autocat?: boolean; hormiga?: boolean; ocr?: boolean; consejero?: boolean; asist?: boolean }
}

/** Mensaje en español para errores de proveedores (aiErrMsg de la v4). */
export function aiErrMsg(e: unknown, url?: string) {
  const m = String((e as Error)?.message ?? e)
  if (/credit card|customer_verification/i.test(m)) return "El AI Gateway de Vercel pide registrar una tarjeta para activar los créditos gratis."
  if (/401|403|invalid|api key|unauthorized/i.test(m)) return `La clave no es válida o no tiene permisos.${url ? ` Revísala en ${url}.` : ""}`
  if (/404|model/i.test(m)) return "El modelo no existe o no está disponible en tu cuenta. Prueba con el modelo sugerido."
  if (/429|quota|rate/i.test(m)) return "Se alcanzó el límite de uso del proveedor. Intenta más tarde o usa otro proveedor."
  if (/fetch|network|ENOTFOUND|timeout/i.test(m)) return "No pudimos conectarnos con el proveedor. Revisa tu conexión."
  return m.slice(0, 200)
}
