// proxy.ts (v7): barato y sin secretos. Solo mira si EXISTE la cookie de sesión de Better Auth para mandar a /login
// (la API la valida de verdad en cada petición y getAppContext responde 401 → /login).
import { type NextRequest, NextResponse } from "next/server"
import { MIRAI_SESSION_COOKIES } from "./provider"

/**
 * Rutas a las que se entra sin sesión. El reto de dos factores y la clave nueva no tienen sesión todavía; /api/auth y
 * /v1 responden solos (la API valida la cookie).
 */
export const PUBLIC_PATHS = [
  "/login", "/registro", "/recuperar", "/verificacion", "/actualizar-clave", "/auth", "/contador", "/legal", "/invitacion",
  "/api/auth", "/api/public", "/api/telegram", "/api/pagos", "/v1", "/manifest.webmanifest", "/sw.js", "/offline.html", "/compartir", "/abrir",
]

export const isPublicPath = (path: string) => path === "/" || PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"))

/** Cookies que deja Better Auth (sesión y caché de la sesión), con y sin el prefijo de https. */
const SESSION_COOKIES = [...MIRAI_SESSION_COOKIES, "__Secure-mirai.session_data", "mirai.session_data"]

export function updateMiraiSession(request: NextRequest) {
  const path = request.nextUrl.pathname
  // getAppContext manda aquí cuando la API dice 401 con la cookie puesta (venció o la cerraron en otro dispositivo).
  // Se borra la cookie y se muestra /login; sin esto, /login → /inicio → /login sería un bucle.
  if (path === "/login" && request.nextUrl.searchParams.get("sesion") === "vencida") {
    const res = NextResponse.next({ request: { headers: request.headers } })
    for (const n of SESSION_COOKIES) if (request.cookies.get(n)) res.cookies.set(n, "", { path: "/", maxAge: 0, secure: n.startsWith("__Secure-") })
    return res
  }
  const has = MIRAI_SESSION_COOKIES.some((n) => !!request.cookies.get(n)?.value)
  if (!has && !isPublicPath(path)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`
    return NextResponse.redirect(url)
  }
  if (has && (path === "/login" || path === "/registro")) {
    const url = request.nextUrl.clone()
    url.pathname = "/inicio"
    url.search = ""
    return NextResponse.redirect(url)
  }
  return NextResponse.next({ request: { headers: request.headers } })
}
