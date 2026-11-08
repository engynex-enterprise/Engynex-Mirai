import { NextResponse, type NextRequest } from "next/server"
import { publicOrigin } from "@/lib/site-url"
import { safeNext } from "@/lib/security/safe-next"

/** Agrega parámetros a una ruta interna conservando su ?query y su #ancla. */
function withParams(path: string, params: Record<string, string>) {
  const [base, hash = ""] = path.split("#")
  const u = new URL(base, "http://x")
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return `${u.pathname}${u.search}${hash ? `#${hash}` : ""}`
}

/**
 * Better Auth ya hizo todo en /api/auth/* (Google, enlace mágico, verificación, cambio de correo) y vuelve aquí solo como
 * `callbackURL`. Se respeta `next` y se traducen sus errores a los motivos que muestran las pantallas
 * (`?cuentas=ya_existe`, `?correo=cancelado`, `/login?error=enlace`).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const origin = publicOrigin(request)
  const next = safeNext(searchParams.get("next"))
  const err = searchParams.get("error") ?? ""
  if (!err) return NextResponse.redirect(`${origin}${next}`)
  if (/correo=/.test(next) || /#cuentas/.test(next)) {
    const motivo = /MIRAI_ENLACE_CANCELADO/.test(err) ? "cancelado" : /LINKED|already|exists/i.test(err) ? "ya_existe" : "error"
    return NextResponse.redirect(`${origin}${withParams(next, motivo === "error" || motivo === "cancelado" ? { correo: motivo } : { cuentas: motivo })}`)
  }
  return NextResponse.redirect(`${origin}/login?error=enlace`)
}
