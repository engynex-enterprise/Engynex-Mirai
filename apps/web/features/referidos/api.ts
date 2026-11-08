// Referidos por la API: GET /v1/me/referrals.
import { siteUrl } from "@/lib/site-url"

/** Tu código, el enlace para compartir y a quiénes has invitado (solo el primer nombre, por privacidad). */
export async function misReferidos() {
  const { browserApi, unwrap } = await import("@/lib/api/client")
  const { ruta, ...r } = unwrap(await browserApi().gami.referrals())
  return { ...r, link: `${siteUrl()}${ruta}` }
}
