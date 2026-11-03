// Módulo `budget` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
//   PATCH …/categories/:id/tope → tope mensual de una categoría (features/planning/budget-view.tsx)
//   PUT   …/budget/topes        → varios topes a la vez (p. ej. aplicar el 50/30/20 sugerido)
// La vista 50/30/20 calculada la da insights (F2-C); el presupuesto se sigue calculando en el cliente (D3).
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiOk, Money, Uuid } from "../common"
import { BookParams, IdParams, Row, WRITE_ERRORS } from "./write-common"

export const meta = { id: "budget", owner: "F2-D" } as const

export const Tope = z.object({ tope: Money.min(0, "El tope no puede ser negativo") })
export const Topes = z.object({ topes: z.array(z.object({ category_id: Uuid, tope: Money.min(0, "El tope no puede ser negativo") })).min(1).max(200) })

const c = initContract()
export const budgetContract = c.router(
  {
    tope: {
      method: "PATCH", path: "/v1/books/:bookId/categories/:id/tope", pathParams: IdParams, body: Tope,
      responses: { ...WRITE_ERRORS, 200: ApiOk(Row) }, summary: "Cambia el tope mensual de una categoría (0 = sin tope)",
    },
    topes: {
      method: "PUT", path: "/v1/books/:bookId/budget/topes", pathParams: BookParams, body: Topes,
      responses: { ...WRITE_ERRORS, 200: ApiOk(z.array(Row)) }, summary: "Cambia varios topes a la vez",
    },
  },
  { strictStatusCodes: true },
)
