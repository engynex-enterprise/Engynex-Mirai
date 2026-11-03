"use client"

import { SHARE_CACHE, SHARE_FILE_KEY, SHARE_META_KEY } from "@/lib/pwa/config"
import { parseSharedText, type SharedText } from "@/lib/pwa/links"

/**
 * Lo que alguien compartió a Mirai desde otra app (el service worker lo dejó en la caché): la foto o PDF de la factura
 * y el texto. Se lee una sola vez y se borra. Si tiene más de 10 minutos, se descarta.
 */
export async function takeShared(): Promise<{ file: File | null; text: SharedText | null }> {
  if (typeof caches === "undefined") return { file: null, text: null }
  try {
    const c = await caches.open(SHARE_CACHE)
    const [fr, mr] = await Promise.all([c.match(SHARE_FILE_KEY), c.match(SHARE_META_KEY)])
    const meta = mr ? ((await mr.json().catch(() => null)) as { title?: string; text?: string; url?: string; at?: number } | null) : null
    let file: File | null = null
    if (fr) {
      const b = await fr.blob()
      const name = decodeURIComponent(fr.headers.get("X-Mirai-Name") || "factura")
      file = new File([b], name, { type: b.type || fr.headers.get("Content-Type") || "application/octet-stream" })
    }
    await caches.delete(SHARE_CACHE)
    if (meta?.at && Date.now() - meta.at > 10 * 60_000) return { file: null, text: null }
    return { file, text: meta ? parseSharedText(meta) : null }
  } catch {
    return { file: null, text: null }
  }
}
