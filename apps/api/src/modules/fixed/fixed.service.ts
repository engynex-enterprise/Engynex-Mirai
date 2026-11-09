// Pagos de gastos fijos y cobros de suscripciones (F2-D-4) sobre las RPC transaccionales de la base, con los mismos
// argumentos que la web (pay-fixed-dialog.tsx, fixed-view.tsx y subscriptions-view.tsx). La base crea el gasto, el
// pago del periodo, ajusta el rango de los variables y suma el aporte a la meta o al fondo; deshacer revierte todo.
import { Injectable } from "@nestjs/common"
import type { z } from "zod"
import type { ChargeSub, PayFixed } from "@mirai/contracts/modules/fixed"
import { fijoValor } from "@mirai/domain/reparto"
import { pagoPeriodo } from "@mirai/domain/fixed"
import { DomainError } from "../../core/errors/domain-error"
import { BookStore, type Rec } from "../book-tables/book-store"
import { BookWritesService } from "../book-tables/book-writes.service"
import { num } from "../book-tables/http"

export const FIXED_NOT_FOUND = "No encontramos ese gasto fijo."
export const PAYMENT_NOT_FOUND = "No encontramos ese pago."
export const SUB_NOT_FOUND = "No encontramos esa suscripción."

/** Texto que la web agrega a la descripción del gasto de una quincena. */
export const sufijoQuincena = (per: string) => (per.endsWith("-Q1") ? " (1ª quincena)" : per.endsWith("-Q2") ? " (2ª quincena)" : "")

@Injectable()
export class FixedService {
  constructor(
    private readonly w: BookWritesService,
    private readonly store: BookStore,
  ) {}

  /** POST …/fixed/:id/pay (pay_fixed_expense). */
  async pay(fixedId: string, b: z.output<typeof PayFixed>) {
    this.w.requireRole("editor", "planear")
    const f = await this.w.rowOf("fixed_expenses", fixedId, { alive: true, msg: FIXED_NOT_FOUND })
    await this.w.assertRefs("fixed_expense_payments", { payment_method_id: b.payment_method_id })
    // Abonos: lo que ya se pagó del periodo y lo que falta (pagoPeriodo, la misma regla de la app).
    const fij = { frec: String(f.frec), valor: num(f.valor), reparto: f.reparto, variable: !!f.variable }
    const previos = (await this.store.rows(this.w.scope, "fixed_expense_payments", this.w.bookId, { eq: { fixed_expense_id: fixedId, periodo: b.periodo } }))
      .map((x) => ({ id: String(x.id), periodo: String(x.periodo), fecha: String(x.fecha), valor: num(x.valor), cierra: x.cierra as boolean | null }))
    const P = pagoPeriodo(fij, b.periodo, previos)
    if (P.completo) throw DomainError.conflict("Ese periodo ya está pagado.")
    const valor = b.valor ?? (P.pagos.length ? P.falta : fijoValor(fij, b.periodo))
    if (!(valor > 0)) throw DomainError.validation("Escribe el valor que pagaste.", { valor: "Escribe el valor que pagaste" })
    // Pagos de antes sin marcar que quedaron cortos: pasan a ser abonos (si no, la base no deja registrar el resto).
    for (const x of previos.filter((x) => x.cierra == null)) await this.store.update(this.w.scope, "fixed_expense_payments", this.w.bookId, x.id, { cierra: false })
    // ¿Queda pagado? Lo dice la persona; si no, sí cuando cubre lo que falta (o el fijo es variable y no hay abonos antes).
    const cierra = b.completo ?? (P.pagado + valor >= P.esperado - 1 || (fij.variable && !P.pagos.length))
    const r = (await this.store.rpc(this.w.scope, "pay_fixed_expense", {
      p_fixed: fixedId, p_periodo: b.periodo, p_fecha: b.fecha, p_valor: valor, p_medio: b.payment_method_id ?? undefined, p_desc_suffix: sufijoQuincena(b.periodo), p_cierra: cierra,
    })) as Rec | null
    this.w.changed("fixed_expenses", fixedId, "UPDATE", ["fixed_expense_payments", "expenses", "goals", "goal_movements", "emergency_funds", "fund_movements"])
    return { ...(r ?? {}), valor, periodo: b.periodo, completo: cierra, falta: cierra ? 0 : Math.max(0, P.esperado - P.pagado - valor) }
  }

  /** DELETE …/fixed/payments/:id (unpay_fixed_expense). */
  async unpay(paymentId: string) {
    this.w.requireRole("editor", "planear")
    const p = await this.w.rowOf("fixed_expense_payments", paymentId, { alive: true, msg: PAYMENT_NOT_FOUND })
    await this.store.rpc(this.w.scope, "unpay_fixed_expense", { p_payment: paymentId })
    this.w.changed("fixed_expense_payments", paymentId, "UPDATE", ["fixed_expenses", "expenses", "goals", "goal_movements", "emergency_funds", "fund_movements"])
    return { id: String(p.id) }
  }

  /**
   * POST …/subscriptions/:id/charge (pay_subscription, "Ya se cobró"). Con `parcial` es un abono: la base registra el
   * gasto, deja el cobro pendiente con lo que falta y no pasa al siguiente (si el abono completa el cobro, sí pasa).
   */
  async charge(subId: string, b: z.output<typeof ChargeSub>) {
    this.w.requireRole("editor", "planear")
    await this.w.rowOf("subscriptions", subId, { alive: true, msg: SUB_NOT_FOUND })
    await this.w.assertRefs("expenses", { payment_method_id: b.payment_method_id })
    const r = (await this.store.rpc(this.w.scope, "pay_subscription", {
      p_sub: subId, p_fecha: b.fecha, p_valor: b.valor, p_medio: b.payment_method_id ?? undefined, p_parcial: b.parcial ?? false,
    })) as Rec | null
    this.w.changed("subscriptions", subId, "UPDATE", ["expenses"])
    return r ?? {}
  }
}
