// Dobles de F2-D: una "base" en memoria detrás del puerto BookStore (guarda con qué alcance la llamaron y qué RPC
// recibió, con sus argumentos exactos), la lectura de partes del libro sobre esa misma memoria, la IA de gastos y el
// almacén de respaldos. Sin red ni base (la compartida está saturada y es la de producción).
import type { BookRow } from "@mirai/contracts/modules/book-tables"
import type { BookPart, PartRows } from "@mirai/domain/book-data"
import type { DbScope } from "../../src/core/db/scope"
import { BookStore, storeError, type Rec, type RowsQuery, type RpcArgs, type RpcName, type SingleTable } from "../../src/modules/book-tables/book-store"
import { BookTablesRepo, type ListRows } from "../../src/modules/book-tables/book-tables.repository"
import { ExpenseClassifier, type ClassifyItem, type ClassifyResult } from "../../src/modules/expenses/expense-classifier"
import { BackupStorage, type BackupTipo } from "../../src/modules/import/backup-storage"

/** UUID de prueba válido (v4) a partir de un número. */
export const uid = (n: number) => `${n.toString(16).padStart(8, "0")}-d000-4000-8000-${n.toString(16).padStart(12, "0")}`

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
/** Error como el de PostgREST (código de Postgres + mensaje). */
export const pgErr = (code: string, message: string) => storeError({ code, message })

export class FakeBookStore extends BookStore {
  db = new Map<string, Map<string, Rec>>()
  calls: { m: string; scope: DbScope; table?: string }[] = []
  rpcs: { fn: string; args: Rec; scope: DbScope }[] = []
  /** Respuesta de cada RPC (o un error). Sin definir: null. */
  rpcImpl: Partial<Record<RpcName, (args: Rec) => unknown>> = {}
  private seq = 0

  private t(table: string) {
    let m = this.db.get(table)
    if (!m) this.db.set(table, (m = new Map()))
    return m
  }
  seed(table: string, rows: Rec[]) {
    for (const r of rows) this.t(table).set(String(r.id ?? r.book_id), { deleted_at: null, created_at: `2026-10-01T00:00:${String(this.seq++).padStart(2, "0")}Z`, ...r })
    return this
  }
  all(table: string): Rec[] {
    return [...this.t(table).values()].map(clone)
  }
  reset() {
    this.db.clear()
    this.calls.length = 0
    this.rpcs.length = 0
    this.rpcImpl = {}
  }

  async find(scope: DbScope, table: string, id: string): Promise<BookRow | null> {
    this.calls.push({ m: "find", scope, table })
    const r = this.t(table).get(id)
    return r ? clone(r) : null
  }

  async rows(scope: DbScope, table: string, bookId: string, q: RowsQuery = {}): Promise<BookRow[]> {
    this.calls.push({ m: "rows", scope, table })
    let rows = [...this.t(table).values()].filter((r) => r.book_id === bookId && (q.alive === false || !r.deleted_at))
    for (const [k, v] of Object.entries(q.eq ?? {})) rows = rows.filter((r) => (v === null ? r[k] == null : r[k] === v))
    if (q.in) rows = rows.filter((r) => q.in![1].includes(String(r[q.in![0]])))
    if (q.order) {
      const { column, ascending } = q.order
      rows = [...rows].sort((a, b) => String(a[column] ?? "").localeCompare(String(b[column] ?? "")) * (ascending ? 1 : -1))
    }
    if (q.limit) rows = rows.slice(0, q.limit)
    return rows.map((r) => (q.select ? Object.fromEntries(q.select.map((c) => [c, r[c]])) : clone(r)))
  }

  async insert(scope: DbScope, table: string, rows: Rec[]): Promise<BookRow[]> {
    this.calls.push({ m: "insert", scope, table })
    const m = this.t(table)
    for (const r of rows) {
      if (r.id && m.has(String(r.id))) throw pgErr("23505", "duplicate key value violates unique constraint")
      if (r.external_id && [...m.values()].some((x) => x.book_id === r.book_id && x.external_id === r.external_id && !x.deleted_at)) throw pgErr("23505", "duplicate key (external_id)")
    }
    return rows.map((r) => {
      const row = { deleted_at: null, created_at: `2026-11-02T00:00:${String(this.seq++).padStart(2, "0")}Z`, ...r, id: String(r.id ?? uid(9000 + this.seq++)) }
      m.set(row.id, row)
      return clone(row)
    })
  }

  async update(scope: DbScope, table: string, bookId: string, id: string, patch: Rec): Promise<BookRow | null> {
    this.calls.push({ m: "update", scope, table })
    const r = this.t(table).get(id)
    if (!r || r.book_id !== bookId) return null
    Object.assign(r, clone(patch))
    return clone(r)
  }

  async single(scope: DbScope, table: SingleTable, bookId: string): Promise<BookRow | null> {
    this.calls.push({ m: "single", scope, table })
    const r = this.t(table).get(bookId)
    return r ? clone(r) : null
  }

  async upsertSingle(scope: DbScope, table: SingleTable, bookId: string, patch: Rec): Promise<BookRow> {
    this.calls.push({ m: "upsertSingle", scope, table })
    const m = this.t(table)
    const r = { ...(m.get(bookId) ?? { book_id: bookId }), ...clone(patch) }
    m.set(bookId, r)
    return clone(r)
  }

  async rpc<F extends RpcName>(scope: DbScope, fn: F, args: RpcArgs<F>): Promise<unknown> {
    // Como PostgREST: los argumentos `undefined` no viajan.
    const a = JSON.parse(JSON.stringify(args ?? {})) as Rec
    this.rpcs.push({ fn, args: a, scope })
    const impl = this.rpcImpl[fn]
    return impl ? impl(a) : null
  }
}

/** Lectura de partes del libro sobre la misma memoria (la usa la sugerencia "¿es el pago de un fijo?"). */
export class FakeBookTablesRepoW extends BookTablesRepo {
  constructor(private readonly store: FakeBookStore) {
    super()
  }
  async list(scope: DbScope, q: ListRows): Promise<BookRow[]> {
    return this.store.rows(scope, q.table, q.bookId)
  }
  async part(scope: DbScope, bookId: string, part: BookPart): Promise<PartRows> {
    const rows = await this.store.rows(scope, part, bookId)
    if (part !== "fixed_expenses") return rows
    const pays = this.store.all("fixed_expense_payments")
    return rows.map((f) => ({ ...f, fixed_expense_payments: pays.filter((p) => p.fixed_expense_id === f.id) }))
  }
}

export class FakeClassifier extends ExpenseClassifier {
  calls: ClassifyItem[][] = []
  out: ClassifyResult[] | null = null
  async classify(items: ClassifyItem[]): Promise<ClassifyResult[] | null> {
    this.calls.push(items)
    return this.out
  }
}

export class FakeBackups extends BackupStorage {
  saved: { bookId: string; tipo: BackupTipo; body: string; userId: string | null }[] = []
  async save(a: { bookId: string; tipo: BackupTipo; body: string; fecha: string; userId: string | null }) {
    this.saved.push(a)
    return `${a.bookId}/${a.fecha.replace(/[:.]/g, "-")}-${a.tipo}.json`
  }
}
