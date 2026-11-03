// App de prueba (F2-B-10): la app real (AppModule + configureApp) con los puertos externos reemplazados por dobles:
// JWT con un JWKS local, contexto y catálogos en memoria y salud de la base simulada. Sin red ni base.
import type { DynamicModule, Type } from "@nestjs/common"
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import { Test } from "@nestjs/testing"
import { AppModule } from "../../src/app.module"
import { configureApp, fastifyAdapter } from "../../src/app.setup"
import { JoseOidcVerifier, OidcVerifier } from "../../src/core/auth/scheduler.guard"
import { staticJwks } from "../../src/core/auth/jwks"
import { JoseTokenVerifier } from "../../src/core/auth/supabase-jwt.verifier"
import { TokenVerifier } from "../../src/core/auth/token-verifier"
import { loadConfig, type Config } from "../../src/core/config/config.schema"
import { AppContextRepo } from "../../src/core/context/app-context.repo"
import { DbHealth } from "../../src/core/db/db-health"
import { createLogger } from "../../src/core/logging/logger"
import { CatalogsRepo } from "../../src/modules/catalogs/catalogs.repository"
import { FakeAppContextRepo, FakeCatalogsRepo } from "./fakes"
import { AUDIENCE, ISSUER, signers } from "./tokens"

export const TEST_KEY = Buffer.alloc(32, 7).toString("base64")
export const CRON_SECRET = "secreto-de-cron-de-prueba-123"
export const SCHEDULER_SA = "mirai-scheduler@proyecto.iam.gserviceaccount.com"

export type TestApp = {
  app: NestFastifyApplication
  logs: Record<string, unknown>[]
  contextRepo: FakeAppContextRepo
  catalogs: FakeCatalogsRepo
  db: { ok: boolean }
  close(): Promise<void>
}

export async function createTestApp(o: { env?: Record<string, string>; modules?: (Type | DynamicModule)[] } = {}): Promise<TestApp> {
  const config = loadConfig({
    MIRAI_ENV: "local",
    SUPABASE_URL: "https://proyecto-prueba.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prueba",
    ENCRYPTION_KEY: TEST_KEY,
    CRON_SECRET,
    SCHEDULER_AUDIENCE: "https://api-pruebas.mirai.test",
    SCHEDULER_SERVICE_ACCOUNTS: SCHEDULER_SA,
    WEB_ORIGINS: "https://mirai.engynex.com,https://engynex-mirai-*.vercel.app",
    LOG_LEVEL: "debug",
    GCP_PROJECT: "mirai-pruebas",
    RATE_LIMIT_DEFAULT_PER_MIN: "1000",
    ...o.env,
  })
  const logs: Record<string, unknown>[] = []
  const logger = createPino(logs, config)
  const { supabase, google } = await signers()
  const contextRepo = new FakeAppContextRepo()
  const catalogs = new FakeCatalogsRepo()
  const db = { ok: true }

  const mod = await Test.createTestingModule({ imports: [AppModule.register({ config, logger }), ...(o.modules ?? [])] })
    .overrideProvider(TokenVerifier)
    .useValue(new JoseTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks: staticJwks(supabase.jwks) }))
    .overrideProvider(OidcVerifier)
    .useValue(new JoseOidcVerifier(google.jwks))
    .overrideProvider(AppContextRepo)
    .useValue(contextRepo)
    .overrideProvider(CatalogsRepo)
    .useValue(catalogs)
    .overrideProvider(DbHealth)
    .useValue({ check: async () => (db.ok ? { ok: true } : { ok: false, msg: "PostgREST respondió 503" }) })
    .compile()

  const app = mod.createNestApplication<NestFastifyApplication>(fastifyAdapter(config), { rawBody: true, logger: false })
  configureApp(app, config, logger)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
  return { app, logs, contextRepo, catalogs, db, close: () => app.close() }
}

function createPino(logs: Record<string, unknown>[], config: Config) {
  return createLogger({ level: "debug", service: "mirai-api", version: "test", project: config.gcpProject, destination: { write: (s: string) => void logs.push(JSON.parse(s)) } })
}
