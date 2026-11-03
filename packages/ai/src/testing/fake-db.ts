// Dobles para las pruebas de @mirai/ai (y de la API): una base de Supabase en memoria con lo que usan la IA y el chat
// (select con filtros, orden y límite; insert, update, upsert y delete; rpc) y un runtime de @mirai/services que la usa.
// Nunca toca la base compartida ni un proveedor de IA. Solo para pruebas.
import { configureServices, type Db } from "@mirai/services/runtime"
import type { LoadedBook } from "@mirai/domain/book-data"

type Row = Record<string, unknown>
type Filter = (r: Row) => boolean
type Res = { data: unknown; error: { message: string; code?: string } | null; count?: number | null }

let clock = Date.parse("2026-11-02T15:00:00Z")
/** Fechas crecientes (el orden por created_at es el de inserción, como en la base). */
const now = () => new Date((clock += 1000)).toISOString()

export type FakeDb = {
  tables: Record<string, Row[]>
  rpcs: Record<string, (args: Record<string, unknown>) => unknown>
  /** Cliente con la forma de supabase-js (lo justo para la IA y el chat). */
  client: Db
  rows(table: string): Row[]
}

export function fakeDb(seed: Record<string, Row[]> = {}, rpcs: FakeDb["rpcs"] = {}): FakeDb {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]))
  const t = (name: string) => (tables[name] ??= [])

  function query(table: string) {
    const filters: Filter[] = []
    const orders: { col: string; asc: boolean }[] = []
    let limit: number | null = null
    let op: "select" | "insert" | "update" | "upsert" | "delete" = "select"
    let payload: Row | Row[] | null = null
    let one: "single" | "maybe" | null = null
    let returning = false
    let count = false
    let head = false
    let onConflict = "id"

    const run = (): Res => {
      const all = t(table)
      if (op === "insert" || op === "upsert") {
        const list: Row[] = (Array.isArray(payload) ? payload : [payload!]).map((r) => ({ id: crypto.randomUUID(), created_at: now(), ...r }))
        const out: Row[] = []
        for (const r of list) {
          const keys = onConflict.split(",")
          const prev = op === "upsert" ? all.find((x) => keys.every((k) => x[k] === r[k])) : undefined
          if (prev) { Object.assign(prev, r); out.push(prev) } else { all.push(r); out.push(r) }
        }
        return finish(out)
      }
      let rows = all.filter((r) => filters.every((f) => f(r)))
      if (op === "update") { for (const r of rows) Object.assign(r, payload); return finish(rows) }
      if (op === "delete") {
        tables[table] = all.filter((r) => !rows.includes(r))
        return { data: returning ? rows : null, error: null, count: rows.length }
      }
      for (const o of [...orders].reverse()) rows = [...rows].sort((a, b) => (String(a[o.col] ?? "") < String(b[o.col] ?? "") ? -1 : String(a[o.col] ?? "") > String(b[o.col] ?? "") ? 1 : 0) * (o.asc ? 1 : -1))
      const total = rows.length
      if (limit !== null) rows = rows.slice(0, limit)
      if (head) return { data: null, error: null, count: total }
      const res = finish(rows)
      return count ? { ...res, count: total } : res
    }
    const finish = (rows: Row[]): Res => {
      if (op !== "select" && !returning) return { data: null, error: null }
      if (one === "single") return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } }
      if (one === "maybe") return { data: rows[0] ?? null, error: null }
      return { data: rows, error: null }
    }

    const b = {
      select(_cols?: string, o?: { count?: string; head?: boolean }) { if (op === "select") { count = !!o?.count; head = !!o?.head } else returning = true; return b },
      insert(p: Row | Row[]) { op = "insert"; payload = p; return b },
      upsert(p: Row | Row[], o?: { onConflict?: string }) { op = "upsert"; payload = p; if (o?.onConflict) onConflict = o.onConflict; else if (table === "ai_cache") onConflict = "key"; return b },
      update(p: Row) { op = "update"; payload = p; return b },
      delete(o?: { count?: string }) { op = "delete"; count = !!o?.count; return b },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return b },
      neq(c: string, v: unknown) { filters.push((r) => r[c] !== v); return b },
      is(c: string, v: unknown) { filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return b },
      not(c: string, opr: string, v: unknown) { filters.push((r) => (opr === "is" && v === null ? r[c] != null : r[c] !== v)); return b },
      in(c: string, vs: unknown[]) { filters.push((r) => vs.includes(r[c])); return b },
      gte(c: string, v: string) { filters.push((r) => String(r[c]) >= v); return b },
      gt(c: string, v: string) { filters.push((r) => String(r[c]) > v); return b },
      lt(c: string, v: string) { filters.push((r) => String(r[c]) < v); return b },
      like(c: string, v: string) { const re = new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`); filters.push((r) => re.test(String(r[c] ?? ""))); return b },
      ilike(c: string, v: string) { const re = new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i"); filters.push((r) => re.test(String(r[c] ?? ""))); return b },
      order(c: string, o?: { ascending?: boolean }) { orders.push({ col: c, asc: o?.ascending !== false }); return b },
      limit(n: number) { limit = n; return b },
      abortSignal() { return b },
      single() { one = "single"; return b },
      maybeSingle() { one = "maybe"; return b },
      then<A, B>(ok: (v: Res) => A, ko?: (e: unknown) => B) { return Promise.resolve().then(run).then(ok, ko) },
    }
    return b
  }

  const client = {
    from: (table: string) => query(table),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      const f = rpcs[name]
      if (!f) return { data: null, error: { message: `could not find the function ${name}`, code: "PGRST202" } }
      try { return { data: await f(args), error: null } } catch (e) { return { data: null, error: { message: (e as Error).message } } }
    },
  } as unknown as Db
  return { tables, rpcs, client, rows: t }
}

/** Configura @mirai/services con la base en memoria y un libro fijo (rt().loadBook). */
export function fakeRuntime(db: FakeDb, book: () => LoadedBook, env: Record<string, string> = {}) {
  configureServices({
    admin: () => db.client,
    encrypt: (s) => s,
    decrypt: (s) => s,
    env: (k) => env[k],
    siteUrl: () => "https://mirai.test",
    publicSiteUrl: () => "https://mirai.test",
    loadBook: async () => book(),
  })
}

/** RPC que la IA llama siempre: límite de tasa, créditos del mes y plan del hogar. */
export const baseRpcs = (plan: (h: string) => string = () => "premium"): FakeDb["rpcs"] => ({
  rate_limit_hit: () => ({ ok: true, remaining: 100, reset_ms: 1000 }),
  ai_creditos_desde: () => 0,
  household_plan: (a) => plan(String(a.h)),
})
