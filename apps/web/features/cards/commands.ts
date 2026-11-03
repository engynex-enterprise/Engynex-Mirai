// Compras y pagos con tarjeta (v6 F2-H-4, interruptor `cards`). Ver features/book/command.ts.
import { unwrapData } from "@/lib/api/unwrap"
import { command, type RpcArgs } from "@/features/book/command"

const EXTERNAL_ID = /^(csv|gmail|import):[\w:.-]{1,200}$/

/** add_card_purchase → POST /cards/:id/purchases. Con medio de pago, más de 48 cuotas o un id externo raro: RPC. */
export const addCardPurchase = (a: RpcArgs<"add_card_purchase">) => {
  const cuotas = a.p_cuotas ?? 1
  const parity = !a.p_medio && Number.isInteger(cuotas) && cuotas >= 1 && cuotas <= 48 && (a.p_external_id === undefined || EXTERNAL_ID.test(a.p_external_id))
    && !!a.p_descripcion.trim() && a.p_descripcion.trim().length <= 200 && a.p_valor > 0
  return command("cards", "add_card_purchase", a, async (c, bookId) =>
    unwrapData(await c.cards.purchase({
      params: { bookId, id: a.p_card },
      body: {
        fecha: a.p_fecha, descripcion: a.p_descripcion, valor: a.p_valor, cuotas, comoGasto: a.p_como_gasto ?? true,
        ...(a.p_category ? { category_id: a.p_category } : {}), ...(a.p_member ? { member_id: a.p_member } : {}),
        ...(a.p_provider ? { provider_id: a.p_provider } : {}), ...(a.p_external_id ? { external_id: a.p_external_id } : {}),
      },
    })),
  parity)
}

const TIPOS = new Set(["minimo", "total", "otro"])

/** pay_credit_card → POST /cards/:id/payments. Responde { payment_id } como la RPC. */
export const payCreditCard = (a: RpcArgs<"pay_credit_card">) =>
  command("cards", "pay_credit_card", a, async (c, bookId) =>
    unwrapData(await c.cards.payment({
      params: { bookId, id: a.p_card },
      body: { valor: a.p_valor, fecha: a.p_fecha!, tipo: (a.p_tipo ?? "otro") as "minimo" | "total" | "otro", ...(a.p_medio ? { payment_method_id: a.p_medio } : {}), ...(a.p_nota !== undefined ? { nota: a.p_nota } : {}) },
    })),
  !!a.p_fecha && TIPOS.has(a.p_tipo ?? "otro") && a.p_valor > 0 && (a.p_nota ?? "").trim().length <= 4000)
