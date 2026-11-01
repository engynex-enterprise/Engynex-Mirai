import { randomBytes } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/utils/supabase/server"
import { G_SCOPES, redirectUri, siteUrl } from "@/lib/google"
import { getAppContext } from "@/lib/dal"
import { can } from "@/lib/plans"

/** Inicia la conexión con Google: ?s=gmail|calendar&back=/correo */
export async function GET(req: NextRequest) {
  const sb = await supabaseServer()
  const { data } = await sb.auth.getClaims()
  if (!data?.claims) return NextResponse.redirect(`${siteUrl()}/login`)
  const ctx = await getAppContext()
  if (!can(ctx.plan, "banco")) return NextResponse.redirect(`${siteUrl()}/planes?f=banco`)
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return NextResponse.json({ error: "Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET" }, { status: 500 })
  const s = req.nextUrl.searchParams.get("s") === "calendar" ? "calendar" : "gmail"
  const back = (req.nextUrl.searchParams.get("back") || "/correo").replace(/^(?!\/)/, "/").replace(/^\/\//, "/")
  const state = randomBytes(16).toString("hex")
  ;(await cookies()).set("g_oauth", JSON.stringify({ state, back }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" })
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  u.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true", scope: `openid email ${G_SCOPES[s]}`, state }).toString()
  return NextResponse.redirect(u)
}
