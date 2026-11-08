// Respaldos, exportación y borrado de la cuenta por la API:
//   · /v1/books/:b/{export.json, backups[/:id[/url|/restore]], import/json, data/format}
//   · GET /v1/account/export y DELETE /v1/account
// La lista de respaldos la lee features/settings/api.ts (fetchBackups).
import { isApiError } from "@/lib/api/errors"
import { activeBookId } from "@/lib/api/session"

const client = () => import("@/lib/api/client")
const params = (backupId: string) => ({ bookId: activeBookId(), backupId })

/** Respaldo del libro activo en JSON (sangría de 1). */
export async function exportBookJson(): Promise<string> {
  const { browserApi, unwrap } = await client()
  return JSON.stringify(unwrap(await browserApi().importer.exportJson({ params: { bookId: activeBookId() } })), null, 1)
}

/** Respaldo manual. */
export async function createBackup(): Promise<void> {
  const { browserApi, unwrapData } = await client()
  unwrapData(await browserApi().importer.backup({ params: { bookId: activeBookId() } }))
}

/** Enlace de descarga de 2 minutos (o null). */
export async function backupUrl(id: string): Promise<string | null> {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().importer.backupUrl({ params: params(id) })).url
}

/** Restaura un respaldo (antes guarda un respaldo «antes de restaurar»). */
export async function restoreBackup(id: string): Promise<void> {
  const { browserApi, unwrapData } = await client()
  unwrapData(await browserApi().importer.restoreBackup({ params: params(id) }))
}

/** Restaura un respaldo v5 de este mismo hogar desde su JSON. */
export async function restoreFromJson(json: string): Promise<void> {
  const { browserApi, unwrapData } = await client()
  unwrapData(await browserApi().importer.restoreJson({ params: { bookId: activeBookId() }, body: { json } }))
}

/** Borra un respaldo. Si no existe, no pasa nada. */
export async function deleteBackup(id: string): Promise<void> {
  const { browserApi, unwrapData } = await client()
  try {
    unwrapData(await browserApi().importer.deleteBackup({ params: params(id) }))
  } catch (e) {
    if (isApiError(e) && e.code === "NOT_FOUND") return
    throw e
  }
}

/** "Formatear" por bloques: a la papelera lo escogido (escribiendo BORRAR; antes, un respaldo). */
export async function formatBlocks(blocks: string[], confirm: string): Promise<void> {
  if (!Array.isArray(blocks) || typeof confirm !== "string" || confirm.trim().toUpperCase() !== "BORRAR") throw new Error("Escribe BORRAR para confirmar")
  const { browserApi, unwrapData } = await client()
  unwrapData(await browserApi().importer.format({ params: { bookId: activeBookId() }, body: { blocks: blocks as never, confirm } }))
}

/** Todos tus datos personales en JSON (sangría de 1), Ley 1581. */
export async function exportMyData(): Promise<string> {
  const { browserApi, unwrap } = await client()
  return JSON.stringify(unwrap(await browserApi().account.exportMyData()), null, 1)
}

/**
 * Elimina la cuenta (Ley 1581). 409 con `details.hogares` si es dueño de un hogar con más personas (mismo mensaje de
 * la API). La cookie mirai-book (httpOnly) queda vieja: no importa, la sesión ya no existe.
 */
export async function deleteAccount(input: { confirm: string }): Promise<{ ok: boolean; msg: string; hogares?: string[] }> {
  try {
    const { browserApi, unwrapData } = await client()
    const d = unwrapData(await browserApi().account.remove({ body: { confirm: input.confirm } }))
    return { ok: true, msg: d.msg }
  } catch (e) {
    const hogares = isApiError(e) ? (e.details as { hogares?: string[] } | undefined)?.hogares : undefined
    return { ok: false, msg: e instanceof Error && e.message ? e.message : "No pudimos eliminar tu cuenta. Intenta de nuevo o escríbenos.", ...(hogares?.length ? { hogares } : {}) }
  }
}
