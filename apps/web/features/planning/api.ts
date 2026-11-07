// Escrituras de Planeación (V7-H2). Presupuesto: PATCH /v1/books/:b/categories/:id/tope (interruptor
// `book-tables:categories`, el mismo de la lista de categorías). Familia: el cupo va con patchMember de
// features/catalogs/hooks.ts (interruptor `households`). Apagado: Supabase directo, como siempre (rama heredada).
import { apiOn } from "@/lib/api/session"
import { createClient } from "@/utils/supabase/client"

/** Tope mensual de una categoría (0 = sin tope). Lanza Error con el mensaje para la persona. */
export async function saveTope(bookId: string, id: string, tope: number): Promise<void> {
  if (apiOn("book-tables", "categories")) {
    const { browserApi, unwrapData } = await import("@/lib/api/client")
    unwrapData(await browserApi().budget.tope({ params: { bookId, id }, body: { tope } }))
    return
  }
  const { error } = await createClient().from("categories").update({ tope }).eq("id", id)
  if (error) throw new Error(error.message)
}
