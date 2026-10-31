import { NextResponse, type NextRequest } from "next/server"
import { supabaseServer } from "@/utils/supabase/server"

/** Vuelta de Google, enlace mágico, confirmación de correo y recuperación (PKCE). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const next = safeNext(searchParams.get("next"))
  if (code) {
    const supabase = await supabaseServer()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      const dest = data && data.nextLevel === "aal2" && data.currentLevel !== "aal2" ? `/verificacion?next=${encodeURIComponent(next)}` : next
      return NextResponse.redirect(`${origin}${dest}`)
    }
  }
  return NextResponse.redirect(`${origin}/login?error=enlace`)
}

function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/inicio"
}
