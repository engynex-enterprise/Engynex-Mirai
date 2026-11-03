// Proveedores de IA de la nube de la plataforma (V7-P): Vertex AI, Amazon Bedrock y Azure OpenAI, más la revisión de
// que el AI Gateway tenga con qué entrar. Sin llaves de larga vida cuando la nube lo permite (ADC, rol del contenedor,
// identidad administrada). Las credenciales y la red se inyectan (`env`, `fetch`) para probarlo sin llamar a nadie.
// Solo servidor.
import type { LanguageModel } from "ai"
import { createVertex, type GoogleVertexProviderSettings } from "@ai-sdk/google-vertex"
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"
import { createAzure } from "@ai-sdk/azure"
import { integrationByKind } from "@mirai/services/integrations/registry"
import type { IntegrationValue } from "@mirai/services/integrations/store"
import { aiErrMsg } from "../errors"
import { modelOptions, parseModels, type ModelOption } from "../models"
import { awsCredentialProvider, azureTokenProvider, gcpMetadataToken, hasAwsCredentials, sigV4Headers } from "./cloud-auth"
import type { EnvFn } from "./env"

export const CLOUD_AI_KINDS = ["ai_vertex", "ai_bedrock", "ai_azure"] as const

export type PlatformDeps = {
  env: EnvFn
  fetch?: typeof fetch
  /** Solo pruebas: reemplaza la autenticación de Google (ADC) por un cliente falso. */
  googleAuthOptions?: GoogleVertexProviderSettings["googleAuthOptions"]
}

type V = Pick<IntegrationValue, "kind" | "config" | "secrets" | "source">
const str = (x: unknown) => (typeof x === "string" ? x.trim() : "")

/** Proyecto y región de Vertex: lo de la consola, si no las variables del despliegue. */
export const vertexSettings = (v: V, env: EnvFn) => ({
  project: str(v.config.project) || env("GOOGLE_VERTEX_PROJECT") || "",
  location: str(v.config.location) || env("GOOGLE_VERTEX_LOCATION") || "us-central1",
})

/** Región de Bedrock: la de la consola, AI_BEDROCK_REGION o la del contenedor (AWS_REGION). */
export const bedrockRegion = (v: V, env: EnvFn) => str(v.config.region) || env("AI_BEDROCK_REGION") || env("AWS_REGION") || env("AWS_DEFAULT_REGION") || ""

/**
 * Dirección v1 de Azure OpenAI a partir de lo que pegue el administrador: "mi-recurso",
 * "https://mi-recurso.openai.azure.com", ".../openai" o ".../openai/v1" → "https://mi-recurso.openai.azure.com/openai/v1".
 */
export function azureBaseURL(endpoint: string): string {
  const e = endpoint.trim().replace(/\/+$/, "")
  if (!e) return ""
  if (!e.includes("://")) return `https://${e}.openai.azure.com/openai/v1`
  if (/\/openai\/v1$/i.test(e)) return e
  if (/\/openai$/i.test(e)) return `${e}/v1`
  return `${e}/openai/v1`
}

export const azureEndpoint = (v: V, env: EnvFn) => azureBaseURL(str(v.config.endpoint) || env("AZURE_OPENAI_ENDPOINT") || "")
const azureKey = (v: V, env: EnvFn) => v.secrets.apiKey || env("AZURE_OPENAI_API_KEY") || ""
const bedrockKey = (v: V, env: EnvFn) => v.secrets.apiKey || env("AWS_BEARER_TOKEN_BEDROCK") || ""

/**
 * ¿Vale la pena intentar este proveedor? Para los de la plataforma revisa que haya con qué entrar (sin red): así, sin
 * AI_GATEWAY_API_KEY o sin proyecto de Vertex, ese proveedor ni se intenta ni deja un error en ai_usage. Los proveedores
 * con clave del hogar siempre se intentan (si falta la clave, modelFrom lo explica).
 */
export function providerReady(v: V, env: EnvFn): boolean {
  switch (v.kind) {
    case "ai_gateway":
      // En Vercel el Gateway entra también con el token OIDC del despliegue.
      return v.source === "hogar" || !!(v.secrets.apiKey || env("AI_GATEWAY_API_KEY") || env("VERCEL_OIDC_TOKEN") || env("VERCEL"))
    case "ai_vertex": return !!vertexSettings(v, env).project
    case "ai_bedrock": return !!bedrockRegion(v, env) && !!(bedrockKey(v, env) || hasAwsCredentials(env))
    // Sin clave se usa la identidad administrada (no se puede saber sin red si existe: se intenta).
    case "ai_azure": return !!azureEndpoint(v, env)
    default: return true
  }
}

const HOGAR_MSG = "Este proveedor lo configura solo el administrador de Mirai."

/** Modelo de Vertex AI, Bedrock o Azure OpenAI con las credenciales de la plataforma. */
export function cloudModel(v: V, modelId: string, deps: PlatformDeps): LanguageModel {
  // Nunca con la cuenta de un hogar: usaría la nube de Mirai sin descontar créditos.
  if (v.source === "hogar") throw new Error(HOGAR_MSG)
  const { env } = deps
  switch (v.kind) {
    case "ai_vertex": {
      const { project, location } = vertexSettings(v, env)
      if (!project) throw new Error("Falta el proyecto de Google Cloud de Vertex AI (GOOGLE_VERTEX_PROJECT o consola › Integraciones globales).")
      // ADC: en Cloud Run, la cuenta de servicio del servicio (roles/aiplatform.user); en local, gcloud auth application-default login.
      return createVertex({ project, location, fetch: deps.fetch, googleAuthOptions: deps.googleAuthOptions })(modelId)
    }
    case "ai_bedrock": {
      const region = bedrockRegion(v, env)
      if (!region) throw new Error("Falta la región de Amazon Bedrock (AI_BEDROCK_REGION o consola › Integraciones globales).")
      const key = bedrockKey(v, env)
      return createAmazonBedrock(key
        ? { region, apiKey: key, fetch: deps.fetch }
        : { region, credentialProvider: awsCredentialProvider(env, deps.fetch), fetch: deps.fetch })(modelId)
    }
    case "ai_azure": {
      const baseURL = azureEndpoint(v, env)
      if (!baseURL) throw new Error("Falta la dirección del recurso de Azure OpenAI (AZURE_OPENAI_ENDPOINT o consola › Integraciones globales).")
      const key = azureKey(v, env)
      // El nombre del modelo es el del despliegue en Azure.
      return createAzure(key ? { baseURL, apiKey: key, fetch: deps.fetch } : { baseURL, tokenProvider: azureTokenProvider(env, deps.fetch), fetch: deps.fetch }).chat(modelId)
    }
    default: throw new Error(`Proveedor de IA desconocido: ${v.kind}`)
  }
}

/**
 * De dónde sale la lista de modelos de cada nube (la usa listCloudModels). Respuestas en models.ts › parseModels.
 * - Vertex: modelos de Google publicados en Model Garden (token de la cuenta de servicio del servidor de metadatos).
 * - Bedrock: modelos con salida de texto + perfiles de inferencia del sistema (firma SigV4 con el rol del contenedor o
 *   la clave de API de Bedrock). Si no se puede firmar, se usa el modelo por defecto del registro (`def`).
 * - Azure: modelos del recurso (/openai/v1/models). Son modelos base: el despliegue debe llamarse igual que el modelo.
 */
export async function cloudModelRequests(v: V, deps: PlatformDeps): Promise<{ url: string; headers: Record<string, string> }[]> {
  const { env } = deps
  const fetcher = deps.fetch ?? fetch
  switch (v.kind) {
    case "ai_vertex": {
      const { location } = vertexSettings(v, env)
      const host = location === "global" ? "aiplatform.googleapis.com" : location === "us" || location === "eu" ? `aiplatform.${location}.rep.googleapis.com` : `${location}-aiplatform.googleapis.com`
      return [{ url: `https://${host}/v1beta1/publishers/google/models?pageSize=500`, headers: { Authorization: `Bearer ${await gcpMetadataToken(fetcher)}` } }]
    }
    case "ai_bedrock": {
      const region = bedrockRegion(v, env)
      if (!region) throw new Error("Falta la región de Amazon Bedrock.")
      const urls = [`https://bedrock.${region}.amazonaws.com/foundation-models?byOutputModality=TEXT`, `https://bedrock.${region}.amazonaws.com/inference-profiles?maxResults=1000&typeEquals=SYSTEM_DEFINED`]
      const key = bedrockKey(v, env)
      if (key) return urls.map((url) => ({ url, headers: { Authorization: `Bearer ${key}` } }))
      const creds = await awsCredentialProvider(env, fetcher)()
      return urls.map((url) => ({ url, headers: sigV4Headers({ url, region, service: "bedrock", creds }) }))
    }
    case "ai_azure": {
      const base = azureEndpoint(v, env)
      if (!base) throw new Error("Falta la dirección del recurso de Azure OpenAI.")
      const key = azureKey(v, env)
      return [{ url: `${base}/models`, headers: key ? { "api-key": key } : { Authorization: `Bearer ${await azureTokenProvider(env, fetcher)()}` } }]
    }
    default: return []
  }
}

export type CloudModelList = { ok: boolean; models: ModelOption[]; rec?: string; msg?: string }

/**
 * Modelos de chat de la cuenta de la nube de la plataforma, leídos de su API (para la consola: nunca se escriben a mano).
 * Si no se pueden leer (p. ej. en local, sin servidor de metadatos, o Bedrock sin permiso de lista), `rec` es el
 * modelo por defecto del registro para que la consola tenga con qué seguir.
 */
export async function listCloudModels(v: V, deps: PlatformDeps): Promise<CloudModelList> {
  const def = String(integrationByKind(v.kind)?.fields.find((f) => f.k === "model")?.def ?? "") || undefined
  const fetcher = deps.fetch ?? fetch
  try {
    const reqs = await cloudModelRequests(v, deps)
    if (!reqs.length) return { ok: false, models: [], rec: def, msg: "Este proveedor no tiene lista de modelos." }
    const rows: ReturnType<typeof parseModels> = []
    for (const q of reqs) {
      const r = await fetcher(q.url, { headers: q.headers, signal: AbortSignal.timeout(12000) })
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
      rows.push(...parseModels(v.kind, await r.json()))
    }
    const { options, rec } = modelOptions(v.kind, rows.filter((m, i) => rows.findIndex((x) => x.id === m.id) === i))
    if (!options.length) return { ok: false, models: [], rec: def, msg: "La cuenta no tiene modelos de chat disponibles en este proveedor." }
    return { ok: true, models: options, rec }
  } catch (e) {
    return { ok: false, models: [], rec: def, msg: aiErrMsg(e, integrationByKind(v.kind)?.url) }
  }
}
