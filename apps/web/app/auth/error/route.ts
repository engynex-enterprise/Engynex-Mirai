// Errores del login con Google en el auth propio (v7): Better Auth redirige aquí (onAPIError.errorURL) con ?error=<código>.
// Va a /auth/google, que en la ventana flotante avisa a la pestaña de Mirai y se cierra, y en la misma pestaña sigue a
// /inicio o a /login con el aviso. Si ya hay sesión (Chrome a veces repite el regreso de Google y el primero sí la
// abrió), cuenta como entrada exitosa. Detrás de Docker/Traefik se usa la dirección pública (publicOrigin).
import { NextResponse, type NextRequest } from "next/server"
import { MIRAI_SESSION_COOKIES } from "@/lib/auth/provider"
import { publicOrigin } from "@/lib/site-url"

export function GET(req: NextRequest) {
  const conSesion = MIRAI_SESSION_COOKIES.some((n) => !!req.cookies.get(n)?.value)
  return NextResponse.redirect(new URL(conSesion ? "/auth/google?listo=1" : "/auth/google?error=google", publicOrigin(req)))
}
