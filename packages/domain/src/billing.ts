// Planes y pagos (isomórfico): reglas de estado de un pago del plan, referencias de las pasarelas y avisos. La base las aplica en una sola transacción con
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

// ── Referencias y estados de las pasarelas ─────────────────────────────────────────────────────────────────────────

export type Periodo = "mes" | "anio"
export type Proveedor = "mercadopago" | "wompi" | "manual"

/** external_reference de Mirai en Mercado Pago: "mirai:{hogar}:{periodo}:{plan}[:{cupón}]". */
export const mpRef = (householdId: string, periodo: Periodo, plan = "premium", cupon?: string | null) => `mirai:${householdId}:${periodo}:${plan}${cupon ? `:${cupon}` : ""}`
export function parseMpRef(ref?: string | null) {
  const m = ref?.match(/^mirai:([0-9a-f-]{36}):(mes|anio)(?::([a-z0-9-]{2,30}))?(?::([A-Z0-9_-]{3,30}))?$/)
  return m ? { householdId: m[1], periodo: m[2] as Periodo, plan: m[3] ?? "premium", cupon: m[4] ?? null } : null
}

/** Estado de la suscripción de Mercado Pago (preapproval) → plan_subscriptions.estado. */
export const MP_SUB_STATE = { pending: "pendiente", authorized: "activa", paused: "vencida", cancelled: "cancelada" } as const
/** Estado de un pago de Mercado Pago → plan_payments.estado. */
export const mpPayState = (s?: string): PayState => (s === "approved" ? "aprobado" : s === "rejected" || s === "cancelled" ? "rechazado" : s === "refunded" || s === "charged_back" ? "reembolsado" : "pendiente")
/** Estado de una transacción de Wompi → plan_payments.estado. */
export const WOMPI_STATE: Record<string, PayState> = { APPROVED: "aprobado", DECLINED: "rechazado", ERROR: "rechazado", VOIDED: "anulado", PENDING: "pendiente" }

/** Lo que devuelve apply_plan_payment (la transacción de la base). */
export type ApplyResult = {
  subscription_id: string | null; payment_id: string; prev_estado: PayState | null; estado: PayState
  first_approval: boolean; revoked: boolean; vence_at: string | null; cupon_contado: boolean
}

const fechaLarga = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" })

/**
 * Aviso para los dueños después de aplicar un pago (o null si no hay nada que avisar). Mismos textos y `dedupe` que
 * applyPayment de apps/web/lib/payments/apply.ts.
 */
export function paymentNotice(r: Pick<ApplyResult, "first_approval" | "revoked" | "vence_at" | "estado" | "prev_estado">, p: { proveedor: string; referencia: string; monto: number; planNombre?: string | null }, now = new Date()): { titulo: string; cuerpo: string; dedupe: string } | null {
  const fx = payEffect(r.prev_estado, r.estado)
  const precio = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`
  if (r.first_approval && r.vence_at)
    return { titulo: `¡Bienvenido a Mirai ${p.planNombre ?? "Premium"}!`, cuerpo: `Recibimos tu pago de ${precio(p.monto)}. Tu plan está activo hasta el ${fechaLarga(r.vence_at)}.`, dedupe: `pay-ok-${p.proveedor}-${p.referencia}` }
  if (r.revoked)
    return {
      titulo: r.estado === "anulado" ? "Tu pago se anuló" : "Tu pago fue reembolsado",
      cuerpo: r.vence_at && new Date(r.vence_at) > now
        ? `Quitamos ese periodo de tu plan: ahora está activo hasta el ${fechaLarga(r.vence_at)}.`
        : "Quitamos ese periodo de tu plan y volviste al plan Gratis. Tus datos siguen intactos; puedes pagar de nuevo en Ajustes › Mi plan.",
      dedupe: `pay-rev-${p.proveedor}-${p.referencia}`,
    }
  if (fx.rejected) return { titulo: "Tu pago no se aprobó", cuerpo: "El banco o la pasarela rechazó el pago de tu plan. Intenta de nuevo o usa otro medio en Ajustes › Mi plan.", dedupe: `pay-ko-${p.proveedor}-${p.referencia}` }
  return null
}
