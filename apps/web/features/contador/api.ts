import "server-only"
// Portal del contador por la API: GET /v1/accountant/:token (AccountantTokenGuard: token, límite `portalContador`,
// acceso vigente y plan con «impuestos»). Se usa en el servidor (app/contador/[token]/page.tsx): el portal no tiene
// sesión, así que va sin persona.
import { publicServerApi } from "@/lib/api/server"
import type { PortalResult } from "./types"

/** Abre el portal: `{ share, data }`, `{ bloqueado: "plan" }` o null (no existe, venció, se quitó o la API no respondió). */
export async function contadorOpen(token: string): Promise<PortalResult> {
  try {
    const res = await publicServerApi().accountantPortal.open({ params: { token } })
    // 404 (no existe, venció o se revocó), 400 (token mal formado), 429 (límite) o 5xx: el portal muestra "no disponible".
    return res.status === 200 ? (res.body as PortalResult) : null
  } catch {
    return null
  }
}
