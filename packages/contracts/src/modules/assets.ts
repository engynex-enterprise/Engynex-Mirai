// Módulo `assets` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
//   POST   …/assets/:id/reconcile   → asset_cuadrar (cuadrar el saldo de una cuenta; features/balance/asset-form.tsx)
//   DELETE …/assets/:id/reconcile   → la cuenta deja de llevar el saldo sola (saldo_base, saldo_fecha y saldo_at = null)
//   PUT    …/net-worth/:mes         → foto del patrimonio del mes (net_worth_snapshots, una por mes; patrimonio-card.tsx)
// El CRUD de assets, liabilities e investments sale del contrato genérico book-tables.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiOk, IsoMonth, Money, Uuid } from "../common"
import { IdParams, Row, WRITE_ERRORS } from "./write-common"

export const meta = { id: "assets", owner: "F2-D" } as const

export const Reconcile = z.object({ saldo: Money })
export const MonthParams = z.object({ bookId: Uuid, mes: IsoMonth })
export const Snapshot = z.object({ activos: Money.min(0, "Los activos no pueden ser negativos"), deudas: Money.min(0, "Las deudas no pueden ser negativas") })

const c = initContract()
export const assetsContract = c.router(
  {
    reconcile: {
      method: "POST", path: "/v1/books/:bookId/assets/:id/reconcile", pathParams: IdParams, body: Reconcile,
      responses: { ...WRITE_ERRORS, 200: ApiOk(Row) }, summary: "Cuadra el saldo de la cuenta con lo que dice el banco hoy",
    },
    unreconcile: {
      method: "DELETE", path: "/v1/books/:bookId/assets/:id/reconcile", pathParams: IdParams, body: c.noBody(),
      responses: { ...WRITE_ERRORS, 200: ApiOk(Row) }, summary: "La cuenta deja de calcular su saldo sola",
    },
    snapshot: {
      method: "PUT", path: "/v1/books/:bookId/net-worth/:mes", pathParams: MonthParams, body: Snapshot,
      responses: { ...WRITE_ERRORS, 200: ApiOk(Row) }, summary: "Guarda la foto del patrimonio del mes (activos − deudas). No acepta meses futuros",
    },
  },
  { strictStatusCodes: true },
)
