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
