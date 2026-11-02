// Límites del plan para las automatizaciones (isomórfico). La base aplica el mismo límite con el trigger
// automation_limit (supabase/migrations/20261103000300_automatizaciones.sql).
import { can, type PlanInfo } from "@/lib/plans"

/** Automatizaciones activas a la vez en el plan Gratis (si la tabla plans no dice otra cosa). */
export const FREE_ACTIVE = 3

/** Máximo de automatizaciones activas por libro (null = sin límite, Premium). */
export function activeLimit(plan: PlanInfo): number | null {
  if (plan.id !== "gratis") return null
  const v = Number((plan.limites as Record<string, unknown>).automatizaciones)
  return v > 0 ? v : FREE_ACTIVE
}

/** ¿Puede activar una más? */
export const canActivate = (plan: PlanInfo, activas: number) => {
  const lim = activeLimit(plan)
  return lim === null || activas < lim
}

/** El paso "Pedir un consejo a la IA" es Premium (usa la función ia del plan). */
export const canUseAi = (plan: PlanInfo) => can(plan, "ia")
