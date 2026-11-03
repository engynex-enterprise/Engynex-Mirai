// Adaptador para Cloud SQL (fase 4): las mismas consultas con Kysely dentro de tx() (RLS por transacción).
import { Injectable } from "@nestjs/common"
import type { ExtrasRows } from "@mirai/domain/integral-extras"
import { refPorAnio } from "@mirai/domain/payroll"
import type { SnapshotIn } from "@mirai/domain/vistas"
import type { DbScope } from "../../../core/db/scope"
import { PgKyselyFactory } from "../../../core/db/pg-kysely.factory"
import { InsightsRepo, type BookRef, type RentaCalcRows } from "../insights.repository"

@Injectable()
export class PgKyselyInsightsRepo extends InsightsRepo {
  constructor(private readonly db: PgKyselyFactory) {
    super()
  }

  extras(scope: DbScope, { bookId, householdId }: BookRef): Promise<Omit<ExtrasRows, "renta">> {
    return this.db.tx(scope, async (trx) => {
      const [fondo, taxAssets, incCats, allowances, movs, members] = await Promise.all([
        trx.selectFrom("fund_movements").select(["fecha", "valor", "tipo", "expense_id"]).where("book_id", "=", bookId).where("deleted_at", "is", null).execute(),
        trx.selectFrom("tax_assets").select(["tipo", "avaluo", "predial", "imp_veh", "soat", "pct"]).where("book_id", "=", bookId).where("deleted_at", "is", null).execute(),
        trx.selectFrom("income_categories").select(["id", "nombre"]).where("book_id", "=", bookId).where("deleted_at", "is", null).execute(),
        trx.selectFrom("allowances").select(["id", "member_id", "mesada", "frec"]).where("book_id", "=", bookId).where("deleted_at", "is", null).execute(),
        trx.selectFrom("allowance_movements").select(["allowance_id", "fecha", "valor"]).where("book_id", "=", bookId).where("deleted_at", "is", null).execute(),
        trx.selectFrom("family_members").select(["id", "nombre"]).where("household_id", "=", householdId).where("deleted_at", "is", null).execute(),
      ])
      return { fondo, taxAssets, incCats, allowances, movs, members }
    })
  }

  renta(scope: DbScope, { bookId, householdId }: BookRef): Promise<RentaCalcRows> {
    return this.db.tx(scope, async (trx) => {
      const [members, incomeCategories, bienes, years, u, s] = await Promise.all([
        trx.selectFrom("family_members").selectAll().where("household_id", "=", householdId).where("deleted_at", "is", null).orderBy("sort").orderBy("created_at").execute(),
        trx.selectFrom("income_categories").select(["id", "nombre"]).where("book_id", "=", bookId).execute(),
        trx.selectFrom("tax_assets").selectAll().where("book_id", "=", bookId).where("deleted_at", "is", null).orderBy("created_at").execute(),
        trx.selectFrom("tax_years").selectAll().where("book_id", "=", bookId).where("deleted_at", "is", null).execute(),
        trx.selectFrom("ref_uvt").select(["year", "valor"]).execute(),
        trx.selectFrom("ref_smmlv").select(["year", "valor"]).execute(),
      ])
      return { members, incomeCategories, bienes, years, ref: { uvt: refPorAnio(u), smmlv: refPorAnio(s) } }
    })
  }

  snapshots(scope: DbScope, bookId: string): Promise<SnapshotIn[]> {
    return this.db.tx(scope, (trx) => trx.selectFrom("net_worth_snapshots").select(["mes", "patrimonio"]).where("book_id", "=", bookId).where("deleted_at", "is", null).execute())
  }
}
