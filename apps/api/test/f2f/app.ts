// App de prueba de F2-F: la de F2-B (AppModule + configureApp) con los puertos de IA, chat y archivos reemplazados por
// dobles (sin proveedor de IA ni base) y el JWKS local.
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
import { EventsService } from "../../src/core/events/events.service"
import { createLogger } from "../../src/core/logging/logger"
import { AiFiles } from "../../src/modules/ai/ai-files"
import { AiAdminPort, AiPort } from "../../src/modules/ai/ai.port"
import { ChatPort, ChatWritesPort } from "../../src/modules/chat/chat.port"
import { CRON_SECRET, SCHEDULER_SA, TEST_KEY } from "../setup/app"
import { FakeAppContextRepo } from "../setup/fakes"
import { AUDIENCE, ISSUER, signers } from "../setup/tokens"
import { FakeAi, FakeAiAdmin, FakeChat, FakeFiles, FakeWrites } from "./fakes"

export const SITE = "https://mirai.test"

export async function createF2fApp() {
  const config = loadConfig({
    MIRAI_ENV: "local", SUPABASE_URL: "https://proyecto-prueba.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prueba",
    ENCRYPTION_KEY: TEST_KEY, CRON_SECRET, SCHEDULER_AUDIENCE: "https://api-pruebas.mirai.test", SCHEDULER_SERVICE_ACCOUNTS: SCHEDULER_SA,
    WEB_ORIGINS: SITE, LOG_LEVEL: "silent", RATE_LIMIT_DEFAULT_PER_MIN: "1000",
  })
  const logger = createLogger({ level: "silent", service: "mirai-api", version: "test", destination: { write: () => {} } })
  const { supabase, google } = await signers()
  const writes = new FakeWrites()
  const f = { ai: new FakeAi(), admin: new FakeAiAdmin(), files: new FakeFiles(), writes, chat: new FakeChat(writes) }

  const mod = await Test.createTestingModule({ imports: [AppModule.register({ config, logger })] })
    .overrideProvider(TokenVerifier).useValue(new JoseTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks: staticJwks(supabase.jwks) }))
    .overrideProvider(OidcVerifier).useValue(new JoseOidcVerifier(google.jwks))
    .overrideProvider(AppContextRepo).useValue(new FakeAppContextRepo())
    .overrideProvider(DbHealth).useValue({ check: async () => ({ ok: true }) })
    .overrideProvider(AiPort).useValue(f.ai)
    .overrideProvider(AiAdminPort).useValue(f.admin)
    .overrideProvider(AiFiles).useValue(f.files)
    .overrideProvider(ChatWritesPort).useValue(f.writes)
    .overrideProvider(ChatPort).useValue(f.chat)
    .compile()

  const app = mod.createNestApplication<NestFastifyApplication>(fastifyAdapter(config), { rawBody: true, logger: false })
  configureApp(app, config, logger)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
  return { app, ...f, events: app.get(EventsService), close: () => app.close() }
}
export type F2fApp = Awaited<ReturnType<typeof createF2fApp>>
