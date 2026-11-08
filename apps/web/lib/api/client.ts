// Cliente tipado de la API de Mirai en el navegador: ts-rest sobre `apiContract` (@mirai/contracts/api). La sesión es
// la cookie httpOnly de Better Auth del mismo origen (/v1 en la web): el navegador no maneja tokens.
// Se carga con import() cuando una pantalla lo necesita.
//
//   const api = browserApi()
//   const rows = unwrap(await api.bookTables.list({ params: { bookId, table: "goals" }, query: {} }))
//   const data = unwrapData(await api.fixed.pay({ params: { bookId, id }, body }))   // comandos { ok:true, data }
import { initClient } from "@ts-rest/core"
import { apiContract } from "@mirai/contracts/api"
import { createApiFetcher, createRawFetch, type TokenSource } from "./fetcher"

export { unwrap, unwrapData } from "./unwrap"

const CLIENT = `web@${process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}`

/** Sin token: la cookie de sesión viaja sola en cada petición al mismo origen. */
export const browserToken: TokenSource = { get: async () => null }

const make = (baseUrl: string) => initClient(apiContract, { baseUrl, api: createApiFetcher({ token: browserToken, client: CLIENT }), throwOnUnknownStatus: false })
export type MiraiApi = ReturnType<typeof make>

let cached: { url: string; api: MiraiApi } | null = null

/** Cliente de la API en el mismo origen (la web reenvía /v1 a la API). */
export function browserApi(url = window.location.origin): MiraiApi {
  if (cached?.url !== url) cached = { url, api: make(url) }
  return cached.api
}

/** fetch crudo con Idempotency-Key y reintentos (streaming del chat). */
export function browserRawFetch() {
  return createRawFetch({ token: browserToken, client: CLIENT })
}
