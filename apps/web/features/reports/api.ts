// Resumen del mes por la API (v6 F2-H-5, interruptor `ai`): POST /v1/books/:b/reports/:mes/summary. Misma firma y
// misma forma que la Server Action generateMonthSummary (./actions.ts); apagado es la acción de siempre.
import { activeBookId, apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import * as actions from "./actions"

export type { MonthSummary } from "./actions"

export const generateMonthSummary = viaApiOr<Parameters<typeof actions.generateMonthSummary>, Awaited<ReturnType<typeof actions.generateMonthSummary>>>(() => apiOn("ai"), actions.generateMonthSummary, async (k) => {
  if (!/^\d{4}-\d{2}$/.test(k)) throw new Error("Mes inválido")
  const { browserApi, unwrapData } = await import("@/lib/api/client")
  return unwrapData(await browserApi().ai.monthSummary({ params: { bookId: activeBookId(), mes: k } })) as actions.MonthSummary
})

/**
 * Resumen del mes ya guardado (o null). V7-H2: GET /v1/books/:b/month-summaries/:mes con el mismo interruptor `ai`;
 * apagado, monthly_summaries con Supabase directo (rama heredada). Si la API no responde, lo de siempre.
 */
export async function fetchMonthSummary(bookId: string, k: string): Promise<actions.MonthSummary | null> {
  const legacy = async () => {
    const { createClient } = await import("@/utils/supabase/client")
    return ((await createClient().from("monthly_summaries").select("contenido").eq("book_id", bookId).eq("mes", k).is("deleted_at", null).maybeSingle()).data?.contenido ?? null) as actions.MonthSummary | null
  }
  if (!apiOn("ai")) return legacy()
  const { readWithFallback } = await import("@/lib/api/book-tables")
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await import("@/lib/api/client")
    return (unwrap(await browserApi().books.monthSummary({ params: { bookId, mes: k } })).contenido ?? null) as actions.MonthSummary | null
  }, legacy)
}
