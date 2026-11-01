"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/utils/supabase/client"
import { useBookId } from "@/components/app/app-context"
import { qk } from "@/lib/supabase/tables"
import { loadBookData } from "@/lib/book-data"

/**
 * Todo el libro en la forma que esperan los cálculos de lib/domain (totales, quincena, agenda, flujo…).
 * Una sola consulta con clave "summary": se refresca ante cualquier cambio del libro (incluido Realtime).
 */
export function useBookData() {
  const bookId = useBookId()
  return useQuery({
    queryKey: qk(bookId, "summary"),
    staleTime: 15_000,
    queryFn: () => loadBookData(createClient(), bookId),
  })
}
