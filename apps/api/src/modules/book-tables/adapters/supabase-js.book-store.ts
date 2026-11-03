// Adaptador de hoy del puerto de escritura (PostgREST con el JWT de la persona). La fábrica ya manda
// `x-mirai-enlaces: 1`, así que las cascadas de la base (gasto ↔ tarjeta ↔ fijo ↔ suscripción ↔ compartido) corren
// igual que cuando escribe el navegador nuevo. Mismas llamadas que useSave/useSoftDelete y las RPC de la web.
import { Injectable } from "@nestjs/common"
import type { BookRow } from "@mirai/contracts/modules/book-tables"
import type { DbScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { BookStore, storeError, type Rec, type RowsQuery, type RpcArgs, type RpcName, type SingleTable } from "../book-store"

const PAGE = 1000

@Injectable()
export class SupabaseJsBookStore extends BookStore {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  private from(scope: DbScope, table: string) {
    return this.sb.for(scope).from(table as never)
  }

  async find(scope: DbScope, table: string, id: string): Promise<BookRow | null> {
    const { data, error } = await this.from(scope, table).select("*").eq("id" as never, id as never).maybeSingle()
    if (error) throw storeError(error)
    return (data ?? null) as BookRow | null
  }

  async rows(scope: DbScope, table: string, bookId: string, q: RowsQuery = {}): Promise<BookRow[]> {
    const out: BookRow[] = []
    const max = q.limit ?? Infinity
    for (let from = 0; from < max; from += PAGE) {
      let b = this.from(scope, table).select(q.select?.join(",") || "*").eq("book_id" as never, bookId as never)
      if (q.alive !== false) b = b.is("deleted_at" as never, null)
      for (const [k, v] of Object.entries(q.eq ?? {})) b = v === null ? b.is(k as never, null) : b.eq(k as never, v as never)
      if (q.in) b = b.in(q.in[0] as never, q.in[1] as never)
      if (q.order) b = b.order(q.order.column as never, { ascending: q.order.ascending })
      const to = Math.min(from + PAGE, max) - 1
      const { data, error } = await b.range(from, to)
      if (error) throw storeError(error)
      const rows = (data ?? []) as unknown as BookRow[]
      out.push(...rows)
      if (rows.length < to - from + 1) break
    }
    return out
  }

  async insert(scope: DbScope, table: string, rows: Rec[]): Promise<BookRow[]> {
    if (!rows.length) return []
    const { data, error } = await this.from(scope, table).insert(rows as never).select("*")
    if (error) throw storeError(error)
    return (data ?? []) as unknown as BookRow[]
  }

  async update(scope: DbScope, table: string, bookId: string, id: string, patch: Rec): Promise<BookRow | null> {
    // update y no upsert (como useSave al editar): un cambio parcial no debe validarse como un registro nuevo.
    const { data, error } = await this.from(scope, table).update(patch as never).eq("id" as never, id as never).eq("book_id" as never, bookId as never).select("*")
    if (error) throw storeError(error)
    return ((data ?? [])[0] ?? null) as BookRow | null
  }

  async single(scope: DbScope, table: SingleTable, bookId: string): Promise<BookRow | null> {
    const { data, error } = await this.from(scope, table).select("*").eq("book_id" as never, bookId as never).maybeSingle()
    if (error) throw storeError(error)
    return (data ?? null) as BookRow | null
  }

  async upsertSingle(scope: DbScope, table: SingleTable, bookId: string, patch: Rec): Promise<BookRow> {
    const { data, error } = await this.from(scope, table).upsert({ ...patch, book_id: bookId } as never, { onConflict: "book_id" }).select("*").single()
    if (error) throw storeError(error)
    return data as unknown as BookRow
  }

  async rpc<F extends RpcName>(scope: DbScope, fn: F, args: RpcArgs<F>): Promise<unknown> {
    const { data, error } = await this.sb.for(scope).rpc(fn as never, args as never)
    if (error) throw storeError(error)
    return data
  }
}
