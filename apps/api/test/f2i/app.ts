// App de prueba de F2-I: la app real (AppModule + configureApp, como test/setup/app.ts) con los puertos de hogar,
// cuenta, planes, consola y portal reemplazados por dobles en memoria. Sin red, sin base y sin cobros reales.
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
import { AccountRepo } from "../../src/modules/account/account.repository"
import { IdentityAdmin } from "../../src/modules/account/identity-admin"
import { AdminRepo } from "../../src/modules/admin/admin.repository"
import { PlatformMailer } from "../../src/modules/admin/platform-mailer"
import { BillingConfig, type BillingEnv } from "../../src/modules/billing/billing.config"
import { BillingRepo } from "../../src/modules/billing/billing.repository"
import { MercadoPagoClient } from "../../src/modules/billing/mercadopago.client"
import { HouseholdsRepo } from "../../src/modules/households/households.repository"
import { HouseholdMessenger, StoragePurge } from "../../src/modules/households/ports"
import { SiteUrl } from "../../src/modules/households/site-url"
import { AccountantRepo } from "../../src/modules/tax/accountant.repository"
import { FakeAppContextRepo } from "../setup/fakes"
import { AUDIENCE, ISSUER, signers } from "../setup/tokens"
import { FakeAccountantRepo, FakeAccountRepo, FakeAdminRepo, FakeBillingRepo, FakeHouseholdsRepo, FakeIdentity, FakeMailer, FakeMercadoPago, FakePurge, SpyMessenger } from "./fakes"

export const SITE = "https://mirai.test"
export const BILLING: BillingEnv = {
  mercadopagoToken: "TEST-token-de-prueba",
  mercadopagoWebhookSecret: "secreto-webhook-mp",
  wompiPublicKey: "pub_test_123",
  wompiIntegritySecret: "test_integrity_abc",
  wompiEventsSecret: "test_events_xyz",
  production: false,
}

export type F2iApp = Awaited<ReturnType<typeof createF2iApp>>

export async function createF2iApp(o: { billing?: Partial<BillingEnv> } = {}) {
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
  const fx = {
    households: new FakeHouseholdsRepo(),
    billing: new FakeBillingRepo(),
    mp: new FakeMercadoPago(),
    account: new FakeAccountRepo(),
    identity: new FakeIdentity(),
    admin: new FakeAdminRepo(),
    accountant: new FakeAccountantRepo(),
    purge: new FakePurge(),
    messenger: new SpyMessenger(),
    mailer: new FakeMailer(),
  }
  const billingCfg = Object.assign(Object.create(BillingConfig.prototype) as BillingConfig, { env: { ...BILLING, ...o.billing } })
  const site = Object.assign(Object.create(SiteUrl.prototype) as SiteUrl, { base: SITE })

  const mod = await Test.createTestingModule({ imports: [AppModule.register({ config, logger })] })
    .overrideProvider(TokenVerifier).useValue(new JoseTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks: staticJwks(supabase.jwks) }))
    .overrideProvider(OidcVerifier).useValue(new JoseOidcVerifier(google.jwks))
    .overrideProvider(AppContextRepo).useValue(new FakeAppContextRepo())
    .overrideProvider(DbHealth).useValue({ check: async () => ({ ok: true }) })
    .overrideProvider(HouseholdsRepo).useValue(fx.households)
    .overrideProvider(BillingRepo).useValue(fx.billing)
    .overrideProvider(MercadoPagoClient).useValue(fx.mp)
    .overrideProvider(AccountRepo).useValue(fx.account)
    .overrideProvider(IdentityAdmin).useValue(fx.identity)
    .overrideProvider(AdminRepo).useValue(fx.admin)
    .overrideProvider(AccountantRepo).useValue(fx.accountant)
    .overrideProvider(StoragePurge).useValue(fx.purge)
    .overrideProvider(HouseholdMessenger).useValue(fx.messenger)
    .overrideProvider(PlatformMailer).useValue(fx.mailer)
    .overrideProvider(BillingConfig).useValue(billingCfg)
    .overrideProvider(SiteUrl).useValue(site)
    .compile()

  const app = mod.createNestApplication<NestFastifyApplication>(fastifyAdapter(config), { rawBody: true, logger: false })
  configureApp(app, config, logger)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
  return { app, fx, close: () => app.close() }
}
