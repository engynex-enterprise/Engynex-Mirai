// El adaptador de Cloud SQL (Kysely) con un driver que captura el SQL: confirma el contexto RLS por transacción
// (set local role + set_config) sin conectarse a ninguna base.
import { CompiledQuery, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type DatabaseConnection, type Dialect, type Driver, type QueryResult } from "kysely"
import pino from "pino"
import { describe, expect, it } from "vitest"
import type { AppConfig } from "../config/app-config"
import { PgKyselyCatalogsRepo } from "../../modules/catalogs/adapters/pg-kysely.catalogs.repo"
import { PgKyselyFactory } from "./pg-kysely.factory"
import { systemScope, type UserScope } from "./scope"

function captureDialect(rows: unknown[] = []) {
  const log: { sql: string; params: readonly unknown[] }[] = []
  const conn: DatabaseConnection = {
    async executeQuery<R>(q: CompiledQuery): Promise<QueryResult<R>> {
      log.push({ sql: q.sql, params: q.parameters })
      return { rows: (q.sql.startsWith("select *") ? rows : []) as R[] }
    },
    async *streamQuery() {
      throw new Error("no")
    },
  }
  const driver: Driver = {
    init: async () => {},
    acquireConnection: async () => conn,
    beginTransaction: async () => void log.push({ sql: "begin", params: [] }),
    commitTransaction: async () => void log.push({ sql: "commit", params: [] }),
    rollbackTransaction: async () => void log.push({ sql: "rollback", params: [] }),
    releaseConnection: async () => {},
    destroy: async () => {},
  }
  const dialect: Dialect = {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => driver,
    createQueryCompiler: () => new PostgresQueryCompiler(),
    createIntrospector: (db) => new PostgresIntrospector(db),
  }
  return { dialect, log }
}

const user: UserScope = { kind: "user", userId: "u-1", token: "jwt", claims: { sub: "u-1", role: "authenticated", email: "a@b.co", session_id: "s" } }
const factory = (d: Dialect) => new PgKyselyFactory({ db: { adapter: "pg" } } as AppConfig, pino({ level: "silent" }), d)

describe("PgKyselyFactory.tx", () => {
  it("UserScope: begin → set local role authenticated → claims y x-mirai-enlaces → consulta → commit", async () => {
    const { dialect, log } = captureDialect()
    await factory(dialect).tx(user, async () => "ok")
    expect(log.map((l) => l.sql)).toEqual([
      "begin",
      "set local role authenticated",
      "select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.headers', $3, true)",
      "commit",
    ])
    expect(JSON.parse(String(log[2].params[0]))).toMatchObject({ sub: "u-1", role: "authenticated", email: "a@b.co" })
    expect(log[2].params[1]).toBe("u-1")
    expect(JSON.parse(String(log[2].params[2]))).toEqual({ "x-mirai-enlaces": "1" })
  })

  it("SystemScope no cambia de rol; un error hace rollback y sale como DomainError", async () => {
    const { dialect, log } = captureDialect()
    const f = factory(dialect)
    await f.tx(systemScope("cron"), async () => 1)
    expect(log.map((l) => l.sql)).toEqual(["begin", "commit"])
    const e = await f.tx(user, async () => Promise.reject(Object.assign(new Error("rls"), { code: "42501" }))).catch((x) => x)
    expect(e).toMatchObject({ code: "ROLE_DENIED" })
    expect(log.at(-1)?.sql).toBe("rollback")
  })

  it("PgKyselyCatalogsRepo: misma consulta que la web (libro, sin borradas, orden por sort)", async () => {
    const { dialect, log } = captureDialect([{ id: "c1" }])
    const rows = await new PgKyselyCatalogsRepo(factory(dialect)).listCategories(user, { bookId: "b-1", grupo: "gustos" })
    expect(rows).toEqual([{ id: "c1" }])
    const q = log.find((l) => l.sql.startsWith("select *"))!
    expect(q.sql).toBe('select * from "categories" where "book_id" = $1 and "deleted_at" is null and "grupo" = $2 order by "sort" asc')
    expect(q.params).toEqual(["b-1", "gustos"])
  })
})
