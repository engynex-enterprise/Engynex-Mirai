// Adaptador para Cloud SQL (fase 4) del puerto de escritura: el mismo SQL dentro de tx() (RLS por transacción con
// `request.headers = {"x-mirai-enlaces":"1"}`, así las cascadas de la base corren igual). Tablas y columnas ya vienen
// validadas por el servicio y van como identificadores citados (sql.table / sql.ref); los nombres de argumentos de las
// RPC se revisan con una expresión regular antes de usarse.
//
// jsonb: `pg` convierte un arreglo JS en arreglo de Postgres, así que los objetos y los arreglos de columnas jsonb se
// envían como texto JSON (JSON_COLUMNS).
import { Injectable } from "@nestjs/common"
import { sql, type RawBuilder } from "kysely"
import type { BookRow } from "@mirai/contracts/modules/book-tables"
import type { DbScope } from "../../../core/db/scope"
import { PgKyselyFactory } from "../../../core/db/pg-kysely.factory"
import { BookStore, storeError, type Rec, type RowsQuery, type RpcArgs, type RpcName, type SingleTable } from "../book-store"

/** Columnas jsonb de las tablas que escribe la API (tabla.columna). */
export const JSON_COLUMNS = new Set([
  "contacts.direccion", "incomes.deducciones", "incomes.reparto", "fixed_expenses.reparto", "loans.prenda", "savings_challenges.marcas",
  "tax_years.ded", "tax_years.docs", "tax_years.ing", "advisor_consultations.payload", "automations.grafo", "expenses.aporte",
  "book_settings.defaults", "book_settings.ia", "book_settings.nomina", "book_settings.notif", "book_settings.pct", "book_settings.setup",
  "book_settings.smmlv", "book_settings.trm", "book_settings.uvt", "book_settings.apps",
])

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/
const ident = (s: string) => {
  if (!IDENT.test(s)) throw new Error(`Identificador inválido: ${s}`)
  return s
}

/** Valor listo para pg (jsonb como texto). Exportado para las pruebas. */
export function pgValue(table: string, col: string, v: unknown): unknown {
  if (v === undefined) return null
  if (JSON_COLUMNS.has(`${table}.${col}`)) return v === null ? null : JSON.stringify(v)
  if (v !== null && typeof v === "object" && !Array.isArray(v)) return JSON.stringify(v)
  return v
}

@Injectable()
export class PgKyselyBookStore extends BookStore {
  constructor(private readonly db: PgKyselyFactory) {
    super()
  }

  private run<T>(scope: DbScope, fn: Parameters<PgKyselyFactory["tx"]>[1]): Promise<T> {
    return this.db.tx(scope, fn).catch((e) => {
      throw storeError((e as { cause?: unknown })?.cause ?? e)
    }) as Promise<T>
  }

  find(scope: DbScope, table: string, id: string): Promise<BookRow | null> {
    return this.run(scope, async (trx) => (await sql<Rec>`select * from ${sql.table(ident(table))} where id = ${id} limit 1`.execute(trx)).rows[0] ?? null)
  }

  rows(scope: DbScope, table: string, bookId: string, q: RowsQuery = {}): Promise<BookRow[]> {
    return this.run(scope, async (trx) => {
      const cols = q.select?.length ? sql.join(q.select.map((c) => sql.ref(ident(c)))) : sql`*`
      const where: RawBuilder<unknown>[] = [sql`book_id = ${bookId}`]
      if (q.alive !== false) where.push(sql`deleted_at is null`)
      for (const [k, v] of Object.entries(q.eq ?? {})) where.push(v === null ? sql`${sql.ref(ident(k))} is null` : sql`${sql.ref(ident(k))} = ${v}`)
      if (q.in) where.push(q.in[1].length ? sql`${sql.ref(ident(q.in[0]))} in (${sql.join([...q.in[1]])})` : sql`false`)
      const order = q.order ? sql` order by ${sql.ref(ident(q.order.column))} ${q.order.ascending ? sql`asc` : sql`desc`}` : sql``
      const limit = q.limit ? sql` limit ${q.limit}` : sql``
      return (await sql<Rec>`select ${cols} from ${sql.table(ident(table))} where ${sql.join(where, sql` and `)}${order}${limit}`.execute(trx)).rows
    })
  }

  insert(scope: DbScope, table: string, rows: Rec[]): Promise<BookRow[]> {
    if (!rows.length) return Promise.resolve([])
    return this.run(scope, async (trx) => {
      const out: Rec[] = []
      for (const r of rows) {
        const cols = Object.keys(r).filter((k) => r[k] !== undefined).map(ident)
        const q = sql<Rec>`insert into ${sql.table(ident(table))} (${sql.join(cols.map((c) => sql.ref(c)))}) values (${sql.join(cols.map((c) => pgValue(table, c, r[c])))}) returning *`
        out.push((await q.execute(trx)).rows[0])
      }
      return out
    })
  }

  update(scope: DbScope, table: string, bookId: string, id: string, patch: Rec): Promise<BookRow | null> {
    return this.run(scope, async (trx) => {
      const sets = Object.keys(patch).filter((k) => patch[k] !== undefined).map((c) => sql`${sql.ref(ident(c))} = ${pgValue(table, c, patch[c])}`)
      if (!sets.length) return (await sql<Rec>`select * from ${sql.table(ident(table))} where id = ${id} and book_id = ${bookId}`.execute(trx)).rows[0] ?? null
      return (await sql<Rec>`update ${sql.table(ident(table))} set ${sql.join(sets)} where id = ${id} and book_id = ${bookId} returning *`.execute(trx)).rows[0] ?? null
    })
  }

  single(scope: DbScope, table: SingleTable, bookId: string): Promise<BookRow | null> {
    return this.run(scope, async (trx) => (await sql<Rec>`select * from ${sql.table(table)} where book_id = ${bookId}`.execute(trx)).rows[0] ?? null)
  }

  upsertSingle(scope: DbScope, table: SingleTable, bookId: string, patch: Rec): Promise<BookRow> {
    return this.run(scope, async (trx) => {
      const r = { ...patch, book_id: bookId }
      const cols = Object.keys(r).filter((k) => r[k as keyof typeof r] !== undefined).map(ident)
      const upd = cols.filter((c) => c !== "book_id")
      const set = upd.length ? sql`do update set ${sql.join(upd.map((c) => sql`${sql.ref(c)} = excluded.${sql.ref(c)}`))}` : sql`do nothing`
      const q = sql<Rec>`insert into ${sql.table(table)} (${sql.join(cols.map((c) => sql.ref(c)))}) values (${sql.join(cols.map((c) => pgValue(table, c, (r as Rec)[c])))}) on conflict (book_id) ${set} returning *`
      return (await q.execute(trx)).rows[0] ?? (await sql<Rec>`select * from ${sql.table(table)} where book_id = ${bookId}`.execute(trx)).rows[0]
    })
  }

  rpc<F extends RpcName>(scope: DbScope, fn: F, args: RpcArgs<F>): Promise<unknown> {
    return this.run(scope, async (trx) => {
      const named = Object.entries(args as Rec).filter(([, v]) => v !== undefined).map(([k, v]) => sql`${sql.raw(ident(k))} => ${v !== null && typeof v === "object" ? JSON.stringify(v) : v}`)
      const { rows } = await sql<Rec>`select * from public.${sql.raw(ident(fn))}(${sql.join(named)})`.execute(trx)
      // Funciones escalares (jsonb, numeric, void): una fila con una columna llamada como la función.
      const r = rows[0]
      if (!r) return null
      const keys = Object.keys(r)
      return keys.length === 1 && keys[0] === fn ? r[fn] : r
    })
  }
}
