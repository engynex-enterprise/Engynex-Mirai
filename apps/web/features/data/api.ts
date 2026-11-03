// Respaldos y exportación del libro por la API (v6 F2-H-5, interruptor `importer`). Misma firma y misma respuesta que
// las Server Actions de ./actions.ts; con el interruptor apagado son exactamente las de siempre. Las que aún no tienen
// endpoint (URL del respaldo, restaurar, borrar respaldo, formatear, exportar mis datos, borrar la cuenta) se
// re-exportan tal cual.
import { activeBookId, apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import * as actions from "./actions"

export { backupUrl, deleteAccount, deleteBackup, exportMyData, formatBlocks, restoreBackup, restoreFromJson } from "./actions"

const on = () => apiOn("importer")
const client = () => import("@/lib/api/client")

/** GET /v1/books/:b/export.json → el mismo texto JSON (sangría de 1) que la acción. */
export const exportBookJson = viaApiOr(on, actions.exportBookJson, async () => {
  const { browserApi, unwrap } = await client()
  return JSON.stringify(unwrap(await browserApi().importer.exportJson({ params: { bookId: activeBookId() } })), null, 1)
})

/** POST /v1/books/:b/backups (respaldo manual). La acción no devuelve nada. */
export const createBackup = viaApiOr(on, actions.createBackup, async () => {
  const { browserApi, unwrapData } = await client()
  unwrapData(await browserApi().importer.backup({ params: { bookId: activeBookId() } }))
})
