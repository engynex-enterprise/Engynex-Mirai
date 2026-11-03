"use server"

import "@/lib/services"
import { requireRole } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { monthSummaryWith, type MonthSummary } from "@mirai/ai/server/reports"

export type { MonthSummary }

/** Resumen del mes con IA (resumenIA de la v4), con respaldo sin IA. Se guarda en monthly_summaries (@mirai/ai/server/reports). */
export async function generateMonthSummary(k: string): Promise<MonthSummary> {
  if (!/^\d{4}-\d{2}$/.test(k)) throw new Error("Mes inválido")
  const ctx = await requireRole("editor")
  return monthSummaryWith(ctx, await supabaseServer(), k)
}
