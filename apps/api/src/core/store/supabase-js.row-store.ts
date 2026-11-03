// Adaptador de RowStore sobre supabase-js (PostgREST): con UserScope manda el JWT de la persona (misma RLS) y con
// SystemScope la clave secreta (SupabaseJsFactory). Con el puente de V7-D (DB_ADAPTER=postgrest) sirve igual contra
// un PostgREST propio delante de Postgres.
import { Injectable } from "@nestjs/common"
import type { TableName } from "@mirai/db/tables"
import type { DbScope } from "../db/scope"
import { SupabaseJsFactory } from "../db/supabase-js.factory"
import { likeEscape, requireWhere, RowStore, rowStoreError, type Query, type Rec, type Relation, type RpcName, type Upsert, type Where } from "./row-store"

const PAGE = 1000

/** Cadena de filtros de PostgREST (la parte que comparten select, update y delete). */
type Filterable = {
  eq(c: string, v: unknown): Filterable
  neq(c: string, v: unknown): Filterable
  is(c: string, v: null): Filterable
  not(c: string, op: string, v: unknown): Filterable
  in(c: string, v: readonly unknown[]): Filterable
  gte(c: string, v: unknown): Filterable
  lte(c: string, v: unknown): Filterable
  gt(c: string, v: unknown): Filterable
  lt(c: string, v: unknown): Filterable
  ilike(c: string, v: string): Filterable
}

/** Aplica el filtro a una consulta de supabase-js (exportado para las pruebas). */
export function applyWhere<B>(b: B, w: Where = {}): B {
  let q = b as unknown as Filterable
  for (const [k, v] of Object.entries(w.eq ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v)
  for (const [k, v] of Object.entries(w.neq ?? {})) q = q.neq(k, v)
  for (const [k, v] of Object.entries(w.in ?? {})) q = q.in(k, v)
  for (const k of w.notNull ?? []) q = q.not(k, "is", null)
  for (const [k, v] of Object.entries(w.gte ?? {})) q = q.gte(k, v)
  for (const [k, v] of Object.entries(w.lte ?? {})) q = q.lte(k, v)
  for (const [k, v] of Object.entries(w.gt ?? {})) q = q.gt(k, v)
  for (const [k, v] of Object.entries(w.lt ?? {})) q = q.lt(k, v)
  for (const [k, v] of Object.entries(w.ilike ?? {})) q = q.ilike(k, `%${likeEscape(v)}%`)
  return q as unknown as B
}

@Injectable()
export class SupabaseJsRowStore extends RowStore {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  private from(scope: DbScope, table: Relation) {
    // Tipos de supabase-js por tabla: el puerto es genérico, así que la cadena va sin tipar.
    return this.sb.for(scope).from(table as TableName) as unknown as {
      select(cols: string, o?: { count?: "exact"; head?: boolean }): Filterable & { order(c: string, o: { ascending: boolean }): unknown; range(a: number, b: number): unknown }
      insert(rows: Rec[]): { select(c: string): PromiseLike<{ data: unknown; error: unknown }> }
      upsert(rows: Rec[], o: { onConflict: string; ignoreDuplicates?: boolean }): { select(c: string): PromiseLike<{ data: unknown; error: unknown }> }
      update(patch: Rec): Filterable
      delete(o?: { count?: "exact" }): Filterable
    }
  }

  async select<T = Rec>(scope: DbScope, table: Relation, q: Query = {}): Promise<T[]> {
    const out: T[] = []
    const start = q.offset ?? 0
    const max = q.limit ?? Infinity
    for (let from = start; from - start < max; from += PAGE) {
      let b = applyWhere(this.from(scope, table).select(q.columns?.join(",") || "*"), q) as unknown as { order(c: string, o: { ascending: boolean }): unknown; range(a: number, b: number): PromiseLike<{ data: unknown; error: unknown }> }
      for (const o of q.order ?? []) b = b.order(o.column, { ascending: o.ascending !== false }) as typeof b
      const to = Math.min(from + PAGE, start + max) - 1
      const { data, error } = await b.range(from, to)
      if (error) throw rowStoreError(error)
      const rows = (data ?? []) as T[]
      out.push(...rows)
      if (rows.length < to - from + 1) break
    }
    return out
  }

  async count(scope: DbScope, table: Relation, w: Where = {}): Promise<number> {
    const { count, error } = (await (applyWhere(this.from(scope, table).select("*", { count: "exact", head: true }), w) as unknown as PromiseLike<{ count: number | null; error: unknown }>))
    if (error) throw rowStoreError(error)
    return count ?? 0
  }

  async insert<T = Rec>(scope: DbScope, table: TableName, rows: Rec[]): Promise<T[]> {
    if (!rows.length) return []
    const { data, error } = await this.from(scope, table).insert(rows).select("*")
    if (error) throw rowStoreError(error)
    return (data ?? []) as T[]
  }

  async upsert<T = Rec>(scope: DbScope, table: TableName, rows: Rec[], o: Upsert): Promise<T[]> {
    if (!rows.length) return []
    const { data, error } = await this.from(scope, table).upsert(rows, { onConflict: o.onConflict.join(","), ignoreDuplicates: o.ignoreDuplicates }).select("*")
    if (error) throw rowStoreError(error)
    return (data ?? []) as T[]
  }

  async update<T = Rec>(scope: DbScope, table: TableName, w: Where, patch: Rec): Promise<T[]> {
    requireWhere("update", table, w)
    const { data, error } = await ((applyWhere(this.from(scope, table).update(patch), w) as unknown as { select(c: string): PromiseLike<{ data: unknown; error: unknown }> }).select("*"))
    if (error) throw rowStoreError(error)
    return (data ?? []) as T[]
  }

  async delete(scope: DbScope, table: TableName, w: Where): Promise<number> {
    requireWhere("delete", table, w)
    const { count, error } = await (applyWhere(this.from(scope, table).delete({ count: "exact" }), w) as unknown as PromiseLike<{ count: number | null; error: unknown }>)
    if (error) throw rowStoreError(error)
    return count ?? 0
  }

  async rpc(scope: DbScope, fn: RpcName, args: Rec = {}): Promise<unknown> {
    const { data, error } = await this.sb.for(scope).rpc(fn as never, args as never)
    if (error) throw rowStoreError(error)
    return data
  }
}
