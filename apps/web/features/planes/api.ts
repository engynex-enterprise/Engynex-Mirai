// Planes por la API: /v1/billing/payment-options, /v1/households/:h/{coupons,checkout,renewal}, planes públicos
// (GET /v1/plans) y la suscripción del hogar con sus pagos (GET /v1/households/:h/subscription).
// Rol (solo el dueño), sesión o datos inválidos lanzan el error; los demás problemas son `{ ok:false, msg }`.
import { failure, isApiError } from "@/lib/api/errors"
import { activeHouseholdId } from "@/lib/api/session"
import type { PlanRow } from "./premium"

const client = () => import("@/lib/api/client")

/** Rol, sesión o datos mal formados se lanzan; el resto vuelve como `{ ok:false, msg }`. */
const throws = (e: unknown) => !isApiError(e) || e.code === "ROLE_DENIED" || e.code === "UNAUTHENTICATED" || (e.code === "VALIDATION" && e.details !== undefined)

/** Qué pasarelas están listas en este despliegue. */
export async function paymentOptions() {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().billing.paymentOptions())
}

/** Precio final con un cupón, para mostrarlo antes de pagar. */
export async function previewCoupon(code: string, plan: string, periodo: "mes" | "anio"): Promise<{ ok: boolean; msg: string; monto?: number }> {
  try {
    const { browserApi, unwrapData } = await client()
    const d = unwrapData(await browserApi().billing.previewCoupon({ params: { householdId: activeHouseholdId() }, body: { code, plan, periodo } }))
    return { ok: true, monto: d.monto, msg: d.msg }
  } catch (e) {
    if (throws(e)) throw e
    return failure(e)
  }
}

/**
 * Inicia el pago de un plan y devuelve la URL de la pasarela.
 * Mercado Pago: suscripción automática con tarjeta. Wompi: pago único (Nequi, PSE, Bancolombia, tarjeta) por un mes o un año.
 */
export async function startCheckout(proveedor: "mercadopago" | "wompi", periodo: "mes" | "anio", plan = "premium", cupon?: string): Promise<{ ok: boolean; url?: string; msg?: string }> {
  try {
    const { browserApi, unwrapData } = await client()
    const d = unwrapData(await browserApi().billing.checkout({ params: { householdId: activeHouseholdId() }, body: { proveedor, periodo, plan, cupon } }))
    return { ok: true, url: d.url }
  } catch (e) {
    if (throws(e)) throw e
    return failure(e)
  }
}

/** ¿Pagas tú una renovación automática de este hogar? (quien pasó el hogar puede cancelarla aunque ya no sea dueño). */
export async function paysRenewal(): Promise<boolean> {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().billing.renewal({ params: { householdId: activeHouseholdId() } })).paga
}

/** Cancela la renovación automática (Mercado Pago). El plan sigue hasta la fecha de vencimiento. */
export async function cancelRenewal(): Promise<{ ok: boolean; msg: string }> {
  try {
    const { browserApi, unwrapData } = await client()
    return { ok: true, msg: unwrapData(await browserApi().billing.cancelRenewal({ params: { householdId: activeHouseholdId() } })).msg }
  } catch (e) {
    return failure(e)
  }
}

// ── Lecturas ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Planes públicos que se pueden comprar, en el orden de /planes. */
export async function loadPublicPlans(): Promise<PlanRow[]> {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().billing.plans()).map((p) => ({ ...p, activo: true, publico: true }))
}

export type HouseholdSub = { id: string; plan: string; periodo: string; estado: string; proveedor: string; vence_at: string | null }
export type HouseholdPayment = { id: string; proveedor: string; referencia: string; periodo: string | null; monto: number; estado: string; metodo: string | null; paid_at: string | null; created_at: string; factura_ref: string | null; plan: string | null }

const subscription = async (householdId: string) => {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().billing.subscription({ params: { householdId } }))
}

/** Suscripción vigente del hogar (la que vence más tarde, sin las pendientes). */
export async function loadHouseholdSub(householdId: string): Promise<HouseholdSub | null> {
  return (await subscription(householdId)).sub
}

/** Últimos 50 pagos del plan del hogar (solo el dueño los ve). */
export async function loadHouseholdPayments(householdId: string): Promise<HouseholdPayment[]> {
  return (await subscription(householdId)).pagos ?? []
}
