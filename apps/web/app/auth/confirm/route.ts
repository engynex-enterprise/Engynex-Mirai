import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { supabaseServer } from "@/utils/supabase/server"
import { safeNext } from "@/lib/security/safe-next"

/**
 * Enlaces de correo con token_hash (plantillas de Supabase Auth). Para `email_change` con "cambio de correo seguro"
 * hay dos enlaces (correo viejo y nuevo): el primero deja el cambio a medias (?correo=falta_otro) y el segundo lo
 * termina (?correo=listo). profiles.email se actualiza solo (trigger on_auth_user_change).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const raw = searchParams.get("next")
  const next = safeNext(raw, type === "recovery" ? "/actualizar-clave" : type === "email_change" ? "/perfil#cuentas" : "/inicio")
  if (token_hash && type) {
    const supabase = await supabaseServer()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error && type === "email_change") {
      const { data } = await supabase.auth.getUser()
      const [path, hash = "cuentas"] = next.split("#")
      const sep = path.includes("?") ? "&" : "?"
      const estado = data.user?.new_email ? "falta_otro" : "listo"
      return NextResponse.redirect(`${origin}${data.user ? `${path}${sep}correo=${estado}#${hash}` : `/login?aviso=correo`}`)
    }
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }
  return NextResponse.redirect(`${origin}/login?error=enlace`)
}
