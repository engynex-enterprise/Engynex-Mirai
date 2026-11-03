// Referidos por la API (v6 F2-H-5, interruptor `gami`): GET /v1/me/referrals. Misma firma y misma forma que la Server
// Action misReferidos (./actions.ts); con el interruptor apagado es exactamente la acción de siempre.
import { siteUrl } from "@/lib/site-url"
import { apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import * as actions from "./actions"

export const misReferidos = viaApiOr(() => apiOn("gami"), actions.misReferidos, async () => {
  const { browserApi, unwrap } = await import("@/lib/api/client")
  const { ruta, ...r } = unwrap(await browserApi().gami.referrals())
  return { ...r, link: `${siteUrl()}${ruta}` }
})
