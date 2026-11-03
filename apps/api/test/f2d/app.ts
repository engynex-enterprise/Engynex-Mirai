// App de prueba de F2-D: la app real (AppModule + configureApp) con BookStore, la lectura de partes, la IA de gastos y
// los respaldos reemplazados por dobles en memoria. Igual que test/setup/app.ts para tokens y contexto (5 roles).
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import { Test } from "@nestjs/testing"
import type { LiveChange } from "@mirai/contracts/live"
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
import { BookStore } from "../../src/modules/book-tables/book-store"
import { BookTablesRepo } from "../../src/modules/book-tables/book-tables.repository"
import { ExpenseClassifier } from "../../src/modules/expenses/expense-classifier"
import { BackupStorage } from "../../src/modules/import/backup-storage"
import { FakeAppContextRepo } from "../setup/fakes"
import { USERS } from "../setup/fixtures"
import { AUDIENCE, ISSUER, signers, userToken } from "../setup/tokens"
import { FakeBackups, FakeBookStore, FakeBookTablesRepoW, FakeClassifier } from "./fakes"

export type F2dApp = Awaited<ReturnType<typeof createF2dApp>>
export type Role = keyof typeof USERS

export async function createF2dApp() {
  const config = loadConfig({
    MIRAI_ENV: "local",
    SUPABASE_URL: "https://proyecto-prueba.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prueba",
    ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    CRON_SECRET: "secreto-de-cron-de-prueba-123",
    WEB_ORIGINS: "https://mirai.engynex.com,http://localhost:3000",
    LOG_LEVEL: "silent",
    RATE_LIMIT_DEFAULT_PER_MIN: "10000",
  })
  const logger = createLogger({ level: "silent", service: "mirai-api", version: "test", destination: { write: () => undefined } })
  const { supabase, google } = await signers()
  const store = new FakeBookStore()
  const fx = { store, tables: new FakeBookTablesRepoW(store), classifier: new FakeClassifier(), backups: new FakeBackups() }

  const mod = await Test.createTestingModule({ imports: [AppModule.register({ config, logger })] })
    .overrideProvider(TokenVerifier).useValue(new JoseTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks: staticJwks(supabase.jwks) }))
    .overrideProvider(OidcVerifier).useValue(new JoseOidcVerifier(google.jwks))
    .overrideProvider(AppContextRepo).useValue(new FakeAppContextRepo())
    .overrideProvider(DbHealth).useValue({ check: async () => ({ ok: true }) })
    .overrideProvider(BookStore).useValue(fx.store)
    .overrideProvider(BookTablesRepo).useValue(fx.tables)
    .overrideProvider(ExpenseClassifier).useValue(fx.classifier)
    .overrideProvider(BackupStorage).useValue(fx.backups)
    .compile()

  const app = mod.createNestApplication<NestFastifyApplication>(fastifyAdapter(config), { rawBody: true, logger: false })
  configureApp(app, config, logger)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()

  const changes: LiveChange[] = []
  app.get(EventsService).subscribe((c) => void changes.push(c))

  const tokens = new Map<Role, string>()
  const headers = async (role: Role, extra: Record<string, string> = {}) => {
    if (!tokens.has(role)) tokens.set(role, await userToken(USERS[role]))
    return { authorization: `Bearer ${tokens.get(role)}`, ...extra }
  }
  const call = async (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, role: Role = "editor", body?: unknown, extra: Record<string, string> = {}) => {
    const res = await app.inject({ method, url, headers: await headers(role, extra), ...(body !== undefined ? { payload: body as object } : {}) })
    return { status: res.statusCode, body: res.body ? (JSON.parse(res.body) as Record<string, unknown> & { data?: unknown }) : null, headers: res.headers }
  }
  return { app, fx, changes, call, close: () => app.close() }
}
