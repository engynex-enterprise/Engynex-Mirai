// Módulo `fixed & subscriptions` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
// Comandos sobre las RPC transaccionales que hoy llama el navegador (mismos argumentos):
//   POST   …/fixed/:id/pay                → pay_fixed_expense (features/fixed/pay-fixed-dialog.tsx)
//   DELETE …/fixed/payments/:id           → unpay_fixed_expense (features/fixed/fixed-view.tsx)
//   POST   …/subscriptions/:id/charge     → pay_subscription ("Ya se cobró", features/subscriptions/subscriptions-view.tsx)
// El CRUD de fixed_expenses y subscriptions sale del contrato genérico book-tables.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiOk, IsoDate, Uuid } from "../common"
import { IdParams, Periodo, Positive, WRITE_ERRORS } from "./write-common"

export const meta = { id: "fixed", owner: "F2-D" } as const

/**
 * Periodo del pago: el de fijoPeriods o `prev-AAAA-MM` (y `-Q1`/`-Q2`), el pago de antes del alta que registra el
 * formulario del gasto fijo cuando dices que ya lo pagaste este mes (features/fixed/fixed-form.tsx).
 */
export const PayPeriodo = z.union([Periodo, z.string().regex(/^prev-\d{4}-(0[1-9]|1[0-2])(-Q[12])?$/)], { error: "Periodo inválido (usa AAAA-MM, AAAA-MM-Q1, AAAA o U)" })

export const PayFixed = z.object({
  periodo: PayPeriodo,
  fecha: IsoDate,
  /** Lo que pagaste; sin valor, lo que falta del periodo (fijoValor menos los abonos). */
  valor: Positive.optional(),
  /**
   * ¿Con esto queda pagado el periodo? true: sí (aunque sea menos: "esta vez costó menos"); false: es un abono y falta
   * el resto. Sin decirlo: queda pagado si cubre lo que falta (o si el fijo es de valor variable).
   */
  completo: z.boolean().optional(),
  /** Medio con que pagaste; sin medio, el del gasto fijo. */
  payment_method_id: Uuid.nullable().optional(),
})
export const PayFixedOut = z.object({ ajuste: z.string().nullable().optional(), aporte: z.unknown().optional(), valor: z.number(), periodo: z.string(), completo: z.boolean().optional(), falta: z.number().optional() }).loose()
export const ChargeSub = z.object({ fecha: IsoDate.optional(), valor: Positive.optional(), payment_method_id: Uuid.nullable().optional() })
export const ChargeSubOut = z.object({ expense_id: z.string().optional(), proximo: z.string().optional() }).loose()

const c = initContract()
export const fixedContract = c.router(
  {
    pay: {
      method: "POST", path: "/v1/books/:bookId/fixed/:id/pay", pathParams: IdParams, body: PayFixed,
      responses: { ...WRITE_ERRORS, 200: ApiOk(PayFixedOut) },
      summary: "Registra el pago de un periodo (crea el gasto y el pago; aportes a metas o al fondo incluidos)",
      description: "409 si ese periodo ya está pagado. Rol: «Colabora» o más.",
    },
    unpay: {
      method: "DELETE", path: "/v1/books/:bookId/fixed/payments/:id", pathParams: IdParams, body: c.noBody(),
      responses: { ...WRITE_ERRORS, 200: ApiOk(z.object({ id: z.string() })) }, summary: "Deshace el pago (borra el gasto ligado y revierte el aporte)",
    },
    charge: {
      method: "POST", path: "/v1/books/:bookId/subscriptions/:id/charge", pathParams: IdParams, body: ChargeSub,
      responses: { ...WRITE_ERRORS, 200: ApiOk(ChargeSubOut) }, summary: "«Ya se cobró»: crea el gasto y mueve el próximo cobro",
    },
  },
  { strictStatusCodes: true },
)
