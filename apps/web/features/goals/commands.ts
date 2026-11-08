// Abonos a metas y fondo de emergencia por la API. Ver features/book/command.ts.
import { unwrapData } from "@/lib/api/unwrap"
import { command, type RpcArgs } from "@/features/book/command"
import { asResult } from "@/lib/api/book-rows"

/** goal_contribute → POST /goals/:id/contribute. Responde { id (del movimiento), ahorrado, objetivo } como la RPC. */
export const goalContribute = (a: RpcArgs<"goal_contribute">) =>
  command(async (c, bookId) =>
    unwrapData(await c.savings.contribute({
      params: { bookId, id: a.p_goal },
      body: { valor: a.p_valor, ...(a.p_fecha ? { fecha: a.p_fecha } : {}), ...(a.p_medio ? { payment_method_id: a.p_medio } : {}), ...(a.p_nota !== undefined ? { nota: a.p_nota } : {}) },
    })))

/** fund_save → POST /fund/save del libro `p_book`. Devuelve el saldo (número). */
export const fundSave = (a: RpcArgs<"fund_save">) =>
  command(async (c) =>
    unwrapData(await c.savings.fundSave({ params: { bookId: a.p_book }, body: { valor: a.p_valor, fecha: a.p_fecha, ...(a.p_nota !== undefined ? { nota: a.p_nota } : {}) } })).saldo)

/** fund_use → POST /fund/use del libro `p_book`. Responde { cubre, resto, saldo } como la RPC. */
export const fundUse = (a: RpcArgs<"fund_use">) =>
  command(async (c) =>
    unwrapData(await c.savings.fundUse({ params: { bookId: a.p_book }, body: { descripcion: a.p_desc, valor: a.p_valor, fecha: a.p_fecha, ...(a.p_medio ? { payment_method_id: a.p_medio } : {}) } })))

/** Prender el fondo o cambiar su cuenta (emergency_funds del libro) → PUT /fund. Devuelve `{ error }`. */
export async function updateFund(bookId: string, patch: { activo?: boolean; asset_id?: string | null }): Promise<{ error: { message: string } | null }> {
  const { browserApi } = await import("@/lib/api/client")
  const { error } = await asResult(async () => unwrapData(await browserApi().savings.fund({ params: { bookId }, body: patch })))
  return { error }
}
