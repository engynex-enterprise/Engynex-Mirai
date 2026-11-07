// Escrituras de la Agenda (V7-H2): fechas del Calendario fiscal y "Recordar como gasto fijo" por el CRUD genérico de la
// API (PUT /v1/books/:b/t/{calendar_events,fixed_expenses}/:id) con el mismo interruptor de useList / useSave
// (`book-tables:<tabla>`). Los dígitos DIAN van al perfil (PATCH /v1/me/profile, interruptor `me`). Apagado: Supabase
// directo, como siempre (rama heredada). Las escrituras nunca se repiten por el otro camino.
import { apiOn } from "@/lib/api/session"
import { apiUpsert, writableViaApi } from "@/lib/api/book-tables"
import { createClient } from "@/utils/supabase/client"
import { updateProfile } from "@/features/profile/api"

type Rec = Record<string, unknown>
type Table = "calendar_events" | "fixed_expenses"
const viaApi = (t: Table) => apiOn("book-tables", t) && writableViaApi(t)

/** Crea filas nuevas (el id lo pone el navegador, como useSave). Devuelve el error para la persona o null. */
export async function insertBookRows(bookId: string, table: Table, rows: Rec[]): Promise<{ error: { message: string } | null }> {
  if (!rows.length) return { error: null }
  if (viaApi(table)) {
    try {
      for (const r of rows) await apiUpsert(bookId, table, crypto.randomUUID(), r)
      return { error: null }
    } catch (e) {
      return { error: { message: (e as Error).message } }
    }
  }
  const { error } = await createClient().from(table).insert(rows.map((r) => ({ ...r, book_id: bookId })) as never)
  return { error: error ? { message: error.message } : null }
}

/** Cambia campos de una fila. Devuelve el error para la persona o null. */
export async function updateBookRow(bookId: string, table: Table, id: string, patch: Rec): Promise<{ error: { message: string } | null }> {
  if (viaApi(table)) {
    try {
      await apiUpsert(bookId, table, id, patch)
      return { error: null }
    } catch (e) {
      return { error: { message: (e as Error).message } }
    }
  }
  const { error } = await createClient().from(table).update(patch as never).eq("id", id)
  return { error: error ? { message: error.message } : null }
}

/** Dígitos DIAN del perfil (Calendario fiscal › ¿Cuándo declaras renta?). */
export const saveDigitos = (userId: string, digitos: string) => updateProfile(userId, { digitos })
