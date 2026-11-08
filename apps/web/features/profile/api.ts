// Perfil por la API: GET/PATCH /v1/me/profile y los conteos de la tarjeta (contactos y metas) por
// GET /v1/books/:b/setup-counts.
import type { Row } from "@/lib/supabase/tables"

const api = () => import("@/lib/api/client")
/** Copia sin las columnas que pone el servidor (la API las rechaza). */
const omit = (o: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))

/** Tu perfil completo (la API lo sabe por la sesión; `userId` queda por compatibilidad con quien llama). */
export const fetchProfile: (userId: string) => Promise<Row<"profiles"> | null> = async () => {
  const { browserApi, unwrap } = await api()
  return unwrap(await browserApi().me.profile()) as unknown as Row<"profiles">
}

/** Cambia campos de tu perfil (la API sabe quién eres por la sesión). Devuelve el error para la persona (o null). */
export async function updateProfile(_userId: string, patch: Partial<Row<"profiles">>): Promise<{ error: { message: string } | null }> {
  try {
    const { browserApi, unwrap } = await api()
    const body = omit(patch, ["id", "email", "created_at", "updated_at", "last_book_id", "deletion_requested_at"])
    unwrap(await browserApi().me.updateProfile({ body: body as never }))
    return { error: null }
  } catch (e) {
    return { error: { message: (e as Error).message } }
  }
}

/** Contactos y metas vivos del libro (la tarjeta de tu perfil). */
export async function fetchProfileCounts(bookId: string): Promise<{ contactos: number; metas: number }> {
  const { browserApi, unwrap } = await api()
  const r = unwrap(await browserApi().books.setupCounts({ params: { bookId } }))
  return { contactos: r.contactos, metas: r.metas }
}
