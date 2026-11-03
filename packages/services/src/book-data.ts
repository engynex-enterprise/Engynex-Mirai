// Cargador del libro con supabase-js para la API (el de la web, apps/web/lib/book-data.ts, hace lo mismo y es el que
// la web le pasa a configureServices). El armado vive en @mirai/domain/book-data.
import { BOOK_PARTS, loadBookDataWith, SINGLE_ROW_PARTS, type BookPart, type LoadedBook, type PartRows } from "@mirai/domain/book-data"
import type { Db } from "./runtime"

/** Una parte del libro (filas vivas). book_settings y emergency_funds devuelven un arreglo de una fila (o vacío). */
export async function loadBookPart(sb: Db, bookId: string, part: BookPart, signal?: AbortSignal): Promise<PartRows> {
  let q = sb.from(part as never).select(BOOK_PARTS[part].select).eq("book_id" as never, bookId as never)
  if (!SINGLE_ROW_PARTS.includes(part)) q = q.is("deleted_at" as never, null)
  if (signal) q = q.abortSignal(signal)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  if (part === "book_settings" && !data?.length) throw new Error("No encontramos los ajustes de este libro")
  return (data ?? []) as PartRows
}

/** Todo el libro en la forma que esperan los cálculos (una consulta por parte, en paralelo). */
export function loadBookData(sb: Db, bookId: string): Promise<LoadedBook> {
  return loadBookDataWith((part) => loadBookPart(sb, bookId, part))
}
