// Escrituras de la Agenda: fechas del Calendario fiscal y "Recordar como gasto fijo" por el CRUD genérico de la API
// (PUT /v1/books/:b/t/{calendar_events,fixed_expenses}/:id). Los dígitos DIAN van al perfil (PATCH /v1/me/profile).
import { apiUpsert } from "@/lib/api/book-tables"
import { updateProfile } from "@/features/profile/api"

type Rec = Record<string, unknown>
type Table = "calendar_events" | "fixed_expenses"

/** Crea filas nuevas (el id lo pone el navegador, como useSave). Devuelve el error para la persona o null. */
export async function insertBookRows(bookId: string, table: Table, rows: Rec[]): Promise<{ error: { message: string } | null }> {
  try {
    for (const r of rows) await apiUpsert(bookId, table, crypto.randomUUID(), r)
    return { error: null }
  } catch (e) {
    return { error: { message: (e as Error).message } }
  }
}

/** Cambia campos de una fila. Devuelve el error para la persona o null. */
export async function updateBookRow(bookId: string, table: Table, id: string, patch: Rec): Promise<{ error: { message: string } | null }> {
  try {
    await apiUpsert(bookId, table, id, patch)
    return { error: null }
  } catch (e) {
    return { error: { message: (e as Error).message } }
  }
}

/** Dígitos DIAN del perfil (Calendario fiscal › ¿Cuándo declaras renta?). */
export const saveDigitos = (userId: string, digitos: string) => updateProfile(userId, { digitos })
