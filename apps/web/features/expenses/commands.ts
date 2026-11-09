// Fondo de emergencia y enlace con gastos fijos desde un gasto, por la API. Ver features/book/command.ts.
import { unwrapData } from "@/lib/api/unwrap"
import { command, type RpcArgs } from "@/features/book/command"

/** use_emergency_fund → POST /expenses/:id/use-fund. Devuelve lo que queda en el fondo (número). */
export const payWithEmergencyFund = (a: RpcArgs<"use_emergency_fund">) =>
  command(async (c, bookId) => unwrapData(await c.expenses.useFund({ params: { bookId, id: a.p_expense }, body: { valor: a.p_valor } })).saldo)

/**
 * link_expense_fixed → POST /expenses/:id/link-fixed. Si el periodo ya tiene abonos, este gasto se suma como uno más:
 * queda pagado solo si cubre lo que falta (`p_cierra`; sin decirlo lo calcula la API).
 */
export const linkExpenseFixed = (a: RpcArgs<"link_expense_fixed">) =>
  command(async (c, bookId) =>
    unwrapData(await c.expenses.linkFixed({ params: { bookId, id: a.p_expense }, body: { fixedId: a.p_fixed, periodo: a.p_periodo, ...(a.p_cierra !== undefined ? { completo: a.p_cierra } : {}) } })))

/** unlink_expense_fixed → POST /expenses/:id/unlink-fixed. */
export const unlinkExpenseFixed = (a: RpcArgs<"unlink_expense_fixed">) =>
  command(async (c, bookId) => unwrapData(await c.expenses.unlinkFixed({ params: { bookId, id: a.p_expense } })))
