import { NextResponse, type NextRequest } from "next/server"
import { publicOrigin } from "@/lib/site-url"

/**
 * Enlaces de correo con token_hash de la versión con Supabase. Los enlaces del auth propio van a /api/auth/* (y vuelven
 * a /auth/callback), así que uno viejo ya no sirve: se pide entrar de nuevo.
 */
export async function GET(request: NextRequest) {
  return NextResponse.redirect(`${publicOrigin(request)}/login?error=enlace`)
}
