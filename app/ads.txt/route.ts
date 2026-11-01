import { adsTxt } from "@/lib/ads"

/** ads.txt de Google AdSense (solo si NEXT_PUBLIC_ADSENSE_CLIENT está configurado). */
export function GET() {
  const body = adsTxt(process.env.NEXT_PUBLIC_ADSENSE_CLIENT)
  return new Response(body || "# Sin anuncios configurados\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } })
}
