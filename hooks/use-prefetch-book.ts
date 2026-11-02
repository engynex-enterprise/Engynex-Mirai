"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { prefetchBookData } from "@/features/book/use-book-data"

/**
 * Cuando el navegador queda libre, precarga el libro (las 16 partes que usan Inicio, Balance, Flujo, Metas,
 * Préstamos, Reportes…). Así, al abrir esas secciones desde el menú los datos ya están en caché.
 * No repite lo que ya está fresco (staleTime de las partes).
 */
export function useIdlePrefetchBook(bookId: string) {
  const qc = useQueryClient()
  useEffect(() => {
    const run = () => prefetchBookData(qc, bookId)
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 4_000 })
      return () => window.cancelIdleCallback(id)
    }
    const t = setTimeout(run, 1_500)
    return () => clearTimeout(t)
  }, [qc, bookId])
}
