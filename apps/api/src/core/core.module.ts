// Núcleo de la API (F2-B): configuración, contexto, autenticación, guardas, base de datos, errores, límites,
// idempotencia, colas, eventos, cifrado y salud. Global: los módulos de negocio solo importan lo suyo.
import { type DynamicModule, Global, Module, type Provider } from "@nestjs/common"
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core"
import { TsRestModule } from "@ts-rest/nest"
import { ClsModule } from "nestjs-cls"
import type { Logger } from "pino"
import { AuthGuard } from "./auth/auth.guard"
import { ChainVerifier } from "./auth/chain.verifier"
import { GoogleOidcVerifier, OidcVerifier, SchedulerGuard } from "./auth/scheduler.guard"
import { SupabaseJwtVerifier } from "./auth/supabase-jwt.verifier"
import { TokenVerifier } from "./auth/token-verifier"
import { AppConfig } from "./config/app-config"
import type { Config } from "./config/config.schema"
import { SupabaseJsAppContextRepo } from "./context/adapters/supabase-js.app-context.repo"
import { AppContextRepo } from "./context/app-context.repo"
import { AppContextService } from "./context/app-context.service"
import { BookGuard } from "./context/book.guard"
import { setupContext } from "./context/cls-setup"
import { PlatformAdminGuard } from "./context/platform-admin.guard"
import { RequestContextService } from "./context/request-context.service"
import { CryptoService } from "./crypto/crypto.service"
import { DbHealth } from "./db/db-health"
import { PgKyselyFactory } from "./db/pg-kysely.factory"
import { PostgrestFactory } from "./db/postgrest.factory"
import { SupabaseJsFactory } from "./db/supabase-js.factory"
import { AllExceptionsFilter } from "./errors/all-exceptions.filter"
import { ErrorReporter, NoopErrorReporter } from "./errors/error-reporter"
import { ObjectStoreModule } from "./files/object-store.module"
import { EventsService } from "./events/events.service"
import { ReadinessService } from "./health/readiness.service"
import { IdempotencyInterceptor } from "./idempotency/idempotency.interceptor"
import { IdempotencyStore, MemoryIdempotencyStore, SupabaseIdempotencyStore } from "./idempotency/idempotency.store"
import { Lifecycle } from "./lifecycle"
import { LOGGER } from "./logging/logger"
import { createQueue } from "./queue/factory"
import { QueuePort } from "./queue/queue.port"
import { DEFAULT_LIMIT_STORE, RateLimitGuard } from "./rate-limit/rate-limit.guard"
import { MemoryRateLimitStore, RateLimitStore, SupabaseRateLimitStore } from "./rate-limit/rate-limit.store"

export type CoreOptions = { config: Config; logger: Logger }

const EXPORTS = [
  AppConfig, LOGGER, RequestContextService, AppContextService, AppContextRepo, SupabaseJsFactory, PgKyselyFactory, PostgrestFactory, DbHealth,
  TokenVerifier, OidcVerifier, SchedulerGuard, PlatformAdminGuard, RateLimitStore, IdempotencyStore, QueuePort,
  EventsService, CryptoService, ErrorReporter, ReadinessService,
]

@Global()
@Module({})
export class CoreModule {
  static forRoot({ config, logger }: CoreOptions): DynamicModule {
    const providers: Provider[] = [
      { provide: AppConfig, useValue: config },
      { provide: LOGGER, useValue: logger },
      RequestContextService,
      AppContextService,
      { provide: AppContextRepo, useClass: SupabaseJsAppContextRepo },
      SupabaseJsFactory,
      PgKyselyFactory,
      PostgrestFactory,
      DbHealth,
      // v7 (V7-A): con AUTH_PROVIDER=mirai, cadena Better Auth (cookie/Bearer de sesión) → Supabase (JWT). Sin la
      // variable, el mismo SupabaseJwtVerifier de siempre.
      ...(process.env.AUTH_PROVIDER === "mirai" ? [SupabaseJwtVerifier, { provide: TokenVerifier, useClass: ChainVerifier }] : [{ provide: TokenVerifier, useClass: SupabaseJwtVerifier }]),
      { provide: OidcVerifier, useClass: GoogleOidcVerifier },
      SchedulerGuard,
      PlatformAdminGuard,
      { provide: DEFAULT_LIMIT_STORE, useValue: new MemoryRateLimitStore() },
      config.rateLimit.store === "supabase" ? { provide: RateLimitStore, useClass: SupabaseRateLimitStore } : { provide: RateLimitStore, useValue: new MemoryRateLimitStore() },
      config.idempotency.store === "supabase" ? { provide: IdempotencyStore, useClass: SupabaseIdempotencyStore } : { provide: IdempotencyStore, useValue: new MemoryIdempotencyStore() },
      {
        provide: QueuePort,
        // QUEUE_DRIVER: inline | cloudtasks | sqs | servicebus | http (core/queue/factory.ts, V7-F).
        useFactory: () => createQueue(config, logger),
      },
      EventsService,
      CryptoService,
      { provide: ErrorReporter, useClass: NoopErrorReporter },
      ReadinessService,
      Lifecycle,
      // Orden de las guardas globales: sesión → libro (membresía, rol y plan) → límites de tasa.
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: APP_GUARD, useClass: BookGuard },
      { provide: APP_GUARD, useClass: RateLimitGuard },
      { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
    ]
    return {
      module: CoreModule,
      imports: [
        ClsModule.forRoot({ global: true, middleware: { mount: true, setup: setupContext } }),
        // V7-E: ObjectStore global (OBJECT_STORE=supabase | gcs | s3 | azure-blob | memory).
        ObjectStoreModule,
        TsRestModule.register({ isGlobal: true, validateResponses: config.validateResponses }),
      ],
      providers,
      exports: EXPORTS,
    }
  }
}
