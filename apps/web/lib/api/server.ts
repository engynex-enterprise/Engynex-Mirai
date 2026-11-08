import "server-only"
// Cliente de la API desde el servidor de Next (RSC, layouts, Route Handlers y Server Actions). La cookie de sesión de
// Better Auth se reenvía como `Authorization: Bearer <token de sesión>` (plugin bearer); la API la valida.
import { initClient } from "@ts-rest/core"
import { apiContract } from "@mirai/contracts/api"
import { createApiFetcher, createRawFetch, type TokenSource } from "./fetcher"
import { apiConfig, type ApiConfig } from "./config"
import { activeTraceparent } from "@/lib/telemetry/traceparent"

export { unwrap, unwrapData } from "./unwrap"

const CLIENT = `web-ssr@${process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}`

/** Token de la cookie de sesión de la petición actual (o null). */
export const cookieToken: TokenSource = {
  get: async () => (await import("@/lib/auth/server")).miraiSessionToken(),
}

const make = (baseUrl: string, token: TokenSource) => initClient(apiContract, { baseUrl, api: createApiFetcher({ token, client: CLIENT, traceparent: () => activeTraceparent() }), throwOnUnknownStatus: false })
export type MiraiServerApi = ReturnType<typeof make>

/** Cliente con la sesión de la petición actual. */
export function serverApi(cfg: ApiConfig = apiConfig()): MiraiServerApi {
  return make(cfg.url, cookieToken)
}

/** Cliente sin persona (webhooks, portal del contador, precios). */
export function publicServerApi(cfg: ApiConfig = apiConfig()): MiraiServerApi {
  return make(cfg.url, { get: async () => null })
}

/** fetch crudo sin persona (proxy de los webhooks de pagos con el cuerpo tal cual). */
export function publicRawFetch() {
  return createRawFetch({ token: { get: async () => null }, client: CLIENT, traceparent: () => activeTraceparent() })
}
