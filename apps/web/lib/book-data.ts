// El armado del libro vive en @mirai/domain (packages/domain/src/book-data.ts). Aquí queda solo el cargador de
// Supabase (navegador y servidor: cron, IA, reportes) con la misma firma de siempre (modo heredado) y, v7, el mismo
// libro por la API (loadBookDataViaApi / loadBookDataAuto).
import type { DbClient } from "@mirai/db"
import { BOOK_PARTS, loadBookDataWith, SINGLE_ROW_PARTS, type BookPart, type LoadedBook, type PartRows } from "@mirai/domain/book-data"

export * from "@mirai/domain/book-data"

/** Una parte del libro (filas vivas). book_settings y emergency_funds devuelven un arreglo de una fila (o vacío). */
export async function loadBookPart(sb: DbClient, bookId: string, part: BookPart, signal?: AbortSignal): Promise<PartRows> {
  let q = sb.from(part as never).select(BOOK_PARTS[part].select).eq("book_id" as never, bookId as never)
  if (!SINGLE_ROW_PARTS.includes(part)) q = q.is("deleted_at" as never, null)
  if (signal) q = q.abortSignal(signal)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  if (part === "book_settings" && !data?.length) throw new Error("No encontramos los ajustes de este libro")
  return (data ?? []) as PartRows
}

/** Carga todo el libro en la forma que esperan los cálculos de lib/domain (una consulta por parte, en paralelo). Navegador y servidor (cron, IA, reportes). */
export function loadBookData(sb: DbClient, bookId: string): Promise<LoadedBook> {
  return loadBookDataWith((part) => loadBookPart(sb, bookId, part))
}

/**
 * v7 (V7-H4): el libro completo por la API en el navegador (GET /v1/books/:b/snapshot; las 16 partes van en UNA
 * petición porque apiSnapshotPart junta las que se piden en el mismo momento). Misma forma que loadBookData.
 */
export async function loadBookDataViaApi(bookId: string): Promise<LoadedBook> {
  const { apiSnapshotPart } = await import("@/lib/api/book-tables")
  return loadBookDataWith((part) => apiSnapshotPart(bookId, part))
}

/**
 * En el navegador: por la API si el interruptor `snapshot` está encendido (siempre con AUTH_PROVIDER=mirai); si no,
 * Supabase como siempre (`sb` solo se crea en ese caso: modo heredado).
 */
export async function loadBookDataAuto(bookId: string, sb: () => DbClient): Promise<LoadedBook> {
  const { apiOn } = await import("@/lib/api/session")
  return apiOn("snapshot") ? loadBookDataViaApi(bookId) : loadBookData(sb(), bookId)
}
