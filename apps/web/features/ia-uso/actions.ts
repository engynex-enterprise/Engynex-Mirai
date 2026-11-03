"use server"

import "@/lib/services"
import { requireRole } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { myAiUsageWith } from "@mirai/ai/server/usage-report"

/** Uso de IA del hogar: cupo del mes, costo, ahorro, serie por día, por función y últimas solicitudes (Ajustes › Uso de IA). */
export async function myAiUsage() {
  const ctx = await requireRole("viewer")
  return myAiUsageWith(ctx, await supabaseServer())
}
export type MyAiUsage = Awaited<ReturnType<typeof myAiUsage>>
