// Pagos de gastos fijos y cobros de suscripciones (v6 F2-H-4, interruptor `fixed`). Ver features/book/command.ts.
import { unwrapData } from "@/lib/api/unwrap"
import { API_PERIODO, command, type RpcArgs } from "@/features/book/command"

/** Sufijo que la API agrega sola a la descripción del gasto (igual que la web: " (1ª quincena)"). */
const sufijo = (per: string) => (per.endsWith("-Q1") ? " (1ª quincena)" : per.endsWith("-Q2") ? " (2ª quincena)" : "")

/** Pago de antes del alta ("¿Ya lo pagaste este mes?" del formulario): `prev-AAAA-MM`. La API lo acepta (PayPeriodo). */
const PREV_PERIODO = /^prev-\d{4}-(0[1-9]|1[0-2])(-Q[12])?$/

/** pay_fixed_expense → POST /fixed/:id/pay. Periodos o sufijos que la API no arma igual siguen por la RPC. */
export const payFixedExpense = (a: RpcArgs<"pay_fixed_expense">) =>
  command("fixed", "pay_fixed_expense", a, async (c, bookId) =>
    unwrapData(await c.fixed.pay({ params: { bookId, id: a.p_fixed }, body: { periodo: a.p_periodo, fecha: a.p_fecha, valor: a.p_valor, ...(a.p_medio ? { payment_method_id: a.p_medio } : {}) } })),
  (API_PERIODO.test(a.p_periodo) || PREV_PERIODO.test(a.p_periodo)) && (a.p_desc_suffix ?? "") === sufijo(a.p_periodo) && a.p_valor > 0)

/** unpay_fixed_expense → DELETE /fixed/payments/:id. */
export const unpayFixedExpense = (a: RpcArgs<"unpay_fixed_expense">) =>
  command("fixed", "unpay_fixed_expense", a, async (c, bookId) => unwrapData(await c.fixed.unpay({ params: { bookId, id: a.p_payment } })))

/** pay_subscription ("Ya se cobró") → POST /subscriptions/:id/charge. Responde { expense_id, proximo } como la RPC. */
export const paySubscription = (a: RpcArgs<"pay_subscription">) =>
  command("fixed", "pay_subscription", a, async (c, bookId) =>
    unwrapData(await c.fixed.charge({ params: { bookId, id: a.p_sub }, body: { fecha: a.p_fecha, valor: a.p_valor, ...(a.p_medio ? { payment_method_id: a.p_medio } : {}) } })),
  a.p_valor === undefined || a.p_valor > 0)
