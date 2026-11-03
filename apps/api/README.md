# api — Mirai API (NestJS 11 + Fastify + ts-rest)

Back de Mirai para Cloud Run (fase 2). Diseño completo en `docs/arquitectura/v6-separacion-front-back.md` (§2, §6 y §8).
**F2-B** dejó el esqueleto: arranque, núcleo transversal, autenticación, guardas, todos los módulos como stubs y un
módulo de ejemplo de punta a punta (`modules/catalogs`). Los demás frentes (F2-C…F2-I) llenan **solo su carpeta**.

## Correr en local

```bash
pnpm --filter api dev          # compila con esbuild+swc, arranca en :8080 y reinicia al guardar
pnpm --filter api build        # dist/main.js (empaqueta @mirai/*; las dependencias de npm quedan externas)
pnpm --filter api start        # node dist/main.js
pnpm --filter api test         # Vitest: unitarias (src/**) + integración con dobles (test/**) + prueba previa ts-rest
pnpm --filter api typecheck && pnpm --filter api lint
```

- En local lee la `.env.local` de la raíz (la misma de la web: acepta `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Variables: `apps/api/.env.example`.
- Probar: `curl localhost:8080/healthz` · `curl localhost:8080/readyz` · `http://localhost:8080/docs` (OpenAPI) ·
  `curl -H "Authorization: Bearer <access_token de Supabase>" localhost:8080/v1/me`.
- **Ojo:** con un token real, `/v1/me` y `/v1/books/:id/categories` leen la base compartida (pruebas = producción y está
  saturada). Las pruebas automáticas NO la tocan: usan dobles.

### Docker (igual que Cloud Run)

```bash
docker build -f apps/api/Dockerfile -t mirai-api .        # desde la raíz del monorepo
docker run --rm -p 8080:8080 -e SUPABASE_URL=… -e SUPABASE_PUBLISHABLE_KEY=… -e ENCRYPTION_KEY=… mirai-api
```

Multi-etapa: `turbo prune api --docker` → `pnpm install --frozen-lockfile --ignore-scripts` → build →
`pnpm deploy --prod --legacy` → `node:22-slim` con usuario `node` (uid 1000), solo `dist/` y dependencias de
producción, `PORT` (8080 por defecto). Contexto filtrado por `Dockerfile.dockerignore` (nunca entran `.env*`).
Despliegue mínimo: `apps/api/cloudbuild.yaml` (Artifact Registry + `gcloud run deploy` con `--set-secrets`).

## Estructura

```
src/
  main.ts            arranque: otel → .env.local (solo local) → enableZodEs() → config zod → Nest+Fastify → listen
  otel.ts            OpenTelemetry (http + undici) si OTEL_TRACES_EXPORTER está definido; se importa primero
  app.module.ts      CoreModule + módulos según MODE (api | realtime)
  app.setup.ts       Fastify (bodyLimit 8 MB, trustProxy, rawBody), CORS, cabeceras, log de acceso
  core/
    config/          esquema zod de las variables (falla al arrancar; el error nombra variables, nunca valores)
    auth/            TokenVerifier (puerto) · SupabaseJwtVerifier (JWKS ES256; HS256 opcional) · AuthGuard · @Public
                     SchedulerGuard (OIDC de Google o Bearer CRON_SECRET) · @Scheduler()
    context/         RequestContext (nestjs-cls) · AppContextService (caché 30 s) · AppContextRepo (puerto + supabase-js)
                     BookGuard (global en rutas :bookId) · @MinRole · @Can · @Premium · @PlatformAdmin
    db/              DbScope (UserScope | SystemScope) · SupabaseJsFactory (JWT + x-mirai-enlaces) ·
                     PgKyselyFactory (tx con set local role + set_config) · repoProvider (DB_ADAPTER) · DbHealth
    errors/          DomainError (+ fromPg) · filtro global → { ok:false, msg, code, requestId, details? } · ErrorReporter
    logging/         pino con formato de Cloud Logging (severity, httpRequest, trace) · qué se oculta (secretos, montos)
    rate-limit/      @RateLimit(nombre, user|household|ip) con LIMITS · límite general en memoria · rate_limit_hit
    idempotency/     @Idempotent() + Idempotency-Key · almacén en memoria o tabla api_idempotency
    queue/           QueuePort · InlineQueue (local) · CloudTasksQueue (REST + OIDC)
    events/          EventsService (suscriptores en proceso; gateway y outbox llegan en F2-G/F2-E)
    crypto/          CryptoService sobre @mirai/crypto (mismo formato v1 de la v5)
    health/          ReadinessService (/readyz: base, JWKS y ENCRYPTION_KEY; caché 5 s)
  modules/
    index.ts         lista de los 32 módulos (31 de packages/contracts + book-tables) con su dueño
    me/              GET /v1/me (F2-B, completo)
    catalogs/        ejemplo completo: contrato → controller → service → repository (puerto) → adaptadores
    jobs/            POST /v1/jobs/notify/tick (esqueleto protegido; F2-E lo llena)
    health/          /healthz, /readyz, /v1/version, /docs
    <los demás>/     stubs vacíos (@Module({})) con su dueño en el comentario
test/
  setup/             env (reflect-metadata + zod en español), tokens (JWKS locales ES256/RS256), fixtures (5 roles),
                     fakes (repositorios), probe.module (rutas para probar guardas), app.ts (createTestApp)
  app.int.test.ts    integración de punta a punta con Fastify inject (sin red ni base)
  spike/             prueba previa F2-A-6 (ts-rest + zod 4)
```

## Cómo se escribe un módulo (copia `modules/catalogs`)

1. **Contrato** en `packages/contracts/src/modules/<módulo>.ts` (zod 4 + `initContract().router`, `COMMON_ERRORS` en
   `responses`) y agrégalo a `packages/contracts/src/api.ts` (cliente del front y OpenAPI).
2. **Controller**: `@TsRestHandler(contrato.ruta)` + reglas (`@MinRole`, `@Can`, `@Premium`, `@RateLimit`,
   `@Idempotent`) y **un** método del servicio. Sin lógica.
3. **Service**: reglas de negocio y `@mirai/domain`; lee `RequestContextService` (`ctx.user`, `ctx.book`, `ctx.db`).
   Lanza `DomainError` con mensajes en español. No conoce Supabase.
4. **Repository** (clase abstracta = puerto) con métodos que reciben `DbScope`; **adaptadores**
   `adapters/supabase-js.<m>.repo.ts` (hoy) y `adapters/pg-kysely.<m>.repo.ts` (Cloud SQL); `repoProvider(Port, …)`.
5. **Pruebas**: unitarias del servicio con un repositorio falso y del adaptador con un cliente falso; integración en
   `test/` con `createTestApp()` (override del puerto). Nunca contra la base compartida.

Reglas que ya aplica el núcleo:
- Toda ruta pide `Authorization: Bearer <JWT de Supabase>` salvo `@Public()`/`@Scheduler()`.
- Toda ruta con `:bookId` pasa por **BookGuard**: si la persona no es miembro → 404 "No encontramos ese libro."; guarda
  libro, rol fino y plan en el contexto. `@MinRole/@Can/@Premium` fuera de una ruta con `:bookId` = error 500 (del código).
- Errores: `UNAUTHENTICATED` 401 · `ROLE_DENIED` 403 ("Tu rol no permite…") · `PLAN_REQUIRED` 402 · `VALIDATION` 400
  (campos en español) · `NOT_FOUND` 404 · `CONFLICT` 409 · `RATE_LIMITED` 429 (+ `Retry-After`) · `UPSTREAM` 502 ·
  `INTERNAL` 500 (mensaje genérico + `requestId`; el detalle solo en el log).
- Logs: una línea JSON por petición (`httpRequest`, `requestId`, `userId`, `householdId`, `bookId`,
  `logging.googleapis.com/trace`); nunca tokens, cuerpos ni montos.
- `SystemScope` (clave secreta, salta RLS) solo para cron, webhooks, portal del contador, admin, límites e idempotencia,
  siempre con `reason`.

## Decisiones de F2-B (respecto al documento)

- **swc para decoradores**: Vitest usa `unplugin-swc` y la compilación usa esbuild + el plugin esbuild de
  `unplugin-swc` (empaqueta `@mirai/*`, que exportan TypeScript). `@mirai/*` son devDependencies: van dentro de
  `dist/main.js`, así `pnpm deploy --prod` no los copia.
- **Sin `@nestjs/config`, `@nestjs/terminus`, `@nestjs/throttler` ni `nestjs-pino`**: el esquema zod, `/readyz`, la guarda
  de límites (con `LIMITS` y `rate_limit_hit`) y pino con formato de Cloud Logging son pocos archivos propios y
  evitan dependencias que no aportan aquí. `nestjs-cls` sí (contexto por petición).
- **OpenTelemetry por OTLP** (variables estándar `OTEL_*`; en Cloud Run, colector como *sidecar* → Cloud Trace).
  `@google-cloud/opentelemetry-cloud-trace-exporter` 3.1 exige `@opentelemetry/core` 2.x y el SDK actual es 3.x.
- **Sentry**: puerto `ErrorReporter` (hoy no-op; los errores ya salen con `stack_trace` para Error Reporting).
- **Idempotencia y límites**: en memoria por defecto. `IDEMPOTENCY_STORE=supabase` necesita la migración
  `20261103003800_api_idempotency.sql` (**escrita, no aplicada**). `RATE_LIMIT_STORE=supabase` usa `rate_limit_hit` (ya
  existe) y es el valor por defecto fuera de local.
- **Cloud Tasks por REST** (token del servidor de metadatos), sin `@google-cloud/tasks`.
- Versiones fijas: `@ts-rest/*@3.53.0-rc.1` (única con zod 4) y NestJS 11 (decisión D2).
