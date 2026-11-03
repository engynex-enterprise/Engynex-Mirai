// Abonos a metas y fondo de emergencia (v6 F2-H-4, interruptor `savings`). Ver features/book/command.ts.
import { unwrapData } from "@/lib/api/unwrap"
import { command, type RpcArgs } from "@/features/book/command"
import { apiSession } from "@/lib/api/session"

/** goal_contribute → POST /goals/:id/contribute. Responde { id (del movimiento), ahorrado, objetivo } como la RPC. */
export const goalContribute = (a: RpcArgs<"goal_contribute">) =>
  command("savings", "goal_contribute", a, async (c, bookId) =>
    unwrapData(await c.savings.contribute({
      params: { bookId, id: a.p_goal },
      body: { valor: a.p_valor, ...(a.p_fecha ? { fecha: a.p_fecha } : {}), ...(a.p_medio ? { payment_method_id: a.p_medio } : {}), ...(a.p_nota !== undefined ? { nota: a.p_nota } : {}) },
    })),
  a.p_valor > 0)

/** fund_save → POST /fund/save. La RPC devuelve el saldo (número): se devuelve igual. */
export const fundSave = (a: RpcArgs<"fund_save">) =>
  command("savings", "fund_save", a, async (c, bookId) =>
    unwrapData(await c.savings.fundSave({ params: { bookId }, body: { valor: a.p_valor, fecha: a.p_fecha, ...(a.p_nota !== undefined ? { nota: a.p_nota } : {}) } })).saldo,
  a.p_valor > 0 && sameBook(a.p_book))

/** fund_use → POST /fund/use. Responde { cubre, resto, saldo } como la RPC. */
export const fundUse = (a: RpcArgs<"fund_use">) =>
  command("savings", "fund_use", a, async (c, bookId) =>
    unwrapData(await c.savings.fundUse({ params: { bookId }, body: { descripcion: a.p_desc, valor: a.p_valor, fecha: a.p_fecha, ...(a.p_medio ? { payment_method_id: a.p_medio } : {}) } })),
  a.p_valor > 0 && !!a.p_desc.trim() && a.p_desc.trim().length <= 200 && sameBook(a.p_book))

/** El comando usa el libro activo de la sesión; si la RPC apunta a otro libro, se queda con la RPC. */
const sameBook = (bookId: string) => apiSession()?.bookId === bookId
