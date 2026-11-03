// Módulo `billing` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-I (lectura pública: F2-C).
// Comandos del plan: pasarelas disponibles, vista previa del cupón, checkout (Mercado Pago: suscripción con tarjeta;
// Wompi: pago único), renovación automática y los webhooks firmados de Mercado Pago y Wompi (applyPayment idempotente).
// Equivalen a features/planes/actions.ts y app/api/pagos/* de apps/web. V7-G: GET /v1/plans (usePlans y la portada) y
// GET /v1/households/:householdId/subscription (Ajustes › Mi plan: household_subscription + plan_payments).
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiError, ApiOk, COMMON_ERRORS } from "../common"
import { HouseholdParams, Msg } from "./households"

export const meta = { id: "billing", owner: "F2-I (lectura pública: F2-C)" } as const

export const BILLING_ERRORS = { ...COMMON_ERRORS, 402: ApiError, 409: ApiError, 502: ApiError } as const

export const Periodo = z.enum(["mes", "anio"], { error: "Periodo inválido (mes o anio)" })
export const PlanId = z.string().regex(/^[a-z0-9-]{2,30}$/, "Plan inválido")
export const Proveedor = z.enum(["mercadopago", "wompi"], { error: "Pasarela inválida" })

export const PaymentOptions = z.object({ mercadopago: z.boolean(), wompi: z.boolean() })
export const CouponPreview = z.object({ code: z.string().max(40), plan: PlanId, periodo: Periodo })
export const CouponPreviewed = Msg.extend({ monto: z.number() })
export const Checkout = z.object({ proveedor: Proveedor, periodo: Periodo, plan: PlanId.default("premium"), cupon: z.string().max(40).optional().nullable() })
export type Checkout = z.infer<typeof Checkout>
export const CheckoutStarted = z.object({ url: z.string() })
export const Renewal = z.object({ paga: z.boolean() })

/** Notificación de Mercado Pago: el tipo y el id llegan en la URL (y a veces en el cuerpo). */
export const MpWebhookQuery = z.object({ type: z.string().optional(), topic: z.string().optional(), "data.id": z.string().optional(), id: z.string().optional() }).passthrough()
export const WebhookAck = z.object({ ok: z.literal(true), ignorado: z.string().optional() })

/** Plan visible en /planes y en la portada (público y que se puede comprar). Sin datos de los hogares. */
export const PublicPlan = z.object({
  id: z.string(), nombre: z.string(), descripcion: z.string(), precio_mes: z.number(), precio_anio: z.number(), funciones: z.array(z.string()), anuncios: z.boolean(),
  limites: z.object({ libros: z.number().optional(), personas: z.number().optional(), automatizaciones: z.number().optional() }), destacado: z.boolean(), orden: z.number(),
})
export type PublicPlan = z.infer<typeof PublicPlan>

/** Suscripción vigente del hogar (RPC household_subscription: la que vence más tarde, sin las pendientes). */
export const HouseholdSub = z.object({ id: z.string(), plan: z.string(), periodo: z.string(), estado: z.string(), proveedor: z.string(), vence_at: z.string().nullable() })
/** Pago del plan del hogar a Mirai (solo lo ve el dueño, como la RLS de plan_payments). */
export const HouseholdPayment = z.object({
  id: z.string(), proveedor: z.string(), referencia: z.string(), periodo: z.string().nullable(), monto: z.number(), estado: z.string(), metodo: z.string().nullable(),
  paid_at: z.string().nullable(), created_at: z.string(), factura_ref: z.string().nullable(), plan: z.string().nullable(),
})
export const HouseholdSubscription = z.object({
  sub: HouseholdSub.nullable(),
  /** Últimos 50 pagos (sin los pendientes). `null` si no eres el dueño. */
  pagos: z.array(HouseholdPayment).nullable(),
})
export type HouseholdSubscription = z.infer<typeof HouseholdSubscription>

const c = initContract()
export const billingContract = c.router(
  {
    plans: { method: "GET", path: "/v1/plans", responses: { ...BILLING_ERRORS, 200: z.array(PublicPlan) }, summary: "Planes públicos y activos (sin sesión), en el orden de /planes" },
    subscription: { method: "GET", path: "/v1/households/:householdId/subscription", pathParams: HouseholdParams, responses: { ...BILLING_ERRORS, 200: HouseholdSubscription }, summary: "Mi plan: suscripción vigente del hogar (cualquier integrante) y sus pagos (solo el dueño)" },
    paymentOptions: { method: "GET", path: "/v1/billing/payment-options", responses: { ...BILLING_ERRORS, 200: PaymentOptions }, summary: "Pasarelas listas en este despliegue (sin llaves, los botones se muestran deshabilitados)" },
    previewCoupon: { method: "POST", path: "/v1/households/:householdId/coupons/preview", pathParams: HouseholdParams, body: CouponPreview, responses: { ...BILLING_ERRORS, 200: ApiOk(CouponPreviewed) }, summary: "Precio final con un cupón (solo el dueño)" },
    checkout: { method: "POST", path: "/v1/households/:householdId/checkout", pathParams: HouseholdParams, body: Checkout, responses: { ...BILLING_ERRORS, 200: ApiOk(CheckoutStarted) }, summary: "Inicia el pago del plan y devuelve la URL de la pasarela (solo el dueño; acepta Idempotency-Key)" },
    renewal: { method: "GET", path: "/v1/households/:householdId/renewal", pathParams: HouseholdParams, responses: { ...BILLING_ERRORS, 200: Renewal }, summary: "¿Pagas tú una renovación automática de este hogar?" },
    cancelRenewal: { method: "DELETE", path: "/v1/households/:householdId/renewal", pathParams: HouseholdParams, body: c.noBody(), responses: { ...BILLING_ERRORS, 200: ApiOk(Msg) }, summary: "Cancela la renovación automática (el plan sigue hasta su vencimiento)" },
    mercadopagoWebhook: {
      method: "POST",
      path: "/v1/webhooks/mercadopago",
      query: MpWebhookQuery,
      body: z.unknown(),
      responses: { ...BILLING_ERRORS, 200: WebhookAck },
      summary: "Webhook de Mercado Pago (x-signature verificada; se consulta el recurso en la API de Mercado Pago)",
    },
    wompiWebhook: { method: "POST", path: "/v1/webhooks/wompi", body: z.unknown(), responses: { ...BILLING_ERRORS, 200: WebhookAck }, summary: "Eventos de Wompi (checksum sobre el cuerpo crudo y monto igual al generado por Mirai)" },
  },
  { strictStatusCodes: true },
)
