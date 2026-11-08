// Resumen del mes por la API: POST /v1/books/:b/reports/:mes/summary (generar) y
// GET /v1/books/:b/month-summaries/:mes (el ya guardado).
import type { MonthSummary } from "@mirai/ai/server/reports"
import { activeBookId } from "@/lib/api/session"

export type { MonthSummary }

/** Resumen del mes con IA (con respaldo sin IA). Los errores se lanzan con el mensaje en español de la API. */
export async function generateMonthSummary(k: string): Promise<MonthSummary> {
  if (!/^\d{4}-\d{2}$/.test(k)) throw new Error("Mes inválido")
  const { browserApi, unwrapData } = await import("@/lib/api/client")
  return unwrapData(await browserApi().ai.monthSummary({ params: { bookId: activeBookId(), mes: k } })) as MonthSummary
}

/** Resumen del mes ya guardado (o null). */
export async function fetchMonthSummary(bookId: string, k: string): Promise<MonthSummary | null> {
  const { browserApi, unwrap } = await import("@/lib/api/client")
  return (unwrap(await browserApi().books.monthSummary({ params: { bookId, mes: k } })).contenido ?? null) as MonthSummary | null
}
