// Campana por la API (v6 F2-H, interruptor `bell`): GET /v1/notifications, PATCH …/:id/read y POST …/read-all.
// Apagado: las mismas consultas de siempre a Supabase (components/app/notifications-sheet.tsx). Encendido, las lecturas
// vuelven a Supabase si la API no responde (red o 5xx); las escrituras no se repiten por otro camino.
import { createClient } from "@/utils/supabase/client"
import { readWithFallback } from "@/lib/api/book-tables"
import { apiOn } from "@/lib/api/session"

const client = () => import("@/lib/api/client")

/** Los 50 avisos más recientes del libro y los generales (sin libro). */
async function listFromDb(userId: string, bookId: string) {
  const { data, error } = await createClient()
    .from("notifications").select("*").eq("user_id", userId)
    .or(`book_id.eq.${bookId},book_id.is.null`).order("created_at", { ascending: false }).limit(50)
  if (error) throw new Error(error.message)
  return data
}

export function bellList(userId: string, bookId: string) {
  if (!apiOn("bell")) return listFromDb(userId, bookId)
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await client()
    return unwrap(await browserApi().bell.list({ query: { bookId, limit: 50 } }))
  }, () => listFromDb(userId, bookId))
}

/** Marca todos tus avisos sin leer. */
export async function bellReadAll(userId: string) {
  if (!apiOn("bell")) {
    await createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null)
    return
  }
  const { browserApi, unwrapData } = await client()
  unwrapData(await browserApi().bell.readAll())
}

/** Marca un aviso como leído (como antes, un error no interrumpe: solo se vuelve a consultar la campana). */
export function bellReadOne(id: string): PromiseLike<unknown> {
  if (!apiOn("bell")) return createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id)
  return client().then(({ browserApi }) => browserApi().bell.read({ params: { id } })).catch(() => null)
}
