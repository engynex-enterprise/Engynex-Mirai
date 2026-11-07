// Escrituras de la Declaración de renta del titular (V7-H2), con el interruptor `tax`:
//   · años, bienes y documentos → CRUD genérico del libro (PUT/DELETE/restore /v1/books/:b/t/{tax_years,tax_assets,attachments})
//   · UVT del libro → PATCH /v1/books/:b/settings · dependientes → PATCH /v1/households/:h/family/:id
//   · archivos → interruptor `files` (subida firmada por la API), como antes
// Apagado: Supabase directo desde el navegador, como siempre (rama heredada). Las escrituras nunca se repiten por el
// otro camino. Cada función lanza Error con el mensaje para la persona.
import { apiOn } from "@/lib/api/session"
import { apiSetDeleted, apiUpsert } from "@/lib/api/book-tables"
import { createClient } from "@/utils/supabase/client"

export const rentaViaApi = () => apiOn("tax")

type Rec = Record<string, unknown>
const chk = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message) }

/** Crea (sin `id`) o edita una fila del libro de la renta. */
export async function saveRentaRow(bookId: string, table: "tax_years" | "tax_assets" | "attachments", row: Rec, id?: string | null): Promise<void> {
  if (rentaViaApi()) { await apiUpsert(bookId, table, id ?? crypto.randomUUID(), row); return }
  const sb = createClient()
  chk(id ? await sb.from(table).update(row as never).eq("id", id) : await sb.from(table).insert({ ...row, book_id: bookId } as never))
}

/** Varias filas nuevas a la vez (Traer bienes de Balance). */
export async function insertRentaRows(bookId: string, table: "tax_assets", rows: Rec[]): Promise<void> {
  if (!rows.length) return
  if (rentaViaApi()) { for (const r of rows) await apiUpsert(bookId, table, crypto.randomUUID(), r); return }
  chk(await createClient().from(table).insert(rows.map((r) => ({ ...r, book_id: bookId })) as never))
}

/** El año de la declaración de un integrante: crea la fila si no existe (único por libro + año + integrante). */
export async function saveTaxYear(bookId: string, row: { year: number; member_id: string; ing: unknown; ded: unknown; docs: unknown; consig: number; consumos: number }, id?: string | null): Promise<void> {
  if (rentaViaApi()) { await apiUpsert(bookId, "tax_years", id ?? crypto.randomUUID(), row); return }
  chk(await createClient().from("tax_years").upsert({ book_id: bookId, ...row } as never, { onConflict: "book_id,year,member_id" }))
}

/** A la papelera (`true`) o "Deshacer" (`false`). */
export async function setRentaDeleted(bookId: string, table: "tax_assets" | "attachments", id: string, deleted: boolean): Promise<void> {
  if (rentaViaApi()) { await apiSetDeleted(bookId, table, id, deleted ? new Date().toISOString() : null); return }
  chk(await createClient().from(table).update({ deleted_at: deleted ? new Date().toISOString() : null }).eq("id", id))
}

/** UVT que el libro sobrescribe (Ajustes › Finanzas también la cambia). */
export async function saveRentaUvt(bookId: string, uvt: Record<string, number>): Promise<void> {
  if (rentaViaApi()) {
    const { browserApi, unwrap } = await import("@/lib/api/client")
    unwrap(await browserApi().books.updateSettings({ params: { bookId }, body: { uvt } }))
    return
  }
  chk(await createClient().from("book_settings").update({ uvt }).eq("book_id", bookId))
}

/** Datos de dependiente de un integrante del hogar. */
export async function saveRentaMember(householdId: string, id: string, patch: Rec): Promise<void> {
  if (rentaViaApi()) {
    const { browserApi, unwrapData } = await import("@/lib/api/client")
    unwrapData(await browserApi().households.patchFamily({ params: { householdId, familyId: id }, body: patch as never }))
    return
  }
  chk(await createClient().from("family_members").update(patch as never).eq("id", id))
}

/** Sube un documento a Storage (rama heredada; con `files` encendido sube lib/files/upload). */
export async function uploadRentaLegacy(path: string, f: File): Promise<void> {
  chk(await createClient().storage.from("attachments").upload(path, f, { contentType: f.type }))
}

/** URL firmada de 5 minutos (rama heredada; con `files` encendido la da la API). */
export async function signedUrlLegacy(path: string): Promise<string | null> {
  return (await createClient().storage.from("attachments").createSignedUrl(path, 300)).data?.signedUrl ?? null
}
