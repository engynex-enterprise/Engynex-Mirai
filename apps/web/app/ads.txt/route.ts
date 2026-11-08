import { adsTxt } from "@/lib/ads"
import { publicServerApi } from "@/lib/api/server"

/** Cliente de AdSense de la consola (Integraciones globales): GET /v1/platform/adsense. */
async function consoleClient(): Promise<string | null | undefined> {
  const res = await publicServerApi().me.platformAdsense()
  return res.status === 200 ? res.body.client : null
}

/** ads.txt de Google AdSense: el id de cliente de la consola o, como respaldo, el de las variables de entorno. */
export async function GET() {
  const client = await consoleClient().catch(() => null)
  const body = adsTxt(client || process.env.NEXT_PUBLIC_ADSENSE_CLIENT)
  return new Response(body || "# Sin anuncios configurados\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } })
}
