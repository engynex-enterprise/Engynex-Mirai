import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { supabaseServer } from "@/utils/supabase/server"

/** Enlaces de correo con token_hash (plantillas de Supabase Auth). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const raw = searchParams.get("next")
  const next = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : type === "recovery" ? "/actualizar-clave" : "/inicio"
  if (token_hash && type) {
    const supabase = await supabaseServer()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }
  return NextResponse.redirect(`${origin}/login?error=enlace`)
}
