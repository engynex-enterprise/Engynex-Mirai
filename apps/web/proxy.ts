import type { NextRequest } from "next/server"
import { updateSession } from "@/utils/supabase/middleware"
import { serverAuthProvider } from "@/lib/auth/provider"
import { updateMiraiSession, withAuthFlag } from "@/lib/auth/proxy"

// v7 (V7-B): AUTH_PROVIDER=supabase (por defecto) = la sesión de Supabase de siempre; mirai = cookie de Better Auth.
export async function proxy(request: NextRequest) {
  if (serverAuthProvider() === "mirai") return updateMiraiSession(request)
  const res = await updateSession(request)
  // Si alguna vez estuvo en `mirai`, el navegador vuelve a las pantallas de Supabase sin recompilar.
  return request.cookies.get("mirai-auth") ? withAuthFlag(res, request, "supabase") : res
}

export const config = {
  // Fuera de la sesión: archivos estáticos y lo de la app instalada (service worker, manifest, página offline, íconos
  // en /pwa): deben cargar sin entrar y sin consultar Supabase (docs/PWA.md).
  matcher: ["/((?!_next/static|_next/image|_vercel|favicon.ico|icons/|brand/|pwa/|sw\\.js$|offline\\.html$|manifest\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)"],
}
