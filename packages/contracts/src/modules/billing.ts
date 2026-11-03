// Módulo `billing` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-I (lectura pública: F2-C).
// Comandos del plan: pasarelas disponibles, vista previa del cupón, checkout (Mercado Pago: suscripción con tarjeta;
// Wompi: pago único), renovación automática y los webhooks firmados de Mercado Pago y Wompi (applyPayment idempotente).
// Equivalen a features/planes/actions.ts y app/api/pagos/* de apps/web. GET /v1/plans y la suscripción del hogar
// (lectura) son de F2-C-3 y se agregan a este archivo.
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

const c = initContract()
export const billingContract = c.router(
  {
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
