// Respaldos, exportación y borrado de la cuenta por la API (v6 F2-H-5 y v7 V7-H4). Misma firma y misma respuesta
// que las Server Actions de ./actions.ts; con el interruptor apagado son exactamente las de siempre (ni se carga el
// cliente de la API). Con AUTH_PROVIDER=mirai apiOn() siempre es true: todo por la API.
//   · `importer` → /v1/books/:b/{export.json, backups[/:id[/url|/restore]], import/json, data/format}
//   · `account`  → GET /v1/account/export y DELETE /v1/account
import { isApiError } from "@/lib/api/errors"
import { activeBookId, apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import * as actions from "./actions"

const on = () => apiOn("importer")
const onAccount = () => apiOn("account")
const client = () => import("@/lib/api/client")
const params = (backupId: string) => ({ bookId: activeBookId(), backupId })

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

/** Fila de la lista de respaldos (Ajustes › Datos). */
export type BackupRow = { id: string; book_id: string; tipo: string; path: string; size: number; created_at: string; created_by: string | null }

/**
 * Respaldos guardados del libro (los 30 más recientes). Con el interruptor apagado devuelve null: quien llama sigue con
 * su consulta de siempre (features/settings/tabs/data.tsx lee `backups` con Supabase).
 */
export async function listBackupsViaApi(bookId: string): Promise<BackupRow[] | null> {
  if (!on()) return null
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().importer.backups({ params: { bookId } })).slice(0, 30)
}

/** GET …/backups/:id/url → enlace de descarga de 2 minutos (o null). */
export const backupUrl = viaApiOr(on, actions.backupUrl, async (id: string): Promise<string | null> => {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().importer.backupUrl({ params: params(id) })).url
})

/** POST …/backups/:id/restore (antes guarda un respaldo «antes de restaurar»). */
export const restoreBackup = viaApiOr(on, actions.restoreBackup, async (id: string): Promise<void> => {
  const { browserApi, unwrapData } = await client()
  unwrapData(await browserApi().importer.restoreBackup({ params: params(id) }))
})

/** POST /v1/books/:b/import/json (respaldo v5 de este mismo hogar). */
export const restoreFromJson = viaApiOr(on, actions.restoreFromJson, async (json: string): Promise<void> => {
  const { browserApi, unwrapData } = await client()
  unwrapData(await browserApi().importer.restoreJson({ params: { bookId: activeBookId() }, body: { json } }))
})

/** DELETE …/backups/:id. Como la acción: si no existe, no pasa nada. */
export const deleteBackup = viaApiOr(on, actions.deleteBackup, async (id: string): Promise<void> => {
  const { browserApi, unwrapData } = await client()
  try {
    unwrapData(await browserApi().importer.deleteBackup({ params: params(id) }))
  } catch (e) {
    if (isApiError(e) && e.code === "NOT_FOUND") return
    throw e
  }
})

/** POST /v1/books/:b/data/format: a la papelera los bloques escogidos (escribiendo BORRAR; antes, un respaldo). */
export const formatBlocks = viaApiOr(on, actions.formatBlocks, async (blocks: string[], confirm: string): Promise<void> => {
  if (!Array.isArray(blocks) || typeof confirm !== "string" || confirm.trim().toUpperCase() !== "BORRAR") throw new Error("Escribe BORRAR para confirmar")
  const { browserApi, unwrapData } = await client()
  unwrapData(await browserApi().importer.format({ params: { bookId: activeBookId() }, body: { blocks: blocks as never, confirm } }))
})

/** GET /v1/account/export → el mismo texto JSON (sangría de 1) que la acción (Ley 1581). */
export const exportMyData = viaApiOr(onAccount, actions.exportMyData, async (): Promise<string> => {
  const { browserApi, unwrap } = await client()
  return JSON.stringify(unwrap(await browserApi().account.exportMyData()), null, 1)
})

/**
 * DELETE /v1/account. 409 con `details.hogares` si es dueño de un hogar con más personas (mismo mensaje de la API).
 * La cookie mirai-book (httpOnly) queda vieja: no importa, la sesión ya no existe.
 */
export const deleteAccount = viaApiOr(onAccount, actions.deleteAccount, async (input: { confirm: string }): Promise<{ ok: boolean; msg: string; hogares?: string[] }> => {
  try {
    const { browserApi, unwrapData } = await client()
    const d = unwrapData(await browserApi().account.remove({ body: { confirm: input.confirm } }))
    return { ok: true, msg: d.msg }
  } catch (e) {
    const hogares = isApiError(e) ? (e.details as { hogares?: string[] } | undefined)?.hogares : undefined
    return { ok: false, msg: e instanceof Error && e.message ? e.message : "No pudimos eliminar tu cuenta. Intenta de nuevo o escríbenos.", ...(hogares?.length ? { hogares } : {}) }
  }
})
