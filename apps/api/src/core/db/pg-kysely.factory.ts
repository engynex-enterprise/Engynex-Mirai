// Adaptador para Cloud SQL (fase 4, §2.3): pg + Kysely. Cada operación con UserScope corre en una transacción que
// primero hace `set local role authenticated` y fija `request.jwt.claims` / `request.headers`, así las políticas RLS,
// auth.uid(), auth.jwt() y sync_enlaces_on() siguen funcionando sin reescribirlas. `set local` vive solo en la
// transacción: es seguro con un pool y con poolers en modo transacción. SystemScope usa la conexión del dueño.
//
// Hoy NO se usa contra la base compartida (DB_ADAPTER=supabase). Se elige con DB_ADAPTER=pg + DATABASE_URL.
import { Inject, Injectable, Optional, type OnApplicationShutdown } from "@nestjs/common"
import { Kysely, PostgresDialect, sql, type Dialect, type Transaction } from "kysely"
import type { Logger } from "pino"
import type { Row, TableName } from "@mirai/db/tables"
import { AppConfig } from "../config/app-config"
import { DomainError } from "../errors/domain-error"
import { LOGGER } from "../logging/logger"
import type { DbScope } from "./scope"

/** Tablas de la base para Kysely (desde los tipos de Supabase; en la fase 4, kysely-codegen en packages/db). */
export type KyselyDb = { [K in TableName]: Row<K> }
export type Trx = Transaction<KyselyDb>

/** Solo pruebas: un dialecto de Kysely falso en lugar de pg. */
export const PG_DIALECT = Symbol("mirai.pg-dialect")

/** Encabezados que la RLS lee con current_setting('request.headers'). */
export const RLS_HEADERS = JSON.stringify({ "x-mirai-enlaces": "1" })

/** Prepara la transacción para el alcance (exportado para las pruebas). */
export async function applyScope(trx: Trx, scope: DbScope): Promise<void> {
  if (scope.kind !== "user") return
  const claims = JSON.stringify({ ...scope.claims, sub: scope.userId, role: "authenticated" })
  await sql`set local role authenticated`.execute(trx)
  await sql`select set_config('request.jwt.claims', ${claims}, true), set_config('request.jwt.claim.sub', ${scope.userId}, true), set_config('request.headers', ${RLS_HEADERS}, true)`.execute(trx)
}

@Injectable()
export class PgKyselyFactory implements OnApplicationShutdown {
  private db?: Kysely<KyselyDb>

  constructor(
    private readonly config: AppConfig,
    @Inject(LOGGER) private readonly log: Logger,
    /** Solo pruebas: un dialecto falso en lugar de pg. */
    @Optional() @Inject(PG_DIALECT) private readonly dialectOverride?: Dialect,
  ) {}

  private async kysely(): Promise<Kysely<KyselyDb>> {
    if (this.db) return this.db
    let dialect = this.dialectOverride
    if (!dialect) {
      if (!this.config.db.url) throw DomainError.internal(new Error("DB_ADAPTER=pg sin DATABASE_URL"))
      const { Pool } = await import("pg")
      dialect = new PostgresDialect({ pool: new Pool({ connectionString: this.config.db.url, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 }) })
    }
    return (this.db = new Kysely<KyselyDb>({ dialect }))
  }

  /** Corre `fn` en una transacción con el contexto RLS del alcance. */
  async tx<T>(scope: DbScope, fn: (trx: Trx) => Promise<T>): Promise<T> {
    if (scope.kind === "system") this.log.debug({ reason: scope.reason }, "SystemScope (pg)")
    const db = await this.kysely()
    try {
      return await db.transaction().execute(async (trx) => {
        await applyScope(trx, scope)
        return fn(trx)
      })
    } catch (e) {
      throw DomainError.fromPg(e)
    }
  }

  async ping(): Promise<{ ok: boolean; msg?: string }> {
    try {
      const db = await this.kysely()
      await sql`select 1`.execute(db)
      return { ok: true }
    } catch (e) {
      return { ok: false, msg: `Postgres no responde (${(e as Error).name})` }
    }
  }

  async onApplicationShutdown() {
    await this.db?.destroy()
  }
}
