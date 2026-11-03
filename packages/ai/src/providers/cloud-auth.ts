// Credenciales de corta vida de cada nube, sin sus SDK (solo `fetch` y node:crypto). Solo servidor.
// - AWS: variables AWS_* o el punto de credenciales del contenedor (ECS: AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
//   EKS Pod Identity y otros: AWS_CONTAINER_CREDENTIALS_FULL_URI + token). Firma SigV4 para las consultas de solo
//   lectura (lista de modelos); las llamadas al modelo las firma @ai-sdk/amazon-bedrock con estas credenciales.
// - Azure: identidad administrada (IDENTITY_ENDPOINT/IDENTITY_HEADER de Container Apps y App Service, o IMDS en VM/AKS).
// - Google: token de la cuenta de servicio del servidor de metadatos (Cloud Run) para listar modelos; las llamadas al
//   modelo usan ADC dentro de @ai-sdk/google-vertex.
// Los tokens se guardan en memoria hasta 5 minutos antes de vencer. Nunca se registran.
import { createHash, createHmac } from "node:crypto"
import { readFile } from "node:fs/promises"
import type { EnvFn } from "./env"

export type AwsCredentials = { accessKeyId: string; secretAccessKey: string; sessionToken?: string }

const MARGIN_MS = 5 * 60_000
const cache = new Map<string, { value: unknown; exp: number }>()

/** Borra los tokens guardados (pruebas). */
export const resetCloudAuth = () => cache.clear()

async function cached<T>(key: string, load: () => Promise<{ value: T; exp: number }>): Promise<T> {
  const hit = cache.get(key)
  if (hit && hit.exp - MARGIN_MS > Date.now()) return hit.value as T
  const r = await load()
  cache.set(key, r)
  return r.value
}

/** Vence en: fecha ISO, segundos epoch (número o texto) o, si no se sabe, en 15 minutos. */
const expiry = (v: unknown, inSeconds?: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? +v : NaN
  if (Number.isFinite(n)) return n * 1000
  const d = typeof v === "string" ? Date.parse(v) : NaN
  if (Number.isFinite(d)) return d
  const s = Number(inSeconds)
  return Date.now() + (Number.isFinite(s) && s > 0 ? s * 1000 : 15 * 60_000)
}

// ── AWS ────────────────────────────────────────────────────────────────────────────────────────────────────────

// Mismas reglas del SDK de AWS: FULL_URI solo por https o hacia el agente local de ECS/EKS (nunca a otro host por http).
const AWS_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "169.254.170.2", "169.254.170.23", "[fd00:ec2::23]"])

/** ¿Hay de dónde sacar credenciales de AWS (sin contar la clave de API de Bedrock)? */
export const hasAwsCredentials = (env: EnvFn) =>
  !!((env("AWS_ACCESS_KEY_ID") && env("AWS_SECRET_ACCESS_KEY")) || env("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI") || env("AWS_CONTAINER_CREDENTIALS_FULL_URI"))

/**
 * Cadena de credenciales de AWS (lo justo para Bedrock): 1) AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (+ AWS_SESSION_TOKEN);
 * 2) credenciales del contenedor (ECS/EKS), renovadas antes de vencer. Sin ninguna: error en español.
 */
export function awsCredentialProvider(env: EnvFn, fetcher: typeof fetch = fetch): () => Promise<AwsCredentials> {
  return async () => {
    const id = env("AWS_ACCESS_KEY_ID"), secret = env("AWS_SECRET_ACCESS_KEY")
    if (id && secret) return { accessKeyId: id, secretAccessKey: secret, sessionToken: env("AWS_SESSION_TOKEN") || undefined }
    const rel = env("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI"), full = env("AWS_CONTAINER_CREDENTIALS_FULL_URI")
    const url = rel ? `http://169.254.170.2${rel.startsWith("/") ? "" : "/"}${rel}` : full
    if (!url) throw new Error("Amazon Bedrock no tiene credenciales: corre en AWS con un rol (ECS/EKS) o define AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY.")
    if (!rel) {
      const u = new URL(url)
      if (u.protocol !== "https:" && !AWS_LOCAL_HOSTS.has(u.hostname)) throw new Error("AWS_CONTAINER_CREDENTIALS_FULL_URI debe ser https o del agente local del contenedor.")
    }
    return cached(`aws:${url}`, async () => {
      const file = env("AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE")
      const token = file ? (await readFile(file, "utf8")).trim() : env("AWS_CONTAINER_AUTHORIZATION_TOKEN")
      const r = await fetcher(url, { headers: token ? { Authorization: token } : {}, signal: AbortSignal.timeout(5000) })
      if (!r.ok) throw new Error(`No se pudieron leer las credenciales del contenedor de AWS (${r.status}).`)
      const j = (await r.json()) as { AccessKeyId?: string; SecretAccessKey?: string; Token?: string; Expiration?: string }
      if (!j.AccessKeyId || !j.SecretAccessKey) throw new Error("El contenedor de AWS no entregó credenciales.")
      return { value: { accessKeyId: j.AccessKeyId, secretAccessKey: j.SecretAccessKey, sessionToken: j.Token || undefined }, exp: expiry(j.Expiration) }
    })
  }
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex")
const hmac = (k: string | Buffer, s: string) => createHmac("sha256", k).update(s, "utf8").digest()
/** Codificación de SigV4 (RFC 3986: también ! ' ( ) *). */
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

/**
 * Encabezados firmados con AWS Signature V4 para una petición sin cuerpo (GET de solo lectura, p. ej. la lista de
 * modelos de Bedrock). `now` = la hora de la firma (las pruebas la fijan).
 */
export function sigV4Headers(o: { method?: string; url: string; region: string; service: string; creds: AwsCredentials; now?: Date; body?: string }): Record<string, string> {
  const u = new URL(o.url)
  const amzDate = (o.now ?? new Date()).toISOString().replace(/[:-]|\.\d{3}/g, "")
  const day = amzDate.slice(0, 8)
  const headers: Record<string, string> = { host: u.host, "x-amz-date": amzDate }
  if (o.creds.sessionToken) headers["x-amz-security-token"] = o.creds.sessionToken
  const names = Object.keys(headers).sort()
  const query = [...u.searchParams].map(([k, v]) => [enc(k), enc(v)]).sort(([a, b], [c, d]) => (a < c ? -1 : a > c ? 1 : b < d ? -1 : b > d ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("&")
  const path = u.pathname.split("/").map((s) => enc(decodeURIComponent(s))).join("/") || "/"
  const canonical = [o.method ?? "GET", path, query, names.map((k) => `${k}:${headers[k].trim()}\n`).join(""), names.join(";"), sha256(o.body ?? "")].join("\n")
  const scope = `${day}/${o.region}/${o.service}/aws4_request`
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n")
  const key = hmac(hmac(hmac(hmac(`AWS4${o.creds.secretAccessKey}`, day), o.region), o.service), "aws4_request")
  const signature = createHmac("sha256", key).update(toSign, "utf8").digest("hex")
  const { host: _host, ...rest } = headers
  return { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${o.creds.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` }
}

// ── Azure ──────────────────────────────────────────────────────────────────────────────────────────────────────

const AZURE_RESOURCE = "https://cognitiveservices.azure.com"

/**
 * Token de Microsoft Entra para Azure OpenAI con la identidad administrada del servidor:
 * Container Apps / App Service (IDENTITY_ENDPOINT + IDENTITY_HEADER) o, si no, IMDS (169.254.169.254, VM y AKS).
 * AZURE_CLIENT_ID elige una identidad asignada por el usuario.
 */
export function azureTokenProvider(env: EnvFn, fetcher: typeof fetch = fetch): () => Promise<string> {
  return async () => {
    const ep = env("IDENTITY_ENDPOINT"), hdr = env("IDENTITY_HEADER"), clientId = env("AZURE_CLIENT_ID")
    const q = new URLSearchParams({ resource: AZURE_RESOURCE, "api-version": ep && hdr ? "2019-08-01" : "2018-02-01", ...(clientId ? { client_id: clientId } : {}) })
    const url = ep && hdr ? `${ep}${ep.includes("?") ? "&" : "?"}${q}` : `http://169.254.169.254/metadata/identity/oauth2/token?${q}`
    return cached(`azure:${url}`, async () => {
      const r = await fetcher(url, { headers: ep && hdr ? { "X-IDENTITY-HEADER": hdr } : { Metadata: "true" }, signal: AbortSignal.timeout(5000) })
      if (!r.ok) throw new Error(`No se pudo obtener el token de la identidad administrada de Azure (${r.status}). Revisa que el servidor tenga una identidad con el rol «Cognitive Services OpenAI User».`)
      const j = (await r.json()) as { access_token?: string; expires_on?: string | number; expires_in?: string | number }
      if (!j.access_token) throw new Error("Azure no entregó un token para la identidad administrada.")
      return { value: j.access_token, exp: expiry(j.expires_on, j.expires_in) }
    })
  }
}

// ── Google Cloud ───────────────────────────────────────────────────────────────────────────────────────────────

/** Token de la cuenta de servicio del servidor (metadatos de Cloud Run / GCE). Solo para leer la lista de modelos. */
export function gcpMetadataToken(fetcher: typeof fetch = fetch): Promise<string> {
  const url = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
  return cached(`gcp:${url}`, async () => {
    const r = await fetcher(url, { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(3000) })
    if (!r.ok) throw new Error(`No se pudo obtener el token de la cuenta de servicio de Google Cloud (${r.status}).`)
    const j = (await r.json()) as { access_token?: string; expires_in?: number }
    if (!j.access_token) throw new Error("Google Cloud no entregó un token para la cuenta de servicio.")
    return { value: j.access_token, exp: expiry(undefined, j.expires_in) }
  })
}
