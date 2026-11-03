// Módulo `cards` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
//   POST …/cards/:id/purchases → add_card_purchase (compra a cuotas y su gasto; features/cards/card-forms.tsx)
//   POST …/cards/:id/payments  → pay_credit_card (mínimo, total u otro valor)
// El CRUD de credit_cards (y editar o borrar compras y pagos) sale del contrato genérico book-tables.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiOk, IsoDate, Uuid } from "../common"
import { IdParams, Name, Note, Positive, WRITE_ERRORS } from "./write-common"

export const meta = { id: "cards", owner: "F2-D" } as const

export const CardPurchase = z.object({
  fecha: IsoDate,
  descripcion: Name("Escribe qué compraste"),
  valor: Positive,
  cuotas: z.number().int("Usa un número entero de cuotas").min(1, "Mínimo 1 cuota").max(48, "Máximo 48 cuotas").default(1),
  category_id: Uuid.nullable().optional(),
  /** Registrar también el gasto (por defecto sí: así cuenta en el presupuesto del mes). */
  comoGasto: z.boolean().default(true),
  member_id: Uuid.nullable().optional(),
  provider_id: Uuid.nullable().optional(),
  /** Id estable de un movimiento importado (`csv:…`, `gmail:…`): repetirlo no duplica la compra. */
  external_id: z.string().regex(/^(csv|gmail|import):[\w:.-]{1,200}$/, "Id externo inválido").optional(),
})
export const CardPayment = z.object({
  valor: Positive,
  fecha: IsoDate,
  tipo: z.enum(["minimo", "total", "otro"]).default("otro"),
  payment_method_id: Uuid.nullable().optional(),
  nota: Note.optional(),
})
export const CardOut = z.object({ purchase_id: z.string().optional(), expense_id: z.string().nullable().optional(), payment_id: z.string().optional() }).loose()

const c = initContract()
export const cardsContract = c.router(
  {
    purchase: {
      method: "POST", path: "/v1/books/:bookId/cards/:id/purchases", pathParams: IdParams, body: CardPurchase,
      responses: { ...WRITE_ERRORS, 200: ApiOk(CardOut) }, summary: "Registra una compra con tarjeta (y su gasto)",
    },
    payment: {
      method: "POST", path: "/v1/books/:bookId/cards/:id/payments", pathParams: IdParams, body: CardPayment,
      responses: { ...WRITE_ERRORS, 200: ApiOk(CardOut) }, summary: "Registra un pago a la tarjeta (el total deja pagadas las compras)",
    },
  },
  { strictStatusCodes: true },
)
