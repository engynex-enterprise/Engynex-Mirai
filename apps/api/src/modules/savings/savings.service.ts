// Ahorro (F2-D-6): abonos a metas (goal_contribute) y el fondo de emergencia (fund_save, fund_use y su ajuste), con
// los mismos argumentos que features/goals/goals-view.tsx y goal-dialogs.tsx. La base registra el movimiento (para
// deshacerlo desde la papelera) y mueve el saldo en la misma transacción.
import { Injectable } from "@nestjs/common"
import type { z } from "zod"
import type { Contribute, FundSave, FundSettings, FundUse } from "@mirai/contracts/modules/savings"
import { todayBogota } from "@mirai/domain/dates"
import { BookStore, type Rec } from "../book-tables/book-store"
import { BookWritesService } from "../book-tables/book-writes.service"
import { num } from "../book-tables/http"

export const GOAL_NOT_FOUND = "No encontramos esa meta."

@Injectable()
export class SavingsService {
  constructor(
    private readonly w: BookWritesService,
    private readonly store: BookStore,
  ) {}

  /** POST …/goals/:id/contribute */
  async contribute(goalId: string, b: z.output<typeof Contribute>) {
    this.w.requireRole("editor", "planear")
    await this.w.rowOf("goals", goalId, { alive: true, msg: GOAL_NOT_FOUND })
    await this.w.assertRefs("goal_movements", { payment_method_id: b.payment_method_id })
    const r = (await this.store.rpc(this.w.scope, "goal_contribute", { p_goal: goalId, p_valor: b.valor, p_fecha: b.fecha ?? todayBogota(), p_medio: b.payment_method_id ?? undefined, p_nota: b.nota })) as Rec | null
    this.w.changed("goals", goalId, "UPDATE", ["goal_movements"])
    return { ...(r ?? {}), id: String(r?.id ?? goalId), ahorrado: num(r?.ahorrado), objetivo: num(r?.objetivo) }
  }

  /** POST …/fund/save: devuelve el saldo nuevo del fondo. */
  async fundSave(b: z.output<typeof FundSave>) {
    this.w.requireRole("editor", "planear")
    const saldo = num(await this.store.rpc(this.w.scope, "fund_save", { p_book: this.w.bookId, p_valor: b.valor, p_fecha: b.fecha, p_nota: b.nota }))
    this.w.changed("emergency_funds", this.w.bookId, "UPDATE", ["fund_movements"])
    return { saldo }
  }

  /** POST …/fund/use: cuánto cubrió el fondo, cuánto salió del día a día y el saldo que queda. */
  async fundUse(b: z.output<typeof FundUse>) {
    this.w.requireRole("editor", "planear")
    await this.w.assertRefs("expenses", { payment_method_id: b.payment_method_id })
    const r = ((await this.store.rpc(this.w.scope, "fund_use", { p_book: this.w.bookId, p_desc: b.descripcion.trim(), p_valor: b.valor, p_fecha: b.fecha, p_medio: b.payment_method_id ?? undefined })) ?? {}) as Rec
    this.w.changed("emergency_funds", this.w.bookId, "UPDATE", ["fund_movements", "expenses"])
    return { ...r, cubre: num(r.cubre), resto: num(r.resto), saldo: num(r.saldo) }
  }

  /** PUT …/fund: prender o apagar el fondo y ligarlo a una cuenta (el saldo solo cambia con movimientos). */
  async fund(b: z.output<typeof FundSettings>) {
    this.w.requireRole("editor", "planear")
    await this.w.assertRefs("goals", { asset_id: b.asset_id })
    const row = await this.store.upsertSingle(this.w.scope, "emergency_funds", this.w.bookId, b as Rec)
    this.w.changed("emergency_funds", this.w.bookId, "UPDATE")
    return row
  }
}
