// Patrimonio (F2-D-6): cuadrar el saldo de una cuenta (asset_cuadrar, como features/balance/asset-form.tsx) y la foto
// del patrimonio del mes (net_worth_snapshots, una por mes: como patrimonio-card.tsx, que la guarda al abrir Balance).
import { randomUUID } from "node:crypto"
import { Injectable } from "@nestjs/common"
import type { z } from "zod"
import type { Snapshot } from "@mirai/contracts/modules/assets"
import { todayBogota } from "@mirai/domain/dates"
import { DomainError } from "../../core/errors/domain-error"
import { BookStore, type Rec } from "../book-tables/book-store"
import { BookWritesService } from "../book-tables/book-writes.service"

export const ASSET_NOT_FOUND = "No encontramos esa cuenta."
export const FUTURE_MONTH = "Solo se guarda la foto de este mes o de meses pasados."

@Injectable()
export class AssetsService {
  constructor(
    private readonly w: BookWritesService,
    private readonly store: BookStore,
  ) {}

  /** POST …/assets/:id/reconcile */
  async reconcile(assetId: string, saldo: number) {
    this.w.requireRole("editor", "planear")
    await this.w.rowOf("assets", assetId, { alive: true, msg: ASSET_NOT_FOUND })
    const r = (await this.store.rpc(this.w.scope, "asset_cuadrar", { p_asset: assetId, p_saldo: saldo })) as Rec | Rec[] | null
    this.w.changed("assets", assetId, "UPDATE")
    return (Array.isArray(r) ? r[0] : r) ?? {}
  }

  /** DELETE …/assets/:id/reconcile: la cuenta deja de calcular su saldo sola. */
  async unreconcile(assetId: string) {
    this.w.requireRole("editor", "planear")
    await this.w.rowOf("assets", assetId, { alive: true, msg: ASSET_NOT_FOUND })
    const row = await this.store.update(this.w.scope, "assets", this.w.bookId, assetId, { saldo_base: null, saldo_fecha: null, saldo_at: null })
    if (!row) throw DomainError.notFound(ASSET_NOT_FOUND)
    this.w.changed("assets", assetId, "UPDATE")
    return row
  }

  /** PUT …/net-worth/:mes (upsert por libro y mes). */
  async snapshot(mes: string, b: z.output<typeof Snapshot>) {
    this.w.requireRole("editor", "planear")
    if (mes > todayBogota().slice(0, 7)) throw DomainError.validation(FUTURE_MONTH, { mes: FUTURE_MONTH })
    const data = { activos: b.activos, deudas: b.deudas, patrimonio: b.activos - b.deudas }
    const [prev] = await this.store.rows(this.w.scope, "net_worth_snapshots", this.w.bookId, { eq: { mes }, alive: false, limit: 1 })
    const row = prev
      ? await this.store.update(this.w.scope, "net_worth_snapshots", this.w.bookId, String(prev.id), { ...data, deleted_at: null })
      : (await this.store.insert(this.w.scope, "net_worth_snapshots", [{ id: randomUUID(), book_id: this.w.bookId, mes, ...data }]))[0]
    if (!row) throw DomainError.role()
    this.w.changed("net_worth_snapshots", String(row.id), prev ? "UPDATE" : "INSERT")
    return row
  }
}
