import type { NextRequest } from "next/server"
import { updateMiraiSession } from "@/lib/auth/proxy"

// Sesión del auth propio (cookie de Better Auth): sin sesión → /login; con sesión, /login y /registro → /inicio.
export async function proxy(request: NextRequest) {
  return updateMiraiSession(request)
}

export const config = {
  // Fuera de la sesión: archivos estáticos y lo de la app instalada (service worker, manifest, página offline, íconos
  // en /pwa): deben cargar sin entrar (docs/PWA.md).
  matcher: ["/((?!_next/static|_next/image|_vercel|favicon.ico|icons/|brand/|pwa/|sw\\.js$|offline\\.html$|manifest\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)"],
}
