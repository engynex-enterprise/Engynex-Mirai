// Adaptador para Cloud SQL (fase 4): las mismas consultas con Kysely dentro de tx().
import { Injectable } from "@nestjs/common"
import type { NotificationRow } from "@mirai/contracts/modules/notifications-bell"
import type { DbScope } from "../../../../core/db/scope"
import { PgKyselyFactory } from "../../../../core/db/pg-kysely.factory"
import { BellRepo, type BellList } from "../bell.repository"

@Injectable()
export class PgKyselyBellRepo extends BellRepo {
  constructor(private readonly db: PgKyselyFactory) {
    super()
  }

  list(scope: DbScope, q: BellList): Promise<NotificationRow[]> {
    return this.db.tx(scope, (trx) => {
      let b = trx.selectFrom("notifications").selectAll().where("user_id", "=", q.userId)
      if (q.bookId) b = b.where((w) => w.or([w("book_id", "=", q.bookId!), w("book_id", "is", null)]))
      if (q.sinLeer) b = b.where("read_at", "is", null)
      return b.orderBy("created_at", "desc").limit(q.limit).execute()
    })
  }

  markRead(scope: DbScope, q: { userId: string; id: string; at: string }) {
    return this.db.tx(scope, async (trx) => {
      const r = await trx.updateTable("notifications").set({ read_at: q.at }).where("id", "=", q.id).where("user_id", "=", q.userId).returning(["id", "read_at"]).executeTakeFirst()
      return r ? { id: r.id, read_at: r.read_at ?? q.at } : null
    })
  }

  markAll(scope: DbScope, q: { userId: string; at: string }) {
    return this.db.tx(scope, async (trx) => {
      const r = await trx.updateTable("notifications").set({ read_at: q.at }).where("user_id", "=", q.userId).where("read_at", "is", null).executeTakeFirst()
      return Number(r.numUpdatedRows)
    })
  }
}
