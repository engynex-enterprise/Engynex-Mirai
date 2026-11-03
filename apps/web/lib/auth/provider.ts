// Interruptor del proveedor de identidad (v7, V7-B; docs/arquitectura/v7-gcp-total.md §3.1.5):
//   AUTH_PROVIDER=supabase (por defecto: todo exactamente como hoy) | mirai (Better Auth en la API, mismo origen)
// Es de TIEMPO DE EJECUCIÓN (no NEXT_PUBLIC): volver atrás no exige recompilar. El servidor lo lee de process.env y
// proxy.ts se lo pasa al navegador en la cookie `mirai-auth` (no es secreta: solo dice qué pantallas usar).
export type AuthProvider = "supabase" | "mirai"

export const AUTH_FLAG_COOKIE = "mirai-auth"

/** Proveedor del servidor (Server Components, Route Handlers, Server Actions, proxy). */
export function serverAuthProvider(env: Record<string, string | undefined> = process.env): AuthProvider {
  return (env.AUTH_PROVIDER ?? "").trim() === "mirai" ? "mirai" : "supabase"
}

/** Proveedor en cualquier lado: en el navegador lo dice la cookie que pone proxy.ts. */
export function authProvider(): AuthProvider {
  if (typeof window === "undefined") return serverAuthProvider()
  return new RegExp(`(?:^|;\\s*)${AUTH_FLAG_COOKIE}=mirai(?:;|$)`).test(document.cookie) ? "mirai" : "supabase"
}

export const isMiraiAuth = () => authProvider() === "mirai"

/** Cookies de sesión de Better Auth (con https lleva el prefijo __Secure-). */
export const MIRAI_SESSION_COOKIES = ["__Secure-mirai.session_token", "mirai.session_token"]
