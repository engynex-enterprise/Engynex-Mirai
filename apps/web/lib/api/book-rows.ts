// Escrituras y lecturas sueltas del libro por el CRUD genérico de la API: lo que las vistas hacen fuera de useList /
// useSave / useSoftDelete (editar un campo, crear y usar el id, borrar o deshacer desde un aviso). Devuelven
// `{ data, error }`; `error.message` llega en español (el `msg` de la API).
import { apiList, apiSetDeleted, apiSnapshotPart, apiUpsert, type ListArgs } from "./book-tables"

export type RowResult<T> = { data: T | null; error: { message: string } | null }
type Rec = Record<string, unknown>

const FALLBACK = "No se pudo completar la operación."

export async function asResult<T>(fn: () => Promise<T>): Promise<RowResult<T>> {
  try {
    return { data: await fn(), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error && e.message ? e.message : FALLBACK } }
  }
}

/** Crea una fila (el id lo pone el navegador, como useSave) y la devuelve completa. */
export const apiInsertRow = <T = Rec>(bookId: string, table: string, values: Rec, id: string = crypto.randomUUID()) =>
  asResult(async () => (await apiUpsert(bookId, table, id, values)) as T)

/** Cambia solo los campos que llegan (PUT con un subconjunto = editar). */
export const apiUpdateRow = <T = Rec>(bookId: string, table: string, id: string, values: Rec) =>
  asResult(async () => (await apiUpsert(bookId, table, id, values)) as T)

/** A la papelera (borrado lógico). */
export const apiDeleteRow = (bookId: string, table: string, id: string) =>
  asResult(() => apiSetDeleted(bookId, table, id, new Date().toISOString()))

/** "Deshacer": saca la fila de la papelera. */
export const apiRestoreRow = (bookId: string, table: string, id: string) => asResult(() => apiSetDeleted(bookId, table, id, null))

/** Filas vivas con filtros `eq` (sin relaciones embebidas). */
export const apiRows = <T = Rec>(bookId: string, table: string, o: ListArgs = {}) => apiList(bookId, table, o) as Promise<T[]>

/** Fondo de emergencia del libro (una fila o ninguna), por `GET /snapshot?parts=emergency_funds`. */
export async function apiFund<T = Rec>(bookId: string): Promise<T | null> {
  return ((await apiSnapshotPart(bookId, "emergency_funds"))[0] as T | undefined) ?? null
}
