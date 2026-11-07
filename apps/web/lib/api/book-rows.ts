// Escrituras y lecturas sueltas del libro por el CRUD genérico de la API (V7-H): lo que las vistas hacían con
// `createClient().from(tabla)…` fuera de useList / useSave / useSoftDelete (editar un campo, crear y usar el id,
// borrar o deshacer desde un aviso). Mismo interruptor que esos hooks: `book-tables` (o `book-tables:<tabla>`).
// Devuelven la forma `{ data, error }` de supabase-js para que cada vista cambie lo mínimo; `error.message` llega en
// español (el `msg` de la API). Las escrituras nunca se repiten por Supabase (para no duplicarlas).
import { apiList, apiSetDeleted, apiSnapshotPart, apiUpsert, writableViaApi, type ListArgs } from "./book-tables"
import { apiOn } from "./session"

export type RowResult<T> = { data: T | null; error: { message: string } | null }
type Rec = Record<string, unknown>

/** ¿Esta tabla del libro va por la API? (interruptor `book-tables[:tabla]` y tabla del CRUD genérico). */
export const rowsViaApi = (table: string) => apiOn("book-tables", table) && writableViaApi(table)

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

/** ¿El fondo de emergencia se lee por el snapshot de la API? (interruptor `snapshot`, como useBookData). */
export const fundViaApi = () => apiOn("snapshot")

/** Fondo de emergencia del libro (una fila o ninguna), por `GET /snapshot?parts=emergency_funds`. */
export async function apiFund<T = Rec>(bookId: string): Promise<T | null> {
  return ((await apiSnapshotPart(bookId, "emergency_funds"))[0] as T | undefined) ?? null
}
