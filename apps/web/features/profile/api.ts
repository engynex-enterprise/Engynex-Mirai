// Perfil por la API (V7-H2): GET/PATCH /v1/me/profile con el interruptor `me` y los conteos de la tarjeta (contactos y
// metas) por GET /v1/books/:b/setup-counts con `books`. Apagado: Supabase directo, como siempre (rama heredada).
// Lectura con respaldo (si la API no responde se lee de Supabase); el guardado nunca se repite por otro camino.
import { apiOn } from "@/lib/api/session"
import { readWithFallback } from "@/lib/api/book-tables"
import { createClient } from "@/utils/supabase/client"
import type { Row } from "@/lib/supabase/tables"

const api = () => import("@/lib/api/client")
/** Copia sin las columnas que pone el servidor (la API las rechaza). */
const omit = (o: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))

/** Tu perfil completo. */
export async function fetchProfile(userId: string): Promise<Row<"profiles"> | null> {
  const legacy = async () => (await createClient().from("profiles").select("*").eq("id", userId).single()).data
  if (!apiOn("me")) return legacy()
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await api()
    return unwrap(await browserApi().me.profile()) as unknown as Row<"profiles">
  }, legacy)
}

/** Cambia campos de tu perfil. Devuelve el error con el mensaje para la persona (o null), como supabase-js. */
export async function updateProfile(userId: string, patch: Partial<Row<"profiles">>): Promise<{ error: { message: string } | null }> {
  if (apiOn("me")) {
    try {
      const { browserApi, unwrap } = await api()
      const body = omit(patch, ["id", "email", "created_at", "updated_at", "last_book_id", "deletion_requested_at"])
      unwrap(await browserApi().me.updateProfile({ body: body as never }))
      return { error: null }
    } catch (e) {
      return { error: { message: (e as Error).message } }
    }
  }
  const { error } = await createClient().from("profiles").update(patch).eq("id", userId)
  return { error: error ? { message: error.message } : null }
}

/** Contactos y metas vivos del libro (la tarjeta de tu perfil). */
export async function fetchProfileCounts(bookId: string): Promise<{ contactos: number; metas: number }> {
  const legacy = async () => {
    const sb = createClient()
    const [c, g] = await Promise.all([sb.from("contacts").select("id", { count: "exact", head: true }).eq("book_id", bookId).is("deleted_at", null), sb.from("goals").select("id", { count: "exact", head: true }).eq("book_id", bookId).is("deleted_at", null)])
    return { contactos: c.count ?? 0, metas: g.count ?? 0 }
  }
  if (!apiOn("books")) return legacy()
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await api()
    const r = unwrap(await browserApi().books.setupCounts({ params: { bookId } }))
    return { contactos: r.contactos, metas: r.metas }
  }, legacy)
}
