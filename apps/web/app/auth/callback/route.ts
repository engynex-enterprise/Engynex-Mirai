import { NextResponse, type NextRequest } from "next/server"
import { publicOrigin } from "@/lib/site-url"
import type { User } from "@supabase/supabase-js"
import { supabaseServer } from "@/utils/supabase/server"
import { safeNext } from "@/lib/security/safe-next"
import { serverAuthProvider } from "@/lib/auth/provider"

/** Agrega parámetros a una ruta interna conservando su ?query y su #ancla. */
function withParams(path: string, params: Record<string, string>) {
  const [base, hash = ""] = path.split("#")
  const u = new URL(base, "http://x")
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return `${u.pathname}${u.search}${hash ? `#${hash}` : ""}`
}

/**
 * Vuelta de Google, enlace mágico, confirmación de correo, cambio de correo y recuperación (PKCE).
 * - Conectar otra cuenta de Google que ya es de otra persona en Mirai: Supabase vuelve con error_code
 *   identity_already_exists → /perfil?cuentas=ya_existe.
 * - "Cambio de correo seguro": el primer enlace (de dos) vuelve sin código y con ?message → ?correo=falta_otro.
 */
export async function GET(request: NextRequest) {
  if (serverAuthProvider() === "mirai") return miraiCallback(request)
  const { searchParams } = request.nextUrl
  const origin = publicOrigin(request)
  const code = searchParams.get("code")
  const next = safeNext(searchParams.get("next"))
  const errCode = searchParams.get("error_code") ?? ""
  const errDesc = searchParams.get("error_description") ?? ""
  const supabase = await supabaseServer()

  if (code) {
    const { data: ses, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await googlePhoto(supabase, ses.user)
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      const dest = data && data.nextLevel === "aal2" && data.currentLevel !== "aal2" ? `/verificacion?next=${encodeURIComponent(next)}` : next
      return NextResponse.redirect(`${origin}${dest}`)
    }
  }

  // Con sesión abierta (conectar Google, cambio de correo): volvemos a la página con el motivo.
  const { data: claims } = await supabase.auth.getClaims()
  if (claims?.claims.sub) {
    if (errCode || errDesc) {
      const motivo = /identity_already_exists|already linked|already exists/i.test(`${errCode} ${errDesc}`) ? "ya_existe" : /manual_linking|linking/i.test(`${errCode} ${errDesc}`) ? "sin_vincular" : "error"
      return NextResponse.redirect(`${origin}${withParams(next, { cuentas: motivo })}`)
    }
    if (searchParams.get("message")) return NextResponse.redirect(`${origin}${withParams(next, { correo: "falta_otro" })}`)
    // El código se abrió en otro navegador: el cambio de correo ya quedó hecho en Supabase.
    if (code && /correo=/.test(next)) return NextResponse.redirect(`${origin}${next}`)
  }
  if (searchParams.get("message")) return NextResponse.redirect(`${origin}/login?aviso=correo`)
  return NextResponse.redirect(`${origin}/login?error=enlace`)
}

/** Si entró con Google y aún no tiene foto ni avatar, toma la foto de su cuenta de Google. */
async function googlePhoto(supabase: Awaited<ReturnType<typeof supabaseServer>>, user: User | null) {
  const g = user?.identities?.find((i) => i.provider === "google")?.identity_data
  const pic = (g?.avatar_url ?? g?.picture ?? user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture) as string | undefined
  if (!user || !g || !pic) return
  await supabase.from("profiles").update({ avatar_url: pic }).eq("id", user.id).or("avatar_url.is.null,avatar_url.eq.")
}

/**
 * AUTH_PROVIDER=mirai: Better Auth ya hizo todo en /api/auth/* (Google, enlace, verificación, cambio de correo) y vuelve
 * aquí solo como `callbackURL`. Se respeta `next` y se traducen sus errores a los mismos motivos de siempre.
 */
function miraiCallback(request: NextRequest) {
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
