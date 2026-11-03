import type { NextRequest } from "next/server"
import { updateSession } from "@/utils/supabase/middleware"

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Fuera de la sesión: archivos estáticos y lo de la app instalada (service worker, manifest, página offline, íconos
  // en /pwa): deben cargar sin entrar y sin consultar Supabase (docs/PWA.md).
  matcher: ["/((?!_next/static|_next/image|_vercel|favicon.ico|icons/|brand/|pwa/|sw\\.js$|offline\\.html$|manifest\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)"],
}
