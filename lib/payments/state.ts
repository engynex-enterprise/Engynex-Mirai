// Reglas de estado de un pago del plan (isomórfico). La base las aplica en una sola transacción con
// apply_plan_payment() (supabase/migrations/20261103003400_planes_automat.sql): este archivo es la referencia
// probada con Vitest y lo usa applyPayment para decidir qué avisar.

export type PayState = "pendiente" | "aprobado" | "rechazado" | "reembolsado" | "anulado"

const FINAL_REVERSO: PayState[] = ["reembolsado", "anulado"]

/**
 * Estado que queda al recibir una notificación. Las pasarelas reenvían y desordenan los avisos: uno viejo no puede
 * retroceder un estado ("pendiente" no pisa nada; "rechazado" no pisa "aprobado"; reembolsado y anulado son finales).
 */
export function nextPayState(prev: PayState | null | undefined, incoming: PayState): PayState {
  if (!prev || prev === incoming) return incoming
  if (FINAL_REVERSO.includes(prev)) return prev
  if (incoming === "pendiente") return prev
  if (prev === "aprobado" && incoming === "rechazado") return prev
  return incoming
}

/** Qué hace el cambio: extender el plan (primera aprobación) o quitar el periodo (reembolso o anulación). */
export function payEffect(prev: PayState | null | undefined, final: PayState) {
  return {
    extend: final === "aprobado" && prev !== "aprobado",
    revoke: FINAL_REVERSO.includes(final) && prev === "aprobado",
    rejected: final === "rechazado" && prev !== "rechazado",
  }
}

/**
 * ¿Este pago aprobado suma un uso del cupón? Mercado Pago cobra cada mes con el mismo cupón (va en la referencia):
 * solo el primer pago aprobado de la suscripción cuenta. En Wompi cada pago es una compra nueva y siempre cuenta.
 */
export const couponCounts = (proveedor: string, otrosPagosConCupon: number) => proveedor !== "mercadopago" || otrosPagosConCupon === 0

/** Vencimiento tras quitar un periodo pagado (reembolso). Si ya no queda tiempo, el plan vence sin días de gracia. */
export function revokeVence(vence: string | Date, periodo: "mes" | "anio", now = new Date()) {
  const d = new Date(vence)
  if (periodo === "anio") d.setUTCFullYear(d.getUTCFullYear() - 1)
  else {
    const day = d.getUTCDate()
    d.setUTCMonth(d.getUTCMonth() - 1)
    if (d.getUTCDate() < day) d.setUTCDate(0) // 31 mar − 1 mes → 28/29 feb (igual que interval '1 month' en la base)
  }
  return { vence: d, vencida: d.getTime() <= now.getTime() }
}
