// Pagos de gastos fijos y cobros de suscripciones por la API. Ver features/book/command.ts.
import { unwrapData } from "@/lib/api/unwrap"
import { command, type RpcArgs } from "@/features/book/command"

/** pay_fixed_expense → POST /fixed/:id/pay (también el pago de antes del alta, `prev-AAAA-MM`). La API agrega sola el sufijo de la quincena. */
export const payFixedExpense = (a: RpcArgs<"pay_fixed_expense">) =>
  command(async (c, bookId) =>
    unwrapData(await c.fixed.pay({ params: { bookId, id: a.p_fixed }, body: { periodo: a.p_periodo, fecha: a.p_fecha, valor: a.p_valor, ...(a.p_medio ? { payment_method_id: a.p_medio } : {}), ...(a.p_cierra !== undefined ? { completo: a.p_cierra } : {}) } })))

/** unpay_fixed_expense → DELETE /fixed/payments/:id. */
export const unpayFixedExpense = (a: RpcArgs<"unpay_fixed_expense">) =>
  command(async (c, bookId) => unwrapData(await c.fixed.unpay({ params: { bookId, id: a.p_payment } })))

/**
 * pay_subscription ("Ya se cobró") → POST /subscriptions/:id/charge. Responde { expense_id, proximo, parcial, falta }
 * como la RPC. Con `p_parcial` es un abono: el cobro sigue pendiente con lo que falta y no pasa al siguiente.
 */
export const paySubscription = (a: RpcArgs<"pay_subscription">) =>
  command(async (c, bookId) =>
    unwrapData(await c.fixed.charge({ params: { bookId, id: a.p_sub }, body: { fecha: a.p_fecha, valor: a.p_valor, ...(a.p_medio ? { payment_method_id: a.p_medio } : {}), ...(a.p_parcial ? { parcial: true } : {}) } })))
