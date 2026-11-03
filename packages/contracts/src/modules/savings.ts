// Módulo `savings` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
//   POST …/goals/:id/contribute  → goal_contribute (abono a una meta; features/goals/goals-view.tsx)
//   POST …/fund/save             → fund_save (guardar en el fondo de emergencia; features/goals/goal-dialogs.tsx)
//   POST …/fund/use              → fund_use (un imprevisto pagado con el fondo: gasto + movimiento)
//   PUT  …/fund                  → prender o apagar el fondo y su cuenta (emergency_funds; el saldo solo con movimientos)
// El CRUD de metas, retos, deseos, mesadas y gastos compartidos sale del contrato genérico book-tables.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiOk, IsoDate, Uuid } from "../common"
import { BookParams, IdParams, Name, Note, Positive, Row, WRITE_ERRORS } from "./write-common"

export const meta = { id: "savings", owner: "F2-D" } as const

export const Contribute = z.object({ valor: Positive, fecha: IsoDate.optional(), payment_method_id: Uuid.nullable().optional(), nota: Note.optional() })
export const Contributed = z.object({ id: z.string(), ahorrado: z.number(), objetivo: z.number() }).loose()
export const FundSave = z.object({ valor: Positive, fecha: IsoDate, nota: Note.optional() })
export const FundUse = z.object({ descripcion: Name("Escribe en qué lo usaste"), valor: Positive, fecha: IsoDate, payment_method_id: Uuid.nullable().optional() })
export const FundUsed = z.object({ cubre: z.number(), resto: z.number(), saldo: z.number() }).loose()
export const FundSettings = z.object({ activo: z.boolean().optional(), asset_id: Uuid.nullable().optional() }).refine((v) => Object.keys(v).length > 0, "No enviaste ningún cambio.")

const c = initContract()
export const savingsContract = c.router(
  {
    contribute: {
      method: "POST", path: "/v1/books/:bookId/goals/:id/contribute", pathParams: IdParams, body: Contribute,
      responses: { ...WRITE_ERRORS, 200: ApiOk(Contributed) }, summary: "Abona a una meta (queda el movimiento para deshacerlo)",
    },
    fundSave: {
      method: "POST", path: "/v1/books/:bookId/fund/save", pathParams: BookParams, body: FundSave,
      responses: { ...WRITE_ERRORS, 200: ApiOk(z.object({ saldo: z.number() })) }, summary: "Guarda plata en el fondo de emergencia",
    },
    fundUse: {
      method: "POST", path: "/v1/books/:bookId/fund/use", pathParams: BookParams, body: FundUse,
      responses: { ...WRITE_ERRORS, 200: ApiOk(FundUsed) }, summary: "Paga un imprevisto con el fondo (lo que no alcance sale del día a día)",
    },
    fund: {
      method: "PUT", path: "/v1/books/:bookId/fund", pathParams: BookParams, body: FundSettings,
      responses: { ...WRITE_ERRORS, 200: ApiOk(Row) }, summary: "Prende o apaga el fondo de emergencia y su cuenta",
    },
  },
  { strictStatusCodes: true },
)
