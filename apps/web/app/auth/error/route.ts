// Errores del login con Google en el auth propio (v7): Better Auth redirige aquí (onAPIError.errorURL) con ?error=<código>.
// Se vuelve a /login con el aviso "No pudimos entrar con Google". Si el regreso llegó repetido (doble clic en Google)
// y el primero sí abrió la sesión, el proxy manda de /login a /inicio: la persona entra sin ver ningún error.
import { NextResponse, type NextRequest } from "next/server"

export function GET(req: NextRequest) {
  const url = req.nextUrl.clone()
  url.pathname = "/login"
  url.search = "?error=google"
  return NextResponse.redirect(url)
}
