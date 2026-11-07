import { adsTxt } from "@/lib/ads"
import { serverAuthProvider } from "@/lib/auth/provider"
import { miraiApiConfig } from "@/lib/dal"
import { publicServerApi } from "@/lib/api/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

/** Cliente de AdSense de la consola (Integraciones globales). v7 (AUTH_PROVIDER=mirai): GET /v1/platform/adsense. */
async function consoleClient(): Promise<string | null | undefined> {
  if (serverAuthProvider() === "mirai") {
    const cfg = miraiApiConfig()
    const res = await publicServerApi(cfg).me.platformAdsense()
    return res.status === 200 ? res.body.client : null
  }
  const { data } = await supabaseAdmin().from("platform_integrations").select("modo,config").eq("kind", "adsense").maybeSingle()
  return data && data.modo !== "apagada" ? (data.config as { client?: string } | null)?.client : null
}

/** ads.txt de Google AdSense: el id de cliente de la consola o, como respaldo, el de las variables de entorno. */
export async function GET() {
  const client = await consoleClient().catch(() => null)
  const body = adsTxt(client || process.env.NEXT_PUBLIC_ADSENSE_CLIENT)
  return new Response(body || "# Sin anuncios configurados\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } })
}
