// RowStore en memoria (V7-G): una "base" de tablas sin red que aplica los mismos filtros que los adaptadores y guarda
// con qué alcance la llamaron (para revisar SystemScope vs UserScope) y qué RPC recibió. Llaves únicas opcionales por
// tabla (`unique`) para que los upsert e inserciones repetidas se comporten como en Postgres (23505).
import type { TableName } from "@mirai/db/tables"
import type { DbScope } from "../../src/core/db/scope"
import { requireWhere, RowStore, rowStoreError, type Query, type Rec, type Relation, type RpcName, type Upsert, type Where } from "../../src/core/store/row-store"

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
const cmp = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? a - b : String(a ?? "").localeCompare(String(b ?? "")))

export function matches(r: Rec, w: Where = {}): boolean {
  for (const [k, v] of Object.entries(w.eq ?? {})) if (v === null ? r[k] != null : r[k] !== v) return false
  for (const [k, v] of Object.entries(w.neq ?? {})) if (r[k] === v) return false
  for (const [k, v] of Object.entries(w.in ?? {})) if (!v.includes(r[k] as never)) return false
  for (const k of w.notNull ?? []) if (r[k] == null) return false
  for (const [k, v] of Object.entries(w.gte ?? {})) if (r[k] == null || cmp(r[k], v) < 0) return false
  for (const [k, v] of Object.entries(w.lte ?? {})) if (r[k] == null || cmp(r[k], v) > 0) return false
  for (const [k, v] of Object.entries(w.gt ?? {})) if (r[k] == null || cmp(r[k], v) <= 0) return false
  for (const [k, v] of Object.entries(w.lt ?? {})) if (r[k] == null || cmp(r[k], v) >= 0) return false
  for (const [k, v] of Object.entries(w.ilike ?? {})) if (!String(r[k] ?? "").toLowerCase().includes(v.toLowerCase())) return false
  return true
}

export type StoreCall = { m: string; table?: string; scope: DbScope }

export class MemoryRowStore extends RowStore {
  tables = new Map<string, Rec[]>()
  calls: StoreCall[] = []
  rpcs: { fn: string; args: Rec; scope: DbScope }[] = []
  /** Respuesta (o error lanzado) de cada RPC. Sin definir: null. */
  rpcImpl: Partial<Record<RpcName, (args: Rec, scope: DbScope) => unknown>> = {}
  /** Llaves únicas por tabla (además de `id`). */
  unique: Partial<Record<TableName, string[][]>> = {}
  /** Valores por defecto al insertar (como los `default` de la tabla). */
  defaults: Partial<Record<TableName, (r: Rec) => Rec>> = {}
  private seq = 0

  t(table: string): Rec[] {
    let rows = this.tables.get(table)
    if (!rows) this.tables.set(table, (rows = []))
    return rows
  }
  seed(table: TableName, rows: Rec[]) {
    for (const r of rows) this.t(table).push(clone(r))
    return this
  }
  all<T = Rec>(table: TableName): T[] {
    return clone(this.t(table)) as T[]
  }
  reset() {
    this.tables.clear()
    this.calls.length = 0
    this.rpcs.length = 0
    this.rpcImpl = {}
  }
  scopesOf(table: TableName) {
    return this.calls.filter((c) => c.table === table).map((c) => c.scope.kind)
  }

  private keyClash(table: string, r: Rec, except?: Rec): Rec | undefined {
    const keys = [...(this.unique[table as TableName] ?? []), ...("id" in r ? [["id"]] : [])]
    // Como Postgres: un null nunca choca en una llave única.
    return this.t(table).find((x) => x !== except && keys.some((k) => k.every((c) => x[c] != null && x[c] === r[c])))
  }

  private fill(table: string, r: Rec): Rec {
    const now = new Date(Date.UTC(2026, 10, 2, 12, 0, this.seq++ % 60)).toISOString()
    return { ...(this.defaults[table as TableName]?.(r) ?? {}), ...("id" in r || this.unique[table as TableName] ? {} : { id: crypto.randomUUID() }), created_at: now, ...clone(r) }
  }

  async select<T = Rec>(scope: DbScope, table: Relation, q: Query = {}): Promise<T[]> {
    this.calls.push({ m: "select", table, scope })
    let rows = this.t(table).filter((r) => matches(r, q))
    for (const o of [...(q.order ?? [])].reverse()) rows = [...rows].sort((a, b) => cmp(a[o.column], b[o.column]) * (o.ascending === false ? -1 : 1))
    rows = rows.slice(q.offset ?? 0, q.limit ? (q.offset ?? 0) + q.limit : undefined)
    return rows.map((r) => (q.columns?.length ? Object.fromEntries(q.columns.map((c) => [c, clone(r[c])])) : clone(r))) as T[]
  }

  async count(scope: DbScope, table: Relation, w: Where = {}) {
    this.calls.push({ m: "count", table, scope })
    return this.t(table).filter((r) => matches(r, w)).length
  }

  async insert<T = Rec>(scope: DbScope, table: TableName, rows: Rec[]): Promise<T[]> {
    this.calls.push({ m: "insert", table, scope })
    const out: Rec[] = []
    for (const raw of rows) {
      const r = this.fill(table, raw)
      if (this.keyClash(table, r)) throw rowStoreError({ code: "23505", message: "duplicate key value violates unique constraint" })
      this.t(table).push(r)
      out.push(clone(r))
    }
    return out as T[]
  }

  async upsert<T = Rec>(scope: DbScope, table: TableName, rows: Rec[], o: Upsert): Promise<T[]> {
    this.calls.push({ m: "upsert", table, scope })
    const out: Rec[] = []
    for (const raw of rows) {
      const hit = this.t(table).find((x) => o.onConflict.every((c) => x[c] === raw[c]))
      if (hit) {
        if (o.ignoreDuplicates) continue
        Object.assign(hit, clone(raw))
        out.push(clone(hit))
      } else {
        const r = this.fill(table, raw)
        this.t(table).push(r)
        out.push(clone(r))
      }
    }
    return out as T[]
  }

  async update<T = Rec>(scope: DbScope, table: TableName, w: Where, patch: Rec): Promise<T[]> {
    requireWhere("update", table, w)
    this.calls.push({ m: "update", table, scope })
    const hits = this.t(table).filter((r) => matches(r, w))
    for (const r of hits) Object.assign(r, clone(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))))
    return clone(hits) as T[]
  }

  async delete(scope: DbScope, table: TableName, w: Where): Promise<number> {
    requireWhere("delete", table, w)
    this.calls.push({ m: "delete", table, scope })
    const rows = this.t(table)
    const keep = rows.filter((r) => !matches(r, w))
    const n = rows.length - keep.length
    this.tables.set(table, keep)
    return n
  }

  async rpc(scope: DbScope, fn: RpcName, args: Rec = {}): Promise<unknown> {
    const a = clone(args)
    this.rpcs.push({ fn, args: a, scope })
    const impl = this.rpcImpl[fn]
    return impl ? impl(a, scope) : null
  }
}
