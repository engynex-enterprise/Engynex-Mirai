// Cliente de Better Auth en el navegador (v7, V7-B). Habla con /api/auth/* en el MISMO origen (el balanceador lo manda a
// la API; en local lo reenvía app/api/auth/[...all]/route.ts). La sesión es una cookie httpOnly: el navegador nunca
// maneja tokens. Se carga con import() solo con AUTH_PROVIDER=mirai.
import { createAuthClient } from "better-auth/client"
import { magicLinkClient, twoFactorClient } from "better-auth/client/plugins"

const make = () =>
  createAuthClient({
    baseURL: typeof window === "undefined" ? "http://localhost" : window.location.origin,
    basePath: "/api/auth",
    plugins: [magicLinkClient(), twoFactorClient()],
    fetchOptions: { credentials: "same-origin" },
  })

let client: ReturnType<typeof make> | null = null

export function authClient() {
  client ??= make()
  return client
}
export type MiraiAuthClient = ReturnType<typeof make>
