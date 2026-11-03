// Cliente tipado de la API de Mirai en el navegador (v6 F2-H-1): ts-rest sobre `apiContract` (@mirai/contracts/api).
// Token: la sesión de Supabase del navegador (supabase-js la renueva sola; después de un 401 se fuerza la renovación).
// Se carga con import() solo cuando un interruptor está encendido: con todo apagado no entra ni se evalúa.
//
//   const api = browserApi()
//   const rows = unwrap(await api.bookTables.list({ params: { bookId, table: "goals" }, query: {} }))
//   const data = unwrapData(await api.fixed.pay({ params: { bookId, id }, body }))   // comandos { ok:true, data }
import { initClient } from "@ts-rest/core"
import { apiContract } from "@mirai/contracts/api"
import { createClient } from "@/utils/supabase/client"
import { createApiFetcher, createRawFetch, type TokenSource } from "./fetcher"
import { apiSession } from "./session"

export { unwrap, unwrapData } from "./unwrap"

const CLIENT = `web@${process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}`

/** Token de la sesión del navegador. */
export const browserToken: TokenSource = {
  get: async (force) => {
    const sb = createClient()
    if (force) {
      const { data } = await sb.auth.refreshSession()
      return data.session?.access_token ?? null
    }
    return (await sb.auth.getSession()).data.session?.access_token ?? null
  },
}

const make = (baseUrl: string) => initClient(apiContract, { baseUrl, api: createApiFetcher({ token: browserToken, client: CLIENT }), throwOnUnknownStatus: false })
export type MiraiApi = ReturnType<typeof make>

let cached: { url: string; api: MiraiApi } | null = null

/** Cliente para el origen de la API que mandó el servidor (AppContext.api.url). */
export function browserApi(url = apiSession()?.cfg.url ?? ""): MiraiApi {
  if (!url) throw new Error("La API de Mirai no está configurada")
  if (cached?.url !== url) cached = { url, api: make(url) }
  return cached.api
}

/** fetch crudo con Bearer, Idempotency-Key y reintentos (streaming del chat). */
export function browserRawFetch() {
  return createRawFetch({ token: browserToken, client: CLIENT })
}
