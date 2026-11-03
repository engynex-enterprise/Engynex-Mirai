// Adaptador de RowStore para Postgres propio (Cloud SQL, RDS, Azure…): el mismo SQL dentro de tx() de PgKyselyFactory
// (con UserScope: `set local role authenticated` + claims, así la RLS y auth.uid() siguen funcionando). Tablas y
// columnas vienen del servicio y van como identificadores citados después de revisarlos con una expresión regular.
import { Injectable } from "@nestjs/common"
import { sql, type RawBuilder } from "kysely"
import type { TableName } from "@mirai/db/tables"
import { PgKyselyFactory, type Trx } from "../db/pg-kysely.factory"
import type { DbScope } from "../db/scope"
import { JSON_COLUMNS } from "./json-columns"
import { likeEscape, requireWhere, RowStore, rowStoreError, type Query, type Rec, type Relation, type RpcName, type Upsert, type Where } from "./row-store"

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/
export const ident = (s: string) => {
  if (!IDENT.test(s)) throw new Error(`Identificador inválido: ${s}`)
  return s
}

/** Valor listo para pg: en columnas jsonb (y para cualquier objeto) va como texto JSON. Exportado para las pruebas. */
export function pgValue(table: string, col: string, v: unknown): unknown {
  if (v === undefined) return null
  if (JSON_COLUMNS.has(`${table}.${col}`)) return v === null ? null : JSON.stringify(v)
  if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) return JSON.stringify(v)
  return v
}

/** Condiciones del filtro (exportado para las pruebas). */
export function whereSql(w: Where = {}): RawBuilder<unknown>[] {
  const out: RawBuilder<unknown>[] = []
  const col = (k: string) => sql.ref(ident(k))
  for (const [k, v] of Object.entries(w.eq ?? {})) out.push(v === null ? sql`${col(k)} is null` : sql`${col(k)} = ${v}`)
  for (const [k, v] of Object.entries(w.neq ?? {})) out.push(sql`${col(k)} <> ${v}`)
  for (const [k, v] of Object.entries(w.in ?? {})) out.push(v.length ? sql`${col(k)} in (${sql.join([...v])})` : sql`false`)
  for (const k of w.notNull ?? []) out.push(sql`${col(k)} is not null`)
  for (const [k, v] of Object.entries(w.gte ?? {})) out.push(sql`${col(k)} >= ${v}`)
  for (const [k, v] of Object.entries(w.lte ?? {})) out.push(sql`${col(k)} <= ${v}`)
  for (const [k, v] of Object.entries(w.gt ?? {})) out.push(sql`${col(k)} > ${v}`)
  for (const [k, v] of Object.entries(w.lt ?? {})) out.push(sql`${col(k)} < ${v}`)
  for (const [k, v] of Object.entries(w.ilike ?? {})) out.push(sql`${col(k)} ilike ${`%${likeEscape(v)}%`}`)
  return out
}

const whereClause = (w: Where) => {
  const parts = whereSql(w)
  return parts.length ? sql` where ${sql.join(parts, sql` and `)}` : sql``
}

@Injectable()
export class PgKyselyRowStore extends RowStore {
  constructor(private readonly db: PgKyselyFactory) {
    super()
  }

  private run<T>(scope: DbScope, fn: (trx: Trx) => Promise<T>): Promise<T> {
    return this.db.tx(scope, fn).catch((e) => {
      throw rowStoreError((e as { cause?: unknown })?.cause ?? e)
    })
  }

  select<T = Rec>(scope: DbScope, table: Relation, q: Query = {}): Promise<T[]> {
    return this.run(scope, async (trx) => {
      const cols = q.columns?.length ? sql.join(q.columns.map((c) => sql.ref(ident(c)))) : sql`*`
      const order = q.order?.length ? sql` order by ${sql.join(q.order.map((o) => sql`${sql.ref(ident(o.column))} ${o.ascending === false ? sql`desc` : sql`asc`}`))}` : sql``
      const limit = q.limit ? sql` limit ${q.limit}` : sql``
      const offset = q.offset ? sql` offset ${q.offset}` : sql``
      return (await sql<T>`select ${cols} from ${sql.table(ident(table))}${whereClause(q)}${order}${limit}${offset}`.execute(trx)).rows
    })
  }

  count(scope: DbScope, table: Relation, w: Where = {}): Promise<number> {
    return this.run(scope, async (trx) => Number((await sql<{ n: number }>`select count(*)::int as n from ${sql.table(ident(table))}${whereClause(w)}`.execute(trx)).rows[0]?.n ?? 0))
  }

  private insertSql(table: string, rows: Rec[]) {
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r).filter((k) => r[k] !== undefined)))].map(ident)
    const values = rows.map((r) => sql`(${sql.join(cols.map((c) => (r[c] === undefined ? sql`default` : sql`${pgValue(table, c, r[c])}`)))})`)
    return { cols, head: sql`insert into ${sql.table(ident(table))} (${sql.join(cols.map((c) => sql.ref(c)))}) values ${sql.join(values)}` }
  }

  insert<T = Rec>(scope: DbScope, table: TableName, rows: Rec[]): Promise<T[]> {
    if (!rows.length) return Promise.resolve([])
    return this.run(scope, async (trx) => {
      const { head } = this.insertSql(table, rows)
      return (await sql<T>`${head} returning *`.execute(trx)).rows
    })
  }

  upsert<T = Rec>(scope: DbScope, table: TableName, rows: Rec[], o: Upsert): Promise<T[]> {
    if (!rows.length) return Promise.resolve([])
    return this.run(scope, async (trx) => {
      const { cols, head } = this.insertSql(table, rows)
      const keys = o.onConflict.map(ident)
      const upd = cols.filter((c) => !keys.includes(c))
      const action = o.ignoreDuplicates || !upd.length ? sql`do nothing` : sql`do update set ${sql.join(upd.map((c) => sql`${sql.ref(c)} = excluded.${sql.ref(c)}`))}`
      return (await sql<T>`${head} on conflict (${sql.join(keys.map((k) => sql.ref(k)))}) ${action} returning *`.execute(trx)).rows
    })
  }

  async update<T = Rec>(scope: DbScope, table: TableName, w: Where, patch: Rec): Promise<T[]> {
    requireWhere("update", table, w)
    return this.run(scope, async (trx) => {
      const sets = Object.keys(patch).filter((k) => patch[k] !== undefined).map((c) => sql`${sql.ref(ident(c))} = ${pgValue(table, c, patch[c])}`)
      if (!sets.length) return (await sql<T>`select * from ${sql.table(ident(table))}${whereClause(w)}`.execute(trx)).rows
      return (await sql<T>`update ${sql.table(ident(table))} set ${sql.join(sets)}${whereClause(w)} returning *`.execute(trx)).rows
    })
  }

  async delete(scope: DbScope, table: TableName, w: Where): Promise<number> {
    requireWhere("delete", table, w)
    return this.run(scope, async (trx) => Number((await sql`delete from ${sql.table(ident(table))}${whereClause(w)}`.execute(trx)).numAffectedRows ?? 0))
  }

  rpc(scope: DbScope, fn: RpcName, args: Rec = {}): Promise<unknown> {
    return this.run(scope, async (trx) => {
      const named = Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => sql`${sql.raw(ident(k))} => ${v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v}`)
      const { rows } = await sql<Rec>`select * from public.${sql.raw(ident(fn))}(${sql.join(named)})`.execute(trx)
      if (!rows.length) return null
      // Funciones escalares: una fila con una columna llamada como la función. Las que devuelven filas: el arreglo.
      const keys = Object.keys(rows[0])
      if (rows.length === 1 && keys.length === 1 && keys[0] === fn) return rows[0][fn]
      return rows.length === 1 ? rows[0] : rows
    })
  }
}
