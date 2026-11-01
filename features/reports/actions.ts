"use server"

import { z } from "zod"
import { requireRole } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { loadBookData } from "@/lib/book-data"
import { aiObject, AiUnavailable } from "@/lib/ai/run"
import { formatCOP, monthSummaryData, todayBogota } from "@/lib/domain"
import { fmtMonth } from "@/lib/format"

const Summary = z.object({ titular: z.string(), resumen: z.string(), gastaste_mas: z.array(z.string()), mejoro: z.array(z.string()), alertas: z.array(z.string()), recomendacion: z.string() })
export type MonthSummary = z.infer<typeof Summary> & { fecha: string; local?: boolean; provider?: string }

/** Resumen del mes con IA (resumenIA de la v4), con respaldo sin IA. Se guarda en monthly_summaries. */
export async function generateMonthSummary(k: string): Promise<MonthSummary> {
  if (!/^\d{4}-\d{2}$/.test(k)) throw new Error("Mes inválido")
  const ctx = await requireRole("editor")
  const sb = await supabaseServer()
  const b = await loadBookData(sb, ctx.book.id)
  const data = { mes: fmtMonth(k), ...monthSummaryData(b, k, todayBogota()) }
  let out: MonthSummary
  try {
    const r = await aiObject({
      householdId: ctx.household.id, bookId: ctx.book.id, schema: Summary,
      prompt: `Eres un asesor financiero cercano para una familia colombiana. Haz un resumen del mes en español sencillo, con cifras en formato $ 1.234.567. "titular": máx 12 palabras; "resumen": 2-3 frases; "gastaste_mas": 3 puntos; "mejoro": 1-3 puntos; "alertas": 0-3 puntos; "recomendacion": una acción concreta para el próximo mes.\nDATOS: ${JSON.stringify(data)}`,
    })
    out = { ...r.object, provider: r.provider, fecha: todayBogota() }
  } catch (e) {
    const top = Object.entries(data.gastos_por_categoria).sort((x, y) => y[1] - x[1]).slice(0, 3)
    out = {
      titular: `Gastaste ${formatCOP(data.total)} en ${data.mes}`,
      resumen: `Comparado con el mes anterior (${formatCOP(data.total_anterior)}), ${data.total > data.total_anterior ? "gastaste más" : "gastaste menos"}.`,
      gastaste_mas: top.map(([c, v]) => `${c}: ${formatCOP(v)}`), mejoro: [], alertas: data.topes_excedidos.map((c) => `Te pasaste del tope en ${c}`),
      recomendacion: e instanceof AiUnavailable ? `${e.message} Así recibirás un análisis completo.` : "No pudimos consultar la IA; intenta de nuevo más tarde para un análisis completo.",
      local: true, fecha: todayBogota(),
    }
  }
  const { error } = await sb.from("monthly_summaries").upsert({ book_id: ctx.book.id, mes: k, contenido: out as never, deleted_at: null }, { onConflict: "book_id,mes" })
  if (error) throw new Error(error.message)
  return out
}
