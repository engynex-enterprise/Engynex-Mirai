import { NextResponse, type NextRequest } from "next/server"
import type { User } from "@supabase/supabase-js"
import { supabaseServer } from "@/utils/supabase/server"

/** Vuelta de Google, enlace mágico, confirmación de correo y recuperación (PKCE). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const next = safeNext(searchParams.get("next"))
  if (code) {
    const supabase = await supabaseServer()
    const { data: ses, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await googlePhoto(supabase, ses.user)
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

/** Si entró con Google y aún no tiene foto ni avatar, toma la foto de su cuenta de Google. */
async function googlePhoto(supabase: Awaited<ReturnType<typeof supabaseServer>>, user: User | null) {
  const g = user?.identities?.find((i) => i.provider === "google")?.identity_data
  const pic = (g?.avatar_url ?? g?.picture ?? user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture) as string | undefined
  if (!user || !g || !pic) return
  await supabase.from("profiles").update({ avatar_url: pic }).eq("id", user.id).or("avatar_url.is.null,avatar_url.eq.")
}
