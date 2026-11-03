// Presupuesto (F2-D-8): el tope mensual de cada categoría (categories.tope, como features/planning/budget-view.tsx).
import { Injectable } from "@nestjs/common"
import { DomainError } from "../../core/errors/domain-error"
import { aliveIds, BookStore } from "../book-tables/book-store"
import { BookWritesService } from "../book-tables/book-writes.service"

export const CATEGORY_NOT_FOUND = "No encontramos esa categoría."

@Injectable()
export class BudgetService {
  constructor(
    private readonly w: BookWritesService,
    private readonly store: BookStore,
  ) {}

  /** PATCH …/categories/:id/tope */
  async tope(categoryId: string, tope: number) {
    this.w.requireRole("editor", "planear")
    await this.w.rowOf("categories", categoryId, { alive: true, msg: CATEGORY_NOT_FOUND })
    const row = await this.store.update(this.w.scope, "categories", this.w.bookId, categoryId, { tope })
    if (!row) throw DomainError.notFound(CATEGORY_NOT_FOUND)
    this.w.changed("categories", categoryId)
    return row
  }

  /** PUT …/budget/topes: varios a la vez (todas las categorías deben ser de este libro). */
  async topes(list: { category_id: string; tope: number }[]) {
    this.w.requireRole("editor", "planear")
    const ok = await aliveIds(this.store, this.w.scope, "categories", this.w.bookId, list.map((x) => x.category_id))
    const bad = list.find((x) => !ok.has(x.category_id))
    if (bad) throw DomainError.notFound(CATEGORY_NOT_FOUND, { category_id: bad.category_id })
    const last = new Map(list.map((x) => [x.category_id, x.tope]))
    const rows = []
    for (const [id, tope] of last) {
      const r = await this.store.update(this.w.scope, "categories", this.w.bookId, id, { tope })
      if (r) rows.push(r)
    }
    this.w.changed("categories", undefined)
    return rows
  }
}
