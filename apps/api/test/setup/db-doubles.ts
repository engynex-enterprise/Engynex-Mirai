// Dobles de base para probar adaptadores sin red: un cliente supabase-js falso que registra la cadena de llamadas y un
// dialecto de Kysely que captura el SQL (como src/core/db/db.test.ts) y responde filas según la consulta.
import { CompiledQuery, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type DatabaseConnection, type Dialect, type Driver, type QueryResult } from "kysely"
import pino from "pino"
import type { AppConfig } from "../../src/core/config/app-config"
import { PgKyselyFactory } from "../../src/core/db/pg-kysely.factory"
import type { UserScope } from "../../src/core/db/scope"
import type { SupabaseJsFactory } from "../../src/core/db/supabase-js.factory"

export const USER_SCOPE: UserScope = { kind: "user", userId: "u-1", token: "jwt", claims: { sub: "u-1", role: "authenticated" } }

type Result = { data: unknown; error: unknown; count?: number | null }

/**
 * supabase-js falso: cada `from(tabla)` abre una cadena que registra sus llamadas y, al esperarla, responde
 * `results(tabla, llamadas)`. `chains` guarda una cadena por consulta, en orden.
 */
export function fakeSupabase(results: (table: string, calls: unknown[][]) => Result = () => ({ data: [], error: null })) {
  const chains: { table: string; calls: unknown[][] }[] = []
  const chain = (table: string) => {
    const c = { table, calls: [] as unknown[][] }
    chains.push(c)
    const q: object = new Proxy({}, {
      get: (_t, k) => (k === "then" ? (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(results(table, c.calls)).then(ok, ko) : (...a: unknown[]) => (c.calls.push([k, ...a]), q)),
    })
    return q
  }
  const client = { from: (t: string) => chain(t) }
  const sb = { for: () => client } as unknown as SupabaseJsFactory
  return { sb, chains }
}

/** Kysely con un driver que captura el SQL; `rows(sql)` decide qué filas devuelve cada consulta. */
export function captureKysely(rows: (sql: string, params: readonly unknown[]) => unknown[] = () => []) {
  const log: { sql: string; params: readonly unknown[] }[] = []
  const conn: DatabaseConnection = {
    async executeQuery<R>(q: CompiledQuery): Promise<QueryResult<R>> {
      log.push({ sql: q.sql, params: q.parameters })
      const r = /^(set|select set_config)/.test(q.sql) ? [] : rows(q.sql, q.parameters)
      return { rows: r as R[], numAffectedRows: BigInt(r.length) }
    },
    async *streamQuery() {
      throw new Error("no")
    },
  }
  const driver: Driver = {
    init: async () => {},
    acquireConnection: async () => conn,
    beginTransaction: async () => {},
    commitTransaction: async () => {},
    rollbackTransaction: async () => {},
    releaseConnection: async () => {},
    destroy: async () => {},
  }
  const dialect: Dialect = {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => driver,
    createQueryCompiler: () => new PostgresQueryCompiler(),
    createIntrospector: (db) => new PostgresIntrospector(db),
  }
  const factory = new PgKyselyFactory({ db: { adapter: "pg" } } as AppConfig, pino({ level: "silent" }), dialect)
  /** Solo las consultas de datos (sin el contexto RLS de la transacción). */
  const queries = () => log.filter((l) => !/^(set|select set_config)/.test(l.sql))
  return { factory, log, queries }
}
