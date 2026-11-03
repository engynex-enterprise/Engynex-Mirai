// Límites del plan para las automatizaciones (isomórfico). La base aplica la MISMA regla con
// plan_automation_limit() y el trigger automation_limit (supabase/migrations/20261103003400_planes_automat.sql).
import { can, type PlanInfo } from "../plans"

/** Automatizaciones activas a la vez en Gratis cuando el plan no está en la tabla plans (FREE_PLAN). */
export const FREE_ACTIVE = 3

/**
 * Máximo de automatizaciones activas por libro según `plans.limites.automatizaciones` del plan del hogar:
 * un número ≥ 0 es el límite; sin dato (o algo que no es número) = sin límite. Vale para Gratis, Premium y los
 * planes que cree el administrador en la consola.
 */
export function activeLimit(plan: PlanInfo): number | null {
  const v = (plan.limites as Record<string, unknown>).automatizaciones
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null
}

/** ¿Puede activar una más? */
export const canActivate = (plan: PlanInfo, activas: number) => {
  const lim = activeLimit(plan)
  return lim === null || activas < lim
}

/**
 * Automatizaciones que pueden correr cuando el hogar quedó por encima del límite (bajó de plan): solo las primeras N
 * que se crearon, en el mismo orden que ve la persona. Las demás siguen activas en la lista, pero no corren.
 */
export function runnable<T extends { created_at: string }>(plan: PlanInfo, activas: T[]): T[] {
  const lim = activeLimit(plan)
  if (lim === null || activas.length <= lim) return activas
  return [...activas].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)).slice(0, lim)
}

/** El paso "Pedir un consejo a la IA" es Premium (usa la función ia del plan). */
export const canUseAi = (plan: PlanInfo) => can(plan, "ia")
