import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"
import type { Database } from "@/lib/supabase/database.types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

/** Rutas a las que se entra sin sesión. */
const PUBLIC = ["/login", "/registro", "/recuperar", "/auth", "/contador", "/legal", "/invitacion", "/api/cron", "/api/public", "/api/telegram", "/api/pagos", "/manifest.webmanifest", "/sw.js"]

export const updateSession = async (request: NextRequest) => {
  let supabaseResponse = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient<Database>(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
      },
    },
  })

  // No pongas código entre createServerClient y getClaims(): refresca el token de la sesión.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims
  const path = request.nextUrl.pathname
  const isPublic = path === "/" || PUBLIC.some((p) => path === p || path.startsWith(p + "/"))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`
    return NextResponse.redirect(url)
  }
  if (user && (path === "/login" || path === "/registro")) {
    const url = request.nextUrl.clone()
    url.pathname = "/inicio"
    url.search = ""
    return NextResponse.redirect(url)
  }
  return supabaseResponse
}
