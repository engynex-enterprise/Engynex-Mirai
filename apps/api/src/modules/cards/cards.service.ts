// Compras y pagos con tarjeta de crédito (F2-D-5) sobre add_card_purchase y pay_credit_card, con los mismos
// argumentos que features/cards/card-forms.tsx (y correo/importar con `external_id`). La base crea la compra y su
// gasto, y el pago "total" deja pagadas las compras (se revierte al borrar el pago).
import { Injectable } from "@nestjs/common"
import type { z } from "zod"
import type { CardPayment, CardPurchase } from "@mirai/contracts/modules/cards"
import { BookStore, type Rec } from "../book-tables/book-store"
import { BookWritesService } from "../book-tables/book-writes.service"

export const CARD_NOT_FOUND = "No encontramos esa tarjeta."

@Injectable()
export class CardsService {
  constructor(
    private readonly w: BookWritesService,
    private readonly store: BookStore,
  ) {}

  /** POST …/cards/:id/purchases (add_card_purchase). */
  async purchase(cardId: string, b: z.output<typeof CardPurchase>) {
    this.w.requireRole("editor", "editarTodo")
    await this.w.rowOf("credit_cards", cardId, { alive: true, msg: CARD_NOT_FOUND })
    await this.w.assertRefs("card_purchases", { category_id: b.category_id, provider_id: b.provider_id })
    const r = (await this.store.rpc(this.w.scope, "add_card_purchase", {
      p_card: cardId, p_fecha: b.fecha, p_descripcion: b.descripcion.trim(), p_valor: b.valor, p_cuotas: b.cuotas,
      p_category: b.category_id ?? undefined, p_como_gasto: b.comoGasto, p_external_id: b.external_id, p_member: b.member_id ?? undefined, p_provider: b.provider_id ?? undefined,
    })) as Rec | null
    this.w.changed("card_purchases", (r?.purchase_id as string | undefined) ?? cardId, "INSERT", ["expenses"])
    return r ?? {}
  }

  /** POST …/cards/:id/payments (pay_credit_card). */
  async payment(cardId: string, b: z.output<typeof CardPayment>) {
    this.w.requireRole("editor", "editarTodo")
    await this.w.rowOf("credit_cards", cardId, { alive: true, msg: CARD_NOT_FOUND })
    await this.w.assertRefs("card_payments", { payment_method_id: b.payment_method_id })
    const r = (await this.store.rpc(this.w.scope, "pay_credit_card", { p_card: cardId, p_valor: b.valor, p_fecha: b.fecha, p_tipo: b.tipo, p_medio: b.payment_method_id ?? undefined, p_nota: b.nota })) as Rec | null
    this.w.changed("card_payments", (r?.payment_id as string | undefined) ?? cardId, "INSERT")
    return r ?? {}
  }
}
