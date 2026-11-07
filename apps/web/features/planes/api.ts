// Planes por la API (v6 F2-H-5, interruptor `billing`): /v1/billing/payment-options y /v1/households/:h/{coupons,
// checkout,renewal}. Misma firma y misma forma que ./actions.ts; apagado es exactamente la acción de siempre.
// Como en la acción: rol (solo el dueño) o datos inválidos lanzan el error; los demás problemas son `{ ok:false, msg }`.
// V7-H3: planes públicos (GET /v1/plans) y la suscripción del hogar con sus pagos (GET /v1/households/:h/subscription).
// Con el interruptor apagado, lectura directa (modo heredado: `plans`, RPC household_subscription y plan_payments).
import { readWithFallback } from "@/lib/api/book-tables"
import { failure, isApiError } from "@/lib/api/errors"
import { activeHouseholdId, apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import { createClient } from "@/utils/supabase/client"
import * as actions from "./actions"
import type { PlanRow } from "./premium"

const on = () => apiOn("billing")
const client = () => import("@/lib/api/client")

/** Rol, sesión o datos mal formados: la acción lanzaba; el resto vuelve como `{ ok:false, msg }`. */
const throws = (e: unknown) => !isApiError(e) || e.code === "ROLE_DENIED" || e.code === "UNAUTHENTICATED" || (e.code === "VALIDATION" && e.details !== undefined)

export const paymentOptions = viaApiOr(on, actions.paymentOptions, async () => {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().billing.paymentOptions())
})

export const previewCoupon = viaApiOr(on, actions.previewCoupon, async (code: string, plan: string, periodo: "mes" | "anio") => {
  try {
    const { browserApi, unwrapData } = await client()
    const d = unwrapData(await browserApi().billing.previewCoupon({ params: { householdId: activeHouseholdId() }, body: { code, plan, periodo } }))
    return { ok: true, monto: d.monto, msg: d.msg }
  } catch (e) {
    if (throws(e)) throw e
    return failure(e)
  }
})

export const startCheckout = viaApiOr(on, actions.startCheckout, async (proveedor: "mercadopago" | "wompi", periodo: "mes" | "anio", plan = "premium", cupon?: string) => {
  try {
    const { browserApi, unwrapData } = await client()
    const d = unwrapData(await browserApi().billing.checkout({ params: { householdId: activeHouseholdId() }, body: { proveedor, periodo, plan, cupon } }))
    return { ok: true, url: d.url }
  } catch (e) {
    if (throws(e)) throw e
    return failure(e)
  }
})

export const paysRenewal = viaApiOr(on, actions.paysRenewal, async () => {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().billing.renewal({ params: { householdId: activeHouseholdId() } })).paga
})

export const cancelRenewal = viaApiOr(on, actions.cancelRenewal, async () => {
  try {
    const { browserApi, unwrapData } = await client()
    return { ok: true, msg: unwrapData(await browserApi().billing.cancelRenewal({ params: { householdId: activeHouseholdId() } })).msg }
  } catch (e) {
    return failure(e)
  }
})

// ── Lecturas (V7-H3) ────────────────────────────────────────────────────────────────────────────────────────────

/** Planes públicos que se pueden comprar, en el orden de /planes. */
export async function loadPublicPlans(): Promise<PlanRow[]> {
  const legacy = async () => {
    const { data } = await createClient().from("plans").select("*").order("orden").order("precio_mes")
    return ((data ?? []) as unknown as PlanRow[]).filter((p) => p.publico && p.activo)
  }
  if (!on()) return legacy()
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await client()
    return unwrap(await browserApi().billing.plans()).map((p) => ({ ...p, activo: true, publico: true }))
  }, legacy)
}

export type HouseholdSub = { id: string; plan: string; periodo: string; estado: string; proveedor: string; vence_at: string | null }
export type HouseholdPayment = { id: string; proveedor: string; referencia: string; periodo: string | null; monto: number; estado: string; metodo: string | null; paid_at: string | null; created_at: string; factura_ref: string | null; plan: string | null }

const subscription = async (householdId: string) => {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().billing.subscription({ params: { householdId } }))
}

/** Suscripción vigente del hogar (la que vence más tarde, sin las pendientes). */
export async function loadHouseholdSub(householdId: string): Promise<HouseholdSub | null> {
  const legacy = async () => ((await createClient().rpc("household_subscription", { h: householdId })).data?.[0] ?? null) as HouseholdSub | null
  if (!on()) return legacy()
  return readWithFallback(async () => (await subscription(householdId)).sub, legacy)
}

/** Últimos 50 pagos del plan del hogar (solo el dueño los ve). */
export async function loadHouseholdPayments(householdId: string): Promise<HouseholdPayment[]> {
  const legacy = async () => ((await createClient().from("plan_payments").select("id,proveedor,referencia,periodo,monto,estado,metodo,paid_at,created_at,factura_ref,plan").eq("household_id", householdId).neq("estado", "pendiente").order("created_at", { ascending: false }).limit(50)).data ?? []) as HouseholdPayment[]
  if (!on()) return legacy()
  return readWithFallback(async () => (await subscription(householdId)).pagos ?? [], legacy)
}
