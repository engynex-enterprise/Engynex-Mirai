// Qué otras tablas cambia la base cuando se escribe en una (triggers de enlaces con `x-mirai-enlaces`, RPC que tocan
// varias tablas). La API las avisa con EventsService.changed para que el tiempo real y el outbox de automatizaciones
// refresquen todo lo que se movió (equivale al `also` de useSoftDelete y a los invalidateBook de cada formulario).
// Fuente: supabase/migrations/20261103003200_enlaces.sql, 20261103003100_cuentas_metas.sql, 20261031000500_fund.sql,
// 20261031000700_fixed_pay.sql y 20261031000800_fund_ops.sql.
import { isLiveTable, type LiveTable } from "@mirai/contracts/live"

export const CASCADES: Partial<Record<string, readonly LiveTable[]>> = {
  // Borrar o editar un gasto: compra con tarjeta, pago del fijo, cobro de suscripción, gasto de grupo y fondo.
  expenses: ["card_purchases", "fixed_expense_payments", "fixed_expenses", "subscriptions", "shared_group_expenses", "fund_movements", "emergency_funds", "goals"],
  card_purchases: ["expenses", "credit_cards"],
  card_payments: ["card_purchases", "credit_cards"],
  credit_cards: ["card_purchases", "card_payments", "expenses"],
  shared_group_expenses: ["expenses"],
  shared_groups: ["shared_group_expenses", "expenses"],
  goal_movements: ["goals"],
  fixed_expenses: ["fixed_expense_payments", "expenses"],
  fixed_expense_payments: ["expenses", "fixed_expenses"],
  fund_movements: ["emergency_funds", "expenses"],
  loan_payments: ["loans"],
}

/** La tabla escrita y las que arrastra (solo las que viajan en vivo, sin repetir). */
export function touched(table: string, extra: readonly string[] = []): LiveTable[] {
  return [...new Set([table, ...(CASCADES[table] ?? []), ...extra])].filter(isLiveTable)
}
