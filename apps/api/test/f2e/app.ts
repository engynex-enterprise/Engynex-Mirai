// App de prueba de F2-E: la de F2-B (createTestApp) con los puertos de avisos, integraciones, Google, automatizaciones
// y trabajos reemplazados por dobles, una cola en proceso sin despacho (solo registra) y ServicesEnv fijo.
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import { Test } from "@nestjs/testing"
import { AppModule } from "../../src/app.module"
import { configureApp, fastifyAdapter } from "../../src/app.setup"
import { JoseOidcVerifier, OidcVerifier } from "../../src/core/auth/scheduler.guard"
import { staticJwks } from "../../src/core/auth/jwks"
import { JoseTokenVerifier } from "../../src/core/auth/supabase-jwt.verifier"
import { TokenVerifier } from "../../src/core/auth/token-verifier"
import { loadConfig } from "../../src/core/config/config.schema"
import { AppContextRepo } from "../../src/core/context/app-context.repo"
import { DbHealth } from "../../src/core/db/db-health"
import { createLogger } from "../../src/core/logging/logger"
import { InlineQueue } from "../../src/core/queue/inline.queue"
import { QueuePort } from "../../src/core/queue/queue.port"
import { AutomationsRunner } from "../../src/modules/automations/automations.port"
import { GooglePort } from "../../src/modules/google/google.port"
import { IntegrationsPort } from "../../src/modules/integrations/integrations.port"
import { ServicesEnv, ServicesEnvSchema } from "../../src/modules/integrations/services-env"
import { NotifyJobs } from "../../src/modules/jobs/jobs.port"
import { DeliveryPort } from "../../src/modules/notifications/delivery/delivery.port"
import { CRON_SECRET, SCHEDULER_SA, TEST_KEY } from "../setup/app"
import { FakeAppContextRepo } from "../setup/fakes"
import { AUDIENCE, ISSUER, signers } from "../setup/tokens"
import { FakeAutomations, FakeDelivery, FakeGoogle, FakeIntegrations, FakeNotifyJobs } from "./fakes"

export const STATE_KEY = "llave-hmac-del-state-de-google-de-prueba-0123456789"
export const SITE = "https://mirai.test"
export const API = "https://api-pruebas.mirai.test"

export async function createF2eApp() {
  const config = loadConfig({
    MIRAI_ENV: "local", SUPABASE_URL: "https://proyecto-prueba.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prueba",
    ENCRYPTION_KEY: TEST_KEY, CRON_SECRET, SCHEDULER_AUDIENCE: API, SCHEDULER_SERVICE_ACCOUNTS: SCHEDULER_SA,
    WEB_ORIGINS: SITE, LOG_LEVEL: "silent", RATE_LIMIT_DEFAULT_PER_MIN: "1000",
  })
  const logs: Record<string, unknown>[] = []
  const logger = createLogger({ level: "debug", service: "mirai-api", version: "test", destination: { write: (s: string) => void logs.push(JSON.parse(s)) } })
  const { supabase, google } = await signers()
  const f = { jobs: new FakeNotifyJobs(), automations: new FakeAutomations(), delivery: new FakeDelivery(), integrations: new FakeIntegrations(), google: new FakeGoogle(), queue: new InlineQueue() }
  const env = ServicesEnvSchema.parse({ MIRAI_ENV: "local", SITE_URL: SITE, API_PUBLIC_URL: API, GOOGLE_OAUTH_STATE_KEY: STATE_KEY })

  const mod = await Test.createTestingModule({ imports: [AppModule.register({ config, logger })] })
    .overrideProvider(TokenVerifier).useValue(new JoseTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks: staticJwks(supabase.jwks) }))
    .overrideProvider(OidcVerifier).useValue(new JoseOidcVerifier(google.jwks))
    .overrideProvider(AppContextRepo).useValue(new FakeAppContextRepo())
    .overrideProvider(DbHealth).useValue({ check: async () => ({ ok: true }) })
    .overrideProvider(QueuePort).useValue(f.queue)
    .overrideProvider(ServicesEnv).useValue({ values: env })
    .overrideProvider(NotifyJobs).useValue(f.jobs)
    .overrideProvider(AutomationsRunner).useValue(f.automations)
    .overrideProvider(DeliveryPort).useValue(f.delivery)
    .overrideProvider(IntegrationsPort).useValue(f.integrations)
    .overrideProvider(GooglePort).useValue(f.google)
    .compile()

  const app = mod.createNestApplication<NestFastifyApplication>(fastifyAdapter(config), { rawBody: true, logger: false })
  configureApp(app, config, logger)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
  return { app, logs, ...f, get: <T>(t: abstract new (...a: never[]) => T) => app.get(t as never) as T, close: () => app.close() }
}
export type F2eApp = Awaited<ReturnType<typeof createF2eApp>>
