// Escrituras de la Declaración de renta del titular por la API:
//   · años, bienes y documentos → CRUD genérico del libro (PUT/DELETE/restore /v1/books/:b/t/{tax_years,tax_assets,attachments})
//   · UVT del libro → PATCH /v1/books/:b/settings · dependientes → PATCH /v1/households/:h/family/:id
//   · archivos → subida firmada por la API (lib/files/upload)
// Cada función lanza Error con el mensaje para la persona.
import { apiSetDeleted, apiUpsert } from "@/lib/api/book-tables"

type Rec = Record<string, unknown>

/** Crea (sin `id`) o edita una fila del libro de la renta. */
export async function saveRentaRow(bookId: string, table: "tax_years" | "tax_assets" | "attachments", row: Rec, id?: string | null): Promise<void> {
  await apiUpsert(bookId, table, id ?? crypto.randomUUID(), row)
}

/** Varias filas nuevas a la vez (Traer bienes de Balance). */
export async function insertRentaRows(bookId: string, table: "tax_assets", rows: Rec[]): Promise<void> {
  for (const r of rows) await apiUpsert(bookId, table, crypto.randomUUID(), r)
}

/** El año de la declaración de un integrante: crea la fila si no existe (único por libro + año + integrante). */
export async function saveTaxYear(bookId: string, row: { year: number; member_id: string; ing: unknown; ded: unknown; docs: unknown; consig: number; consumos: number }, id?: string | null): Promise<void> {
  await apiUpsert(bookId, "tax_years", id ?? crypto.randomUUID(), row)
}

/** A la papelera (`true`) o "Deshacer" (`false`). */
export async function setRentaDeleted(bookId: string, table: "tax_assets" | "attachments", id: string, deleted: boolean): Promise<void> {
  await apiSetDeleted(bookId, table, id, deleted ? new Date().toISOString() : null)
}

/** UVT que el libro sobrescribe (Ajustes › Finanzas también la cambia). */
export async function saveRentaUvt(bookId: string, uvt: Record<string, number>): Promise<void> {
  const { browserApi, unwrap } = await import("@/lib/api/client")
  unwrap(await browserApi().books.updateSettings({ params: { bookId }, body: { uvt } }))
}

/** Datos de dependiente de un integrante del hogar. */
export async function saveRentaMember(householdId: string, id: string, patch: Rec): Promise<void> {
  const { browserApi, unwrapData } = await import("@/lib/api/client")
  unwrapData(await browserApi().households.patchFamily({ params: { householdId, familyId: id }, body: patch as never }))
}
