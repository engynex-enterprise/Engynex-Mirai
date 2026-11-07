import { randomBytes } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/utils/supabase/server"
import { G_SCOPES, redirectUri, siteUrl } from "@/lib/google"
import { getAppContext } from "@/lib/dal"
import { can } from "@/lib/plans"
import { getIntegration } from "@/features/integrations/store"
import { safeNext } from "@/lib/security/safe-next"
import { serverAuthProvider } from "@/lib/auth/provider"

/** Inicia la conexión con Google: ?s=gmail|calendar&back=/correo */
export async function GET(req: NextRequest) {
  // v7: con AUTH_PROVIDER=mirai Google se conecta por la API (connectGoogleViaApi). Un enlace viejo abierto en otra
  // pestaña vuelve a la pantalla de donde vino, donde el botón ya usa la API.
  if (serverAuthProvider() === "mirai") return NextResponse.redirect(`${siteUrl()}${safeNext(req.nextUrl.searchParams.get("back"), "/ajustes?tab=alertas")}`)
  const sb = await supabaseServer()
  const { data } = await sb.auth.getClaims()
  if (!data?.claims) return NextResponse.redirect(`${siteUrl()}/login`)
  const ctx = await getAppContext()
  if (!can(ctx.plan, "banco")) return NextResponse.redirect(`${siteUrl()}/planes?f=banco`)
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return NextResponse.json({ error: "Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET" }, { status: 500 })
  const s = req.nextUrl.searchParams.get("s") === "calendar" ? "calendar" : "gmail"
  const back = safeNext(req.nextUrl.searchParams.get("back"), "/correo")
  // La conexión es de la cuenta de cada persona; el administrador solo decide si el servicio está disponible.
  if (!(await getIntegration(ctx.household.id, s === "calendar" ? "google_calendar" : "google_gmail"))) return NextResponse.redirect(`${siteUrl()}${back}${back.includes("?") ? "&" : "?"}google=no-disponible`)
  const state = randomBytes(16).toString("hex")
  ;(await cookies()).set("g_oauth", JSON.stringify({ state, back }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" })
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  u.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true", scope: `openid email ${G_SCOPES[s]}`, state }).toString()
  return NextResponse.redirect(u)
}
