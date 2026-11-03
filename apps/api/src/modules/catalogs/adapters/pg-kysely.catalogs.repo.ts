// Adaptador para Cloud SQL (fase 4): la misma consulta con Kysely dentro de tx() (RLS por transacción).
import { Injectable } from "@nestjs/common"
import type { CategoryRow } from "@mirai/contracts/modules/catalogs"
import type { DbScope } from "../../../core/db/scope"
import { PgKyselyFactory } from "../../../core/db/pg-kysely.factory"
import { CatalogsRepo, type ListCategories } from "../catalogs.repository"

@Injectable()
export class PgKyselyCatalogsRepo extends CatalogsRepo {
  constructor(private readonly db: PgKyselyFactory) {
    super()
  }

  listCategories(scope: DbScope, { bookId, grupo }: ListCategories): Promise<CategoryRow[]> {
    return this.db.tx(scope, (trx) => {
      let q = trx.selectFrom("categories").selectAll().where("book_id", "=", bookId).where("deleted_at", "is", null)
      if (grupo) q = q.where("grupo", "=", grupo)
      return q.orderBy("sort", "asc").execute()
    })
  }
}
