"use client"

import { useQueries, type QueryClient, type UseQueryResult } from "@tanstack/react-query"
import { createClient } from "@/utils/supabase/client"
import { useBookId } from "@/components/app/app-context"
import { qk } from "@/lib/supabase/tables"
import { assembleBook, BOOK_PART_NAMES, loadBookPart, type BookPart, type BookParts, type LoadedBook, type PartRows } from "@/lib/book-data"
import { apiSnapshotPart, readWithFallback } from "@/lib/api/book-tables"
import { apiOn } from "@/lib/api/session"

/** Clave de una parte del libro: ["b", bookId, "summary", tabla]. Invalidar qk(bookId, "summary") recarga todas. */
export const bookPartKey = (bookId: string, part: BookPart) => qk(bookId, "summary", part)

/** Realtime mantiene las partes al día; el staleTime solo evita recargas al cambiar de pantalla. */
const PART_STALE = 60_000

const partQuery = (bookId: string, part: BookPart) => ({
  queryKey: bookPartKey(bookId, part),
  staleTime: PART_STALE,
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    // Interruptor `snapshot`: las partes que se piden juntas van en una sola petición a la API (si no responde, Supabase).
    apiOn("snapshot")
      ? readWithFallback(() => apiSnapshotPart(bookId, part), () => loadBookPart(createClient(), bookId, part, signal))
      : loadBookPart(createClient(), bookId, part, signal),
})

type BookResult = { data: LoadedBook | undefined; isPending: boolean; isLoading: boolean; isFetching: boolean; error: Error | null }

// El libro armado conserva su identidad mientras ninguna parte cambie (los useMemo de las vistas no se recalculan
// cuando solo cambia isFetching). Las partes ya vienen con structural sharing de TanStack.
let last: { refs: PartRows[]; book: LoadedBook } | null = null
const assemble = (refs: PartRows[]) => {
  if (last && last.refs.every((r, i) => r === refs[i])) return last.book
  const book = assembleBook(Object.fromEntries(BOOK_PART_NAMES.map((p, i) => [p, refs[i]])) as BookParts)
  last = { refs, book }
  return book
}

// Referencia estable: TanStack solo vuelve a combinar cuando cambia el resultado de alguna parte.
const combine = (results: UseQueryResult<PartRows>[]): BookResult => {
  const error = results.find((r) => r.error)?.error ?? null
  const ready = results.every((r) => r.data !== undefined)
  return {
    data: ready ? assemble(results.map((r) => r.data!)) : undefined,
    isPending: !ready && !error,
    isLoading: !ready && results.some((r) => r.isFetching),
    isFetching: results.some((r) => r.isFetching),
    error,
  }
}

/**
 * Todo el libro en la forma que esperan los cálculos de lib/domain (totales, quincena, agenda, flujo…).
 * Son 16 consultas en caché por separado: un cambio (propio o por Realtime) recarga solo la tabla afectada.
 */
export function useBookData(): BookResult {
  const bookId = useBookId()
  return useQueries({ queries: BOOK_PART_NAMES.map((p) => partQuery(bookId, p)), combine })
}

/** Precarga el libro (al pasar por el menú o cuando el navegador está libre). No hace nada si ya está fresco. */
export function prefetchBookData(qc: QueryClient, bookId: string) {
  for (const p of BOOK_PART_NAMES) void qc.prefetchQuery(partQuery(bookId, p))
}
