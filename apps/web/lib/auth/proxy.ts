// proxy.ts con AUTH_PROVIDER=mirai (v7, V7-B; §3.1.5). Barato y sin secretos: solo mira si EXISTE la cookie de sesión
// de Better Auth para mandar a /login (la API la valida de verdad en cada petición y getAppContext responde 401 → /login).
// Siempre deja la cookie `mirai-auth` para que el navegador sepa qué pantallas usar (interruptor de tiempo de ejecución).
import { type NextRequest, NextResponse } from "next/server"
import { AUTH_FLAG_COOKIE, MIRAI_SESSION_COOKIES, type AuthProvider } from "./provider"

/** Rutas a las que se entra sin sesión (las mismas de Supabase + lo que el auth propio necesita sin sesión). */
export const PUBLIC_PATHS = ["/login", "/registro", "/recuperar", "/auth", "/contador", "/legal", "/invitacion", "/api/cron", "/api/public", "/api/telegram", "/api/pagos", "/manifest.webmanifest", "/sw.js", "/offline.html", "/compartir", "/abrir"]
/** Solo con mirai: el reto de dos factores y la clave nueva no tienen sesión todavía; /api/auth y /v1 responden solos. */
const MIRAI_PUBLIC = ["/verificacion", "/actualizar-clave", "/api/auth", "/v1"]

export const isPublicPath = (path: string, extra: string[] = []) => path === "/" || [...PUBLIC_PATHS, ...extra].some((p) => path === p || path.startsWith(p + "/"))

/** Deja la cookie del interruptor si no está o cambió (no es httpOnly: la lee el navegador; no es secreta). */
export function withAuthFlag(res: NextResponse, request: NextRequest, provider: AuthProvider) {
  if (request.cookies.get(AUTH_FLAG_COOKIE)?.value !== provider)
    res.cookies.set(AUTH_FLAG_COOKIE, provider, { path: "/", sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: 60 * 60 * 24 * 365 })
  return res
}

export function updateMiraiSession(request: NextRequest) {
  const has = MIRAI_SESSION_COOKIES.some((n) => !!request.cookies.get(n)?.value)
  const path = request.nextUrl.pathname
  const isPublic = isPublicPath(path, MIRAI_PUBLIC)
  if (!has && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`
    return withAuthFlag(NextResponse.redirect(url), request, "mirai")
  }
  if (has && (path === "/login" || path === "/registro")) {
    const url = request.nextUrl.clone()
    url.pathname = "/inicio"
    url.search = ""
    return withAuthFlag(NextResponse.redirect(url), request, "mirai")
  }
  return withAuthFlag(NextResponse.next({ request: { headers: request.headers } }), request, "mirai")
}
