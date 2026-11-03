import "server-only"
// Portal del contador por la API (v6 F2-H-5, interruptor `accountant`): GET /v1/accountant/:token (AccountantTokenGuard:
// token, límite `portalContador`, acceso vigente y plan con «impuestos»). Se usa en el servidor
// (app/contador/[token]/page.tsx): el portal no tiene sesión, así que solo cuenta el modo "on" (qa/admins/pct no
// aplican sin persona). Apagado = contadorOpen de ./actions.ts, sin leer nada más.
//
// Decisiones y pendientes:
// - Notas y archivos del portal (contadorNotes, contadorNote, contadorFileUrl) siguen como Server Actions: el portal no
//   tiene AppContextProvider (apiOn es siempre false en el navegador) y pasar la configuración al cliente cambiaría el
//   componente. Los endpoints existen (accountantPortal.notes/addNote/fileUrl) para cuando se migre el cliente.
// - Los accesos del titular (createShare, rotateShare, revokeShare, ownerNote) no tienen endpoint en el contrato
//   (packages/contracts/src/modules/tax.ts solo trae el portal): siguen como Server Actions.
import { supabaseAdmin } from "@/lib/supabase/admin"
import { globalApiOn } from "@/lib/api/rollout"
import { publicServerApi } from "@/lib/api/server"
import * as actions from "./actions"

/** Abre el portal: misma forma que contadorOpen (`{ share, data }`, `{ bloqueado: "plan" }` o null). */
export async function contadorOpen(token: string): Promise<actions.PortalResult> {
  const cfg = await globalApiOn("accountant", () => supabaseAdmin()).catch(() => null)
  if (!cfg) return actions.contadorOpen(token)
  try {
    const res = await publicServerApi(cfg).accountantPortal.open({ params: { token } })
    if (res.status === 200) return res.body as actions.PortalResult
    // La API no pudo responder: es una lectura, así que se abre con lo de siempre.
    if (res.status >= 500) return actions.contadorOpen(token)
    // 404 (no existe, venció o se revocó), 400 (token mal formado) o 429 (límite): igual que la acción, null.
    return null
  } catch {
    return actions.contadorOpen(token)
  }
}
