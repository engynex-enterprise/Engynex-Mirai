"use client"

import { useQuery } from "@/lib/query"
import { useApp, useBookId } from "@/components/app/app-context"
import { qk } from "@/lib/supabase/tables"
import { gamiXP, misionesSemana, nivel, racha, rachaMax, puntuales, todayBogota, type GamiInput } from "@/lib/domain"
import { useBookData } from "@/features/book/use-book-data"

export type GamiStateRow = {
  on: boolean; visitas: string[]; unl: Record<string, string>; mis: Record<string, string[]>; maxLevel: number; init: string | null
  chats: number; consejos: number; retos: { tipo: string; category_id: string | null; dias: number; base: number; inicio: string; marcas: number[] }[]
  fondo: { on: boolean; saldo: number } | null; nombre: string
}

/** Estado guardado de logros (sin calcular): GET /v1/books/:b/gami/state. */
export async function fetchGamiState(bookId: string): Promise<GamiStateRow> {
  const { browserApi, unwrap } = await import("@/lib/api/client")
  return unwrap(await browserApi().gami.state({ params: { bookId } })) as unknown as GamiStateRow
}

/** Estado guardado de logros del libro (visitas del usuario, insignias, misiones, nivel máximo, interruptor). */
export function useGamiState() {
  const bookId = useBookId()
  const { user } = useApp()
  return useQuery({
    queryKey: qk(bookId, "gami", user.id),
    queryFn: () => fetchGamiState(bookId),
  })
}

/** Todo lo calculado: puntos, nivel, racha, misiones e insignias. */
export function useGami() {
  const { data: book } = useBookData()
  const { data: st } = useGamiState()
  if (!book || !st) return null
  const today = todayBogota()
  const G: GamiInput = { book, perfilNombre: st.nombre, fondo: st.fondo, retos: st.retos as GamiInput["retos"], consejos: st.consejos, chats: st.chats, visitas: st.visitas, unl: st.unl, mis: st.mis }
  const X = gamiXP(G, today)
  return { G, st, today, X, L: nivel(X.total), racha: racha(st.visitas, today), rachaMax: rachaMax(st.visitas), M: misionesSemana(G, today), P: puntuales(book, today) }
}
