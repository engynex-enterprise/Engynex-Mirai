"use server"

import { requireRole } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { planOf } from "@/lib/plan-server"
import { can } from "@/lib/plans"
import { aiPlatformSettings, householdQuota, latestTrm } from "@/lib/ai/usage"
import { byDay, dayBogota, groupBy, monthStartBogota, savings, totals, type RollupRow } from "@/lib/ai/credits"

/** Uso de IA del hogar: cupo del mes, costo, ahorro, serie por día, por función y últimas solicitudes (Ajustes › Uso de IA). */
export async function myAiUsage() {
  const ctx = await requireRole("viewer")
  const sb = await supabaseServer()
  const hoy = dayBogota()
  const inicioMes = dayBogota(monthStartBogota())
  const hace30 = dayBogota(new Date(Date.now() - 29 * 86_400_000))
  const desde = inicioMes < hace30 ? inicioMes : hace30
  const plan = await planOf(ctx.household.id)
  const [quota, s, trm, { data: roll }, { data: recent }] = await Promise.all([
    householdQuota(ctx.household.id, plan.id),
    aiPlatformSettings(),
    latestTrm(),
    sb.rpc("ai_usage_rollup", { p_desde: desde, p_household: ctx.household.id }),
    sb.from("ai_usage").select("id,created_at,feature,fuente,provider,model,input_tokens,output_tokens,cached_tokens,costo_usd,creditos,de_plataforma,ok,duracion_ms")
      .eq("household_id", ctx.household.id).order("created_at", { ascending: false }).limit(50),
  ])
  const rows = (roll ?? []) as RollupRow[]
  const delMes = rows.filter((r) => String(r.dia) >= inicioMes)
  const t = totals(delMes)
  return {
    plan: plan.nombre, incluyeIa: can(plan, "ia"), quota, avisoPct: s.avisoPct, creditUsd: s.creditUsd, trm,
    mes: t, ahorro: savings(t), propia: totals(delMes.filter((r) => r.fuente === "ia" && !r.de_plataforma)),
    porDia: byDay(rows, hace30, hoy).map((d) => ({ k: d.k, creditos: d.creditos, llamadas: d.llamadas, ia: d.ia, sinIa: d.cache + d.algoritmo })),
    porFuncion: groupBy(delMes, (r) => r.feature),
    recientes: (recent ?? []).map((r) => ({ ...r, costo_usd: +r.costo_usd, creditos: +r.creditos })),
  }
}
export type MyAiUsage = Awaited<ReturnType<typeof myAiUsage>>
