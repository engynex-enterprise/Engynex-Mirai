"use client"

import { useQuery } from "@/lib/query"
import { createClient } from "@/utils/supabase/client"
import { useApp, useBookId } from "@/components/app/app-context"
import { qk } from "@/lib/supabase/tables"
import { gamiXP, misionesSemana, nivel, racha, rachaMax, puntuales, todayBogota, type GamiInput } from "@/lib/domain"
import { useBookData } from "@/features/book/use-book-data"
import { apiOn } from "@/lib/api/session"
import { readWithFallback } from "@/lib/api/book-tables"

export type GamiStateRow = {
  on: boolean; visitas: string[]; unl: Record<string, string>; mis: Record<string, string[]>; maxLevel: number; init: string | null
  chats: number; consejos: number; retos: { tipo: string; category_id: string | null; dias: number; base: number; inicio: string; marcas: number[] }[]
  fondo: { on: boolean; saldo: number } | null; nombre: string
}

/**
 * Estado guardado de logros (sin calcular). V7-H2: GET /v1/books/:b/gami/state con el interruptor `gami`; apagado,
 * las consultas de siempre a Supabase (rama heredada).
 */
export async function fetchGamiState(bookId: string, userId: string): Promise<GamiStateRow> {
  if (!apiOn("gami")) return fetchGamiStateLegacy(bookId, userId)
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await import("@/lib/api/client")
    return unwrap(await browserApi().gami.state({ params: { bookId } })) as unknown as GamiStateRow
  }, () => fetchGamiStateLegacy(bookId, userId))
}

async function fetchGamiStateLegacy(bookId: string, userId: string): Promise<GamiStateRow> {
  const sb = createClient()
  const [v, b, m, st, cfg, ch, cons, ret, fondo, prof] = await Promise.all([
    sb.from("gami_visits").select("dia").eq("book_id", bookId).eq("user_id", userId).order("dia", { ascending: false }).limit(400),
    sb.from("gami_badges").select("badge,unlocked_at").eq("book_id", bookId),
    sb.from("gami_missions").select("semana,mision").eq("book_id", bookId).order("semana", { ascending: false }),
    sb.from("gami_state").select("max_level,init_date").eq("book_id", bookId).maybeSingle(),
    sb.from("book_settings").select("gami").eq("book_id", bookId).single(),
    sb.from("chat_threads").select("id", { count: "exact", head: true }).eq("book_id", bookId),
    sb.from("advisor_consultations").select("id", { count: "exact", head: true }).eq("book_id", bookId).is("deleted_at", null),
    sb.from("savings_challenges").select("tipo,category_id,dias,base,inicio,marcas").eq("book_id", bookId).is("deleted_at", null),
    sb.from("emergency_funds").select("activo,saldo").eq("book_id", bookId).maybeSingle(),
    sb.from("profiles").select("nombre").eq("id", userId).single(),
  ])
  const weeks = [...new Set((m.data ?? []).map((x) => x.semana))].slice(0, 12)
  const mis: Record<string, string[]> = {}
  for (const x of m.data ?? []) if (weeks.includes(x.semana)) (mis[x.semana] ??= []).push(x.mision)
  return {
    on: cfg.data?.gami !== false,
    visitas: (v.data ?? []).map((x) => x.dia),
    unl: Object.fromEntries((b.data ?? []).map((x) => [x.badge, x.unlocked_at])) as Record<string, string>,
    mis, maxLevel: st.data?.max_level ?? 1, init: st.data?.init_date ?? null,
    chats: ch.count ?? 0, consejos: cons.count ?? 0,
    retos: (ret.data ?? []).map((r) => ({ ...r, base: Number(r.base ?? 0), marcas: (r.marcas ?? []) as number[] })) as GamiStateRow["retos"],
    fondo: fondo.data ? { on: fondo.data.activo, saldo: Number(fondo.data.saldo) } : null,
    nombre: prof.data?.nombre ?? "",
  }
}

/** Estado guardado de logros del libro (visitas del usuario, insignias, misiones, nivel máximo, interruptor). */
export function useGamiState() {
  const bookId = useBookId()
  const { user } = useApp()
  return useQuery({
    queryKey: qk(bookId, "gami", user.id),
    queryFn: () => fetchGamiState(bookId, user.id),
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
