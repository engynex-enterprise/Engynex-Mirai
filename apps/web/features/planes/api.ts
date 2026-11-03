// Planes por la API (v6 F2-H-5, interruptor `billing`): /v1/billing/payment-options y /v1/households/:h/{coupons,
// checkout,renewal}. Misma firma y misma forma que ./actions.ts; apagado es exactamente la acción de siempre.
// Como en la acción: rol (solo el dueño) o datos inválidos lanzan el error; los demás problemas son `{ ok:false, msg }`.
// La suscripción del hogar (RPC household_subscription en plan-tab.tsx) aún no tiene endpoint: sigue directo.
import { failure, isApiError } from "@/lib/api/errors"
import { activeHouseholdId, apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import * as actions from "./actions"

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
