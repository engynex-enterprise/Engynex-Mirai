// Compras y pagos con tarjeta por la API. Ver features/book/command.ts.
import { unwrapData } from "@/lib/api/unwrap"
import { command, type RpcArgs } from "@/features/book/command"

/** add_card_purchase → POST /cards/:id/purchases. */
export const addCardPurchase = (a: RpcArgs<"add_card_purchase">) =>
  command(async (c, bookId) =>
    unwrapData(await c.cards.purchase({
      params: { bookId, id: a.p_card },
      body: {
        fecha: a.p_fecha, descripcion: a.p_descripcion, valor: a.p_valor, cuotas: a.p_cuotas ?? 1, comoGasto: a.p_como_gasto ?? true,
        ...(a.p_category ? { category_id: a.p_category } : {}), ...(a.p_member ? { member_id: a.p_member } : {}),
        ...(a.p_provider ? { provider_id: a.p_provider } : {}), ...(a.p_external_id ? { external_id: a.p_external_id } : {}),
      },
    })))

/** pay_credit_card → POST /cards/:id/payments. Responde { payment_id } como la RPC. */
export const payCreditCard = (a: RpcArgs<"pay_credit_card">) =>
  command(async (c, bookId) =>
    unwrapData(await c.cards.payment({
      params: { bookId, id: a.p_card },
      body: { valor: a.p_valor, fecha: a.p_fecha!, tipo: (a.p_tipo ?? "otro") as "minimo" | "total" | "otro", ...(a.p_medio ? { payment_method_id: a.p_medio } : {}), ...(a.p_nota !== undefined ? { nota: a.p_nota } : {}) },
    })))
