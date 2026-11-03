// Fondo de emergencia y enlace con gastos fijos desde un gasto (v6 F2-H-4, interruptor `expenses`).
// Ver features/book/command.ts.
import { unwrapData } from "@/lib/api/unwrap"
import { API_PERIODO, command, type RpcArgs } from "@/features/book/command"

/** use_emergency_fund → POST /expenses/:id/use-fund. La RPC devuelve lo que queda en el fondo (número): igual. */
export const payWithEmergencyFund = (a: RpcArgs<"use_emergency_fund">) =>
  command("expenses", "use_emergency_fund", a, async (c, bookId) => unwrapData(await c.expenses.useFund({ params: { bookId, id: a.p_expense }, body: { valor: a.p_valor } })).saldo,
  a.p_valor > 0)

/** link_expense_fixed → POST /expenses/:id/link-fixed. */
export const linkExpenseFixed = (a: RpcArgs<"link_expense_fixed">) =>
  command("expenses", "link_expense_fixed", a, async (c, bookId) => unwrapData(await c.expenses.linkFixed({ params: { bookId, id: a.p_expense }, body: { fixedId: a.p_fixed, periodo: a.p_periodo } })),
  API_PERIODO.test(a.p_periodo))

/** unlink_expense_fixed → POST /expenses/:id/unlink-fixed. */
export const unlinkExpenseFixed = (a: RpcArgs<"unlink_expense_fixed">) =>
  command("expenses", "unlink_expense_fixed", a, async (c, bookId) => unwrapData(await c.expenses.unlinkFixed({ params: { bookId, id: a.p_expense } })))
