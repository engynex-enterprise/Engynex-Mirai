// App de prueba de V7-G: la app real (AppModule + configureApp) con RowStore, BookStore y los demás puertos externos
// reemplazados por dobles en memoria. Sin red ni base (la compartida está saturada y es la de producción).
// `overrides`: más puertos a reemplazar (p. ej. [IdentityAdmin, new FakeIdentity()]).
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import { Test } from "@nestjs/testing"
import type { LiveChange } from "@mirai/contracts/live"
import type { RawAppContext } from "@mirai/domain/app-context"
import { AppModule } from "../../src/app.module"
import { configureApp, fastifyAdapter } from "../../src/app.setup"
import { JoseOidcVerifier, OidcVerifier } from "../../src/core/auth/scheduler.guard"
import { staticJwks } from "../../src/core/auth/jwks"
import { JoseTokenVerifier } from "../../src/core/auth/supabase-jwt.verifier"
import { TokenVerifier } from "../../src/core/auth/token-verifier"
import { loadConfig } from "../../src/core/config/config.schema"
import { AppContextRepo } from "../../src/core/context/app-context.repo"
import { DbHealth } from "../../src/core/db/db-health"
import { EventsService } from "../../src/core/events/events.service"
import { createLogger } from "../../src/core/logging/logger"
import { RowStore } from "../../src/core/store/row-store"
import { BookStore } from "../../src/modules/book-tables/book-store"
import { BookTablesRepo } from "../../src/modules/book-tables/book-tables.repository"
import { ExpenseClassifier } from "../../src/modules/expenses/expense-classifier"
import { BackupStorage } from "../../src/modules/import/backup-storage"
import { FakeBackups, FakeBookStore, FakeBookTablesRepoW, FakeClassifier } from "../f2d/fakes"
import { FakeAppContextRepo } from "../setup/fakes"
import { rawFor, USERS } from "../setup/fixtures"
import { AUDIENCE, ISSUER, signers, userToken } from "../setup/tokens"
import { MemoryRowStore } from "./memory-row-store"

export type V7gApp = Awaited<ReturnType<typeof createV7gApp>>
export type Role = keyof typeof USERS
type Token = Parameters<ReturnType<typeof Test.createTestingModule>["overrideProvider"]>[0]

export async function createV7gApp(o: { overrides?: [Token, unknown][]; env?: Record<string, string>; context?: (userId: string) => RawAppContext } = {}) {
  const config = loadConfig({
    MIRAI_ENV: "local",
    SUPABASE_URL: "https://proyecto-prueba.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prueba",
    ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    CRON_SECRET: "secreto-de-cron-de-prueba-123",
    WEB_ORIGINS: "https://mirai.engynex.com,http://localhost:3000",
    LOG_LEVEL: "silent",
    RATE_LIMIT_DEFAULT_PER_MIN: "10000",
    ...o.env,
  })
  const logger = createLogger({ level: "silent", service: "mirai-api", version: "test", destination: { write: () => undefined } })
  const { supabase, google } = await signers()
  const book = new FakeBookStore()
  const fx = { rows: new MemoryRowStore(), book, tables: new FakeBookTablesRepoW(book), classifier: new FakeClassifier(), backups: new FakeBackups(), context: new FakeAppContextRepo(o.context ?? rawFor) }

  let b = Test.createTestingModule({ imports: [AppModule.register({ config, logger })] })
    .overrideProvider(TokenVerifier).useValue(new JoseTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks: staticJwks(supabase.jwks) }))
    .overrideProvider(OidcVerifier).useValue(new JoseOidcVerifier(google.jwks))
    .overrideProvider(AppContextRepo).useValue(fx.context)
    .overrideProvider(DbHealth).useValue({ check: async () => ({ ok: true }) })
    .overrideProvider(RowStore).useValue(fx.rows)
    .overrideProvider(BookStore).useValue(fx.book)
    .overrideProvider(BookTablesRepo).useValue(fx.tables)
    .overrideProvider(ExpenseClassifier).useValue(fx.classifier)
    .overrideProvider(BackupStorage).useValue(fx.backups)
  for (const [token, value] of o.overrides ?? []) b = b.overrideProvider(token).useValue(value)
  const mod = await b.compile()

  const app = mod.createNestApplication<NestFastifyApplication>(fastifyAdapter(config), { rawBody: true, logger: false })
  configureApp(app, config, logger)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()

  const changes: LiveChange[] = []
  app.get(EventsService).subscribe((c) => void changes.push(c))

  const tokens = new Map<Role, string>()
  const headers = async (role: Role | null, extra: Record<string, string> = {}) => {
    if (!role) return extra
    if (!tokens.has(role)) tokens.set(role, await userToken(USERS[role]))
    return { authorization: `Bearer ${tokens.get(role)}`, ...extra }
  }
  /** Llama a la API como `role` (null = sin sesión) y devuelve código, cuerpo (JSON si lo es) y cabeceras. */
  const call = async (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, role: Role | null = "owner", body?: unknown, extra: Record<string, string> = {}) => {
    const res = await app.inject({ method, url, headers: await headers(role, extra), ...(body !== undefined ? { payload: body as object } : {}) })
    let parsed: unknown = res.body
    try {
      parsed = res.body ? JSON.parse(res.body) : null
    } catch {
      /* texto plano (ads.txt) */
    }
    return { status: res.statusCode, body: parsed as Record<string, unknown> & { data?: unknown; ok?: boolean; msg?: string; code?: string }, headers: res.headers, raw: res.body }
  }
  return { app, fx, changes, call, close: () => app.close() }
}
