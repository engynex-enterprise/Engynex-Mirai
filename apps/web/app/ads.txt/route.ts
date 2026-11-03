import { adsTxt } from "@/lib/ads"
import { supabaseAdmin } from "@/lib/supabase/admin"

/** ads.txt de Google AdSense: el id de cliente de la consola (Integraciones globales) o, como respaldo, el de Vercel. */
export async function GET() {
  const { data } = await supabaseAdmin().from("platform_integrations").select("modo,config").eq("kind", "adsense").maybeSingle()
  const client = data && data.modo !== "apagada" ? (data.config as { client?: string } | null)?.client : null
  const body = adsTxt(client || process.env.NEXT_PUBLIC_ADSENSE_CLIENT)
  return new Response(body || "# Sin anuncios configurados\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } })
}
