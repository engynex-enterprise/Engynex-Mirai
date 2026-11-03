import { NextResponse, type NextRequest } from "next/server"
import { SHARE_FILE_FIELD } from "@/lib/pwa/config"
import { parseSharedText, shareRedirectUrl } from "@/lib/pwa/links"

/**
 * Compartir a Mirai (share_target del manifest). Normalmente lo atiende el service worker (public/sw.js), que guarda el
 * archivo para el formulario. Esto es el respaldo cuando el service worker aún no controla la página (primera vez):
 * el texto llega al formulario por la URL; el archivo no se puede pasar, así que el formulario pide tomar la foto.
 */
export async function POST(request: NextRequest) {
  let text = null as ReturnType<typeof parseSharedText>
  let file = false
  try {
    const fd = await request.formData()
    const str = (k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "")
    text = parseSharedText({ title: str("title"), text: str("text"), url: str("url") })
    file = fd.getAll(SHARE_FILE_FIELD).some((f) => typeof f === "object" && f !== null && "size" in f && f.size > 0)
  } catch { /* sin datos: igual abre el formulario */ }
  const to = new URL(shareRedirectUrl({ text }), request.nextUrl.origin)
  if (file) to.searchParams.set("compartido", "sin-archivo")
  return NextResponse.redirect(to, 303)
}

/** Compartir por GET (algunos navegadores) o abrir /compartir a mano. */
export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const text = parseSharedText({ title: q.get("title"), text: q.get("text"), url: q.get("url") })
  return NextResponse.redirect(new URL(shareRedirectUrl({ text }), request.nextUrl.origin), 303)
}
