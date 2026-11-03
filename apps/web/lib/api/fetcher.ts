// Fetcher de la API de Mirai (v6 F2-H-1): el mismo para el navegador y el servidor de Next. Agrega a cada petición
//   · Authorization: Bearer <JWT de Supabase> (y, si la API responde 401, renueva la sesión una vez y reintenta)
//   · Idempotency-Key en las escrituras (POST/PUT/PATCH/DELETE): la API repite la misma respuesta si llega dos veces
//   · X-Mirai-Client (web@<build>) y traceparent (W3C) para seguir la petición en Cloud Logging / Cloud Trace
// Reintentos sensatos:
//   · Lecturas (GET): hasta 2 reintentos si no hubo respuesta o la API dio 502/503/504 (espera 300 ms y 900 ms).
//   · Escrituras: 1 reintento solo si no hubo respuesta o dio 503 (Cloud Run sin instancia: no se procesó), con la
//     MISMA Idempotency-Key, así la API nunca la aplica dos veces. Nada de reintentar 4xx, 500 ni 429.
// Puro (recibe fetch y el token): se prueba en fetcher.test.ts.
import type { ApiFetcher, ApiFetcherArgs } from "@ts-rest/core"
import { ApiError } from "./errors"

export type TokenSource = {
  /** Token vigente (o null sin sesión). `force` = renovarlo (después de un 401). */
  get: (force?: boolean) => Promise<string | null>
}

export type FetcherOptions = {
  token: TokenSource
  fetch?: typeof fetch
  /** `web@<build>` (o `web-ssr@<build>` desde el servidor). */
  client?: string
  /** Para las pruebas: esperas sin reloj real. */
  sleep?: (ms: number) => Promise<void>
  /** Para las pruebas: llave fija. */
  newKey?: () => string
}

const READ_RETRY = [300, 900]
const WRITE_RETRY = [400]
const READ_RETRY_STATUS = new Set([502, 503, 504])
const WRITE_RETRY_STATUS = new Set([503])

const hex = (n: number) => {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("")
}
/** traceparent W3C nuevo (versión 00, muestreado). */
export const newTraceparent = () => `00-${hex(16)}-${hex(8)}-01`

const isWrite = (method: string) => !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())
const isAbort = (e: unknown) => (e as { name?: string })?.name === "AbortError"
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Lee el cuerpo como lo hace ts-rest: JSON si es JSON, texto si es texto; vacío = undefined. */
async function readBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined
  const ct = res.headers.get("content-type") ?? ""
  if (ct.includes("json") && !ct.includes("ndjson")) {
    const text = await res.text()
    if (!text) return undefined
    try { return JSON.parse(text) } catch { return text }
  }
  if (ct.startsWith("text/")) return res.text()
  return res.blob()
}

export type RawRequest = { url: string; method: string; headers?: Record<string, string>; body?: BodyInit | null; signal?: AbortSignal | null; fetchOptions?: RequestInit }

/**
 * Hace la petición con encabezados, token y reintentos y devuelve la `Response` cruda (el chat la lee en streaming).
 * Lanza ApiError.network() si nunca hubo respuesta. NO convierte los errores HTTP: eso lo hace quien la llama.
 */
export function createRawFetch(o: FetcherOptions) {
  const f = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const sleep = o.sleep ?? wait
  const newKey = o.newKey ?? (() => crypto.randomUUID())

  return async function raw(req: RawRequest): Promise<Response> {
    const method = req.method.toUpperCase()
    const write = isWrite(method)
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.headers ?? {})) headers[k.toLowerCase()] = v
    if (o.client) headers["x-mirai-client"] = o.client
    headers.traceparent ??= newTraceparent()
    if (write) headers["idempotency-key"] ??= newKey()
    const plan = write ? WRITE_RETRY : READ_RETRY
    const retryStatus = write ? WRITE_RETRY_STATUS : READ_RETRY_STATUS
    let refreshed = false
    let force = false

    for (let attempt = 0; ; attempt++) {
      const token = await o.token.get(force)
      force = false
      if (token) headers.authorization = `Bearer ${token}`
      else delete headers.authorization
      let res: Response
      try {
        res = await f(req.url, { ...req.fetchOptions, method, headers, body: req.body ?? undefined, signal: req.signal ?? req.fetchOptions?.signal })
      } catch (e) {
        if (isAbort(e)) throw e
        if (attempt < plan.length) { await sleep(plan[attempt]); continue }
        throw ApiError.network()
      }
      // Token vencido: renueva una vez y vuelve a intentar (no cuenta como reintento).
      if (res.status === 401 && !refreshed && token) {
        refreshed = true
        force = true
        attempt--
        continue
      }
      if (retryStatus.has(res.status) && attempt < plan.length) {
        await res.body?.cancel().catch(() => {})
        await sleep(plan[attempt])
        continue
      }
      return res
    }
  }
}

/** `api` de ts-rest (`initClient(apiContract, { api })`) sobre el fetch crudo con encabezados y reintentos. */
export function createApiFetcher(o: FetcherOptions): ApiFetcher {
  const raw = createRawFetch(o)
  return async (args: ApiFetcherArgs) => {
    const res = await raw({ url: args.path, method: args.method, headers: args.headers, body: args.body, fetchOptions: args.fetchOptions as RequestInit | undefined })
    return { status: res.status, body: await readBody(res), headers: res.headers }
  }
}
