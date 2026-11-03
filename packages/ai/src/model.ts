import type { LanguageModel } from "ai"
import { createGateway } from "ai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createGroq } from "@ai-sdk/groq"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { AI_KINDS, integrationByKind } from "@mirai/services/integrations/registry"
import { enabledOf, type IntegrationValue } from "@mirai/services/integrations/store"
import { rt } from "@mirai/services/runtime"

const supabaseAdmin = () => rt().admin()

const def = (kind: string) => String(integrationByKind(kind)?.fields.find((f) => f.k === "model")?.def ?? "")

/** Nombre del modelo configurado en una integración (o el de por defecto del registro). */
export const modelIdOf = (v: Pick<IntegrationValue, "kind" | "config">) => String(v.config.model || def(v.kind))

/** Construye el modelo de un proveedor con su clave y modelo configurados (o `override`, p. ej. el modelo barato). */
export function modelFrom(v: IntegrationValue, override?: string): LanguageModel {
  const m = override || modelIdOf(v)
  const key = v.secrets.apiKey
  switch (v.kind) {
    case "ai_gateway":
      // La clave del despliegue solo vale cuando la IA es la de la plataforma (se cobra en créditos). Un hogar con su
      // propio Gateway debe traer su clave: sin esto, usaría la de Mirai sin descontar créditos.
      if (!key && v.source === "hogar") throw new Error("Pega la clave de tu Vercel AI Gateway en Ajustes › Inteligencia artificial.")
      return createGateway({ apiKey: key || rt().env("AI_GATEWAY_API_KEY") })(m)
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

export { aiErrMsg } from "./errors"
