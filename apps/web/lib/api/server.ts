import "server-only"
// Cliente de la API desde el servidor de Next (RSC, layouts y Route Handlers), v6 F2-H-1. El token sale de la cookie
// de sesión de Supabase (después de getClaims, que la valida); la API lo vuelve a validar con el JWKS.
import { initClient } from "@ts-rest/core"
import type { SupabaseClient } from "@supabase/supabase-js"
import { apiContract } from "@mirai/contracts/api"
import { supabaseServer } from "@/utils/supabase/server"
import { createApiFetcher, createRawFetch, type TokenSource } from "./fetcher"
import type { ApiConfig } from "./modules"

export { unwrap, unwrapData } from "./unwrap"

const CLIENT = `web-ssr@${process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}`

/** Token de la cookie de la petición (en un RSC no se pueden escribir cookies: el proxy ya renovó la sesión). */
export function cookieToken(sb?: SupabaseClient): TokenSource {
  return {
    get: async () => {
      const client = sb ?? (await supabaseServer())
      return (await client.auth.getSession()).data.session?.access_token ?? null
    },
  }
}

const make = (baseUrl: string, token: TokenSource) => initClient(apiContract, { baseUrl, api: createApiFetcher({ token, client: CLIENT }), throwOnUnknownStatus: false })
export type MiraiServerApi = ReturnType<typeof make>

/** Cliente con la sesión de la petición actual. */
export function serverApi(cfg: ApiConfig, sb?: SupabaseClient): MiraiServerApi {
  return make(cfg.url, cookieToken(sb))
}

/** Cliente sin persona (webhooks, portal del contador, cron). */
export function publicServerApi(cfg: ApiConfig): MiraiServerApi {
  return make(cfg.url, { get: async () => null })
}

/** fetch crudo sin persona (proxy de los webhooks de pagos con el cuerpo tal cual). */
export function publicRawFetch() {
  return createRawFetch({ token: { get: async () => null }, client: CLIENT })
}
