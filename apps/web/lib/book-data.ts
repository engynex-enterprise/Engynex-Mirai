// El armado del libro vive en @mirai/domain (packages/domain/src/book-data.ts). Aquí queda solo el cargador de
// Supabase (navegador y servidor: cron, IA, reportes) con la misma firma de siempre.
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
