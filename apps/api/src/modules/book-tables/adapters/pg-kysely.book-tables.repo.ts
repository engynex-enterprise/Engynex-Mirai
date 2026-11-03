// Adaptador para Cloud SQL (fase 4): las mismas consultas con Kysely dentro de tx() (RLS por transacción). Las tablas y
// columnas vienen ya validadas contra BOOK_TABLE_COLUMNS / BOOK_PARTS y van como identificadores citados (sql.ref /
// sql.table), nunca como texto. Los hijos embebidos de PostgREST (`*, loan_payments(*)`) se cargan con una segunda
// consulta por la llave foránea y se anidan igual.
//
// Ojo (fase 4): `pg` devuelve `numeric` como texto y `date` como Date; los cálculos ya convierten los números, pero
// las fechas deben llegar como 'YYYY-MM-DD' (configurar los parsers de tipos en PgKyselyFactory antes de usar DB_ADAPTER=pg).
import { Injectable } from "@nestjs/common"
import { sql } from "kysely"
import type { BookRow } from "@mirai/contracts/modules/book-tables"
import { SINGLE_ROW_PARTS, type BookPart, type PartRows } from "@mirai/domain/book-data"
import type { DbScope } from "../../../core/db/scope"
import { PgKyselyFactory, type Trx } from "../../../core/db/pg-kysely.factory"
import { BookTablesRepo, type ListRows } from "../book-tables.repository"

/** Hijos que PostgREST embebe en cada parte (BOOK_PARTS[part].select): tabla hija y su llave al padre. */
export const EMBEDS: Partial<Record<BookPart, readonly (readonly [string, string])[]>> = {
  fixed_expenses: [["fixed_expense_payments", "fixed_expense_id"]],
  loans: [["loan_payments", "loan_id"]],
  credit_cards: [["card_purchases", "card_id"], ["card_payments", "card_id"]],
}

type Rec = Record<string, unknown>

@Injectable()
export class PgKyselyBookTablesRepo extends BookTablesRepo {
  constructor(private readonly db: PgKyselyFactory) {
    super()
  }

  list(scope: DbScope, q: ListRows): Promise<BookRow[]> {
    return this.db.tx(scope, async (trx) => {
      const cols = q.select === "*" ? sql`*` : sql.join(q.select.map((c) => sql.ref(c)))
      const where = [sql`book_id = ${q.bookId}`, sql`deleted_at is null`, ...q.eq.map(([k, v]) => (v === null ? sql`${sql.ref(k)} is null` : sql`${sql.ref(k)} = ${v}`))]
      const order = q.order ? sql` order by ${sql.ref(q.order.column)} ${q.order.ascending ? sql`asc` : sql`desc`}` : sql``
      const r = await sql<Rec>`select ${cols} from ${sql.table(q.table)} where ${sql.join(where, sql` and `)}${order}`.execute(trx)
      return r.rows
    })
  }

  part(scope: DbScope, bookId: string, part: BookPart): Promise<PartRows> {
    return this.db.tx(scope, async (trx) => {
      const alive = SINGLE_ROW_PARTS.includes(part) ? sql`` : sql` and deleted_at is null`
      const { rows } = await sql<Rec>`select * from ${sql.table(part)} where book_id = ${bookId}${alive}`.execute(trx)
      for (const [child, fk] of EMBEDS[part] ?? []) await embed(trx, rows, child, fk)
      return rows
    })
  }
}

/** Anida en cada padre sus hijos (todos, como PostgREST: assembleBook descarta los borrados). */
async function embed(trx: Trx, parents: Rec[], child: string, fk: string) {
  const ids = parents.map((p) => p.id as string)
  const kids = ids.length ? (await sql<Rec>`select * from ${sql.table(child)} where ${sql.ref(fk)} in (${sql.join(ids)})`.execute(trx)).rows : []
  const by = new Map<string, Rec[]>()
  for (const k of kids) by.set(k[fk] as string, [...(by.get(k[fk] as string) ?? []), k])
  for (const p of parents) p[child] = by.get(p.id as string) ?? []
}
