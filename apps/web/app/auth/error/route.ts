// Errores del login con Google en el auth propio (v7): Better Auth redirige aquí (onAPIError.errorURL) con ?error=<código>.
// Se vuelve a /login con el aviso "No pudimos entrar con Google". Si el regreso llegó repetido (Chrome a veces repite
// la petición) y el primero sí abrió la sesión, el proxy manda de /login a /inicio: la persona entra sin ver el error.
// Detrás de Docker/Traefik la dirección de la petición es la interna (0.0.0.0:8080): se usa la pública (publicOrigin).
import { NextResponse, type NextRequest } from "next/server"
import { publicOrigin } from "@/lib/site-url"

export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/login?error=google", publicOrigin(req)))
}
