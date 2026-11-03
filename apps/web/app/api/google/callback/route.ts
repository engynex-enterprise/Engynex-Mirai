import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/utils/supabase/server"
import { exchangeCode, saveTokens, siteUrl } from "@/lib/google"
import { safeEqual } from "@/lib/security/secrets"
import { safeNext } from "@/lib/security/safe-next"

export async function GET(req: NextRequest) {
  const store = await cookies()
  let saved: { state?: string; back?: string } = {}
  try { saved = JSON.parse(store.get("g_oauth")?.value ?? "{}") } catch { saved = {} }
  store.delete("g_oauth")
  const back = safeNext(typeof saved.back === "string" ? saved.back : null, "/correo")
  const q = req.nextUrl.searchParams
  if (q.get("error")) return NextResponse.redirect(`${siteUrl()}${back}?google=cancelado`)
  if (!safeEqual(saved.state, q.get("state"))) return NextResponse.redirect(`${siteUrl()}${back}?google=error`)
  const sb = await supabaseServer()
  const { data } = await sb.auth.getClaims()
  if (!data?.claims) return NextResponse.redirect(`${siteUrl()}/login`)
  try {
    const t = await exchangeCode(q.get("code") ?? "")
    const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${t.access_token}` } }).then((x) => x.json()).catch(() => ({}))
    await saveTokens(data.claims.sub, t, info.email)
    return NextResponse.redirect(`${siteUrl()}${back}?google=ok`)
  } catch {
    return NextResponse.redirect(`${siteUrl()}${back}?google=error`)
  }
}
