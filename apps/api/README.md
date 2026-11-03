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

## Tiempo real (F2-G, `MODE=realtime`)

Servicio aparte de Cloud Run (`mirai-realtime`) con la misma imagen. Código en `src/modules/realtime/`, protocolo en
`packages/contracts/src/modules/realtime.ts` y cliente sin React en `packages/contracts/src/realtime-client.ts`.

```bash
MODE=realtime PORT=8081 pnpm --filter api dev   # ws://localhost:8081/socket.io (token de Supabase en `auth.token`)
```

- **Autenticación**: el mismo `TokenVerifier` en el *handshake* (`auth: { token }` o `Authorization: Bearer`); origen
  revisado con `WEB_ORIGINS` (también en el *upgrade*). Cada `REALTIME_TOKEN_CHECK_S` (10 min) se revisan tokens
  (vencido → `auth:expired` + desconexión; el cliente renueva y vuelve) y membresías (ya no es miembro → `book:left`).
  `auth:refresh` cambia el token sin reconectar.
- **Salas**: `book:{id}` (todos los roles: "ver" es de todos), `book:{id}:{rol}` (eventos con rol mínimo,
  `LIVE_MIN_ROLE`), `household:{id}` y `user:{id}`. `join:book` usa `AppContextService.bookAccess` (la consulta de
  BookGuard). Un cambio en `household_members` revisa al instante las conexiones de ese hogar en todas las instancias.
- **Eventos** (equivalentes a Supabase Realtime): `change` (LIVE_TABLES por libro y HOUSEHOLD_TABLES por hogar),
  `notification` (la campana), `automation` (INSERT en `automation_events`, antes el canal `auto:{libro}`),
  `presence` (lista del libro), `resync` (se perdieron cambios: recargar) y `book:left`.
- **Fuentes**: `EventsService` (en `MODE=api`, `RealtimePublisherModule` lo publica en Redis con
  `@socket.io/redis-emitter`) y `PgLiveListener` (`LISTEN mirai_live`, una instancia por candado consultivo, latido y
  reconexión con `resync`). El trigger está en `supabase/migrations/20261103004100_live_notify.sql`: **escrita, no
  aplicada**; aunque se aplique solo crea funciones. Instalar solo en Supabase local o Cloud SQL:
  `select public.mirai_live_notify_install(true);` y `REALTIME_PG_LISTEN=1` + `REALTIME_DATABASE_URL` (conexión directa).
- **Escala**: sin `REDIS_URL`, una instancia en memoria con `connectionStateRecovery` (al volver recupera salas y eventos).
  Con `REDIS_URL` (Memorystore): `@socket.io/redis-adapter` (pub/sub, clave `mirai-rt`) + presencia en Redis
  (`presence:book:{id}`, TTL); el adaptador pub/sub no guarda sesiones, así que al reconectar el cliente recarga el libro.
  Cloud Run: `--session-affinity --timeout=3600 --min-instances=1 --concurrency=250 --set-env-vars=MODE=realtime,…`.
- **Front**: `apps/web/hooks/use-live.ts` elige la fuente; por defecto Supabase Realtime (nada cambia). Gateway solo con
  `NEXT_PUBLIC_LIVE_SOURCE=gateway` y `NEXT_PUBLIC_REALTIME_URL`.
- **Pruebas**: `src/modules/realtime/realtime.test.ts` (rutas, presencia, escucha, configuración, paridad de la
  migración) y `test/realtime/*` (app real en un puerto local con `socket.io-client`, 500 conexiones de carga).

## Avisos, integraciones, Google, cron y colas (F2-E)

El código de envíos vive en **`packages/services` (`@mirai/services`)**, el mismo que usa la web (sus archivos de
`lib/notify`, `lib/google*`, `features/integrations` y `lib/automations` lo re-exportan). La API lo configura en
`modules/integrations/services-runtime.ts` (SystemScope + `CryptoService` + `ServicesEnv`, variables en `.env.example`).

| Módulo | Rutas | Rol / plan |
|---|---|---|
| `integrations` | `GET/PUT/PATCH/DELETE /v1/books/:b/integrations[/:kind]` (solo IA; sin secretos) | ver: viewer · cambiar: admin |
| `notifications/delivery` | `GET/PUT …/notification-rules/me` · `GET …/notifications/channels` · `POST …/notifications/{test,digest-now,open}` · `POST …/telegram/{link,confirm}` · `DELETE …/telegram` · `GET/POST …/notifications/cobro-whatsapp` · `PUT/DELETE /v1/push/subscriptions` | viewer (cobro: editor); límites `pruebaAviso` y `cobroWa` |
| `google` | `GET …/google/connect-url` · `GET /v1/google/callback` (público, `state` HMAC) · `DELETE /v1/google` · `POST …/calendar/sync` · `GET …/calendar/status` | Premium `banco` para conectar y sincronizar |
| `jobs` | `POST /v1/jobs/notify/tick` · `…/notify/household/:h` · `…/plan/{emails,reminders}` · `…/refs/refresh` · `…/calendar/{sync,user/:u}` · `…/net-worth/monthly` · `…/automations/{hourly,drain,book/:b}` | `SchedulerGuard` (OIDC o `CRON_SECRET`) |
| `automations` | outbox: `EventsService` → `automations/book/:b` (1 s, `auto-<libro>-<segundo>`) | — |

- **Tick** (Scheduler `5 * * * *`): latido → una tarea por hogar `notify-<hogar>-<AAAAMMDDHH>` (cola `notify`) +
  `plan-emails` y `auto-hourly` de la hora; a las 6 `refs`, `gcal-sync` y `net-worth`, a las 9 `plan-reminders` (cola
  `slow`; `TICK_DAILY_TASKS=0` si Scheduler ya las llama). Simulación con `?dry=1` o `{ "dry": true }`: sin latido,
  tareas `dry-…` que calculan y no envían. Sin `SUPABASE_SECRET_KEY` (solo local) responde con una `nota`.
- **Callback de Google nuevo**: `<API_PUBLIC_URL>/v1/google/callback` hay que agregarlo en Google Cloud › Credenciales.
- Pruebas: `src/modules/{jobs,google,automations,integrations}/*.test.ts` y `test/f2e.int.test.ts` (arnés `test/f2e/`
  con dobles de los puertos; nunca contra la base compartida).
- Pendiente: `mail/scan` y probar/listar modelos de IA (F2-F), CRUD de automatizaciones (sigue en la web),
  `PlanRemindersPort` real (F2-I) y adaptadores Kysely (fase 4).

## Escrituras del libro (F2-D)

Todo con el JWT de la persona (UserScope: la RLS vuelve a revisar) y `x-mirai-enlaces: 1` (las cascadas de la base),
avisos de cambio con `EventsService.changed` (tiempo real y outbox de automatizaciones, `book-tables/cascades.ts`),
`Idempotency-Key` en los comandos y errores `{ ok:false, msg, code }` en español (los textos de las funciones de la
base salen con su código: «Sin permiso» → 403, «… no encontrado» → 404, «ya está pagado / enlazado» → 409).

- **Puerto `BookStore`** (`book-tables/book-store.ts`): find/rows/insert/update/single/upsertSingle/rpc con dos
  adaptadores (supabase-js hoy, Kysely en Cloud SQL). Uno compartido en vez de uno por módulo: las reglas viven en los
  servicios; lo que cambia entre módulos son tablas y RPC. `BookWritesService` reúne las revisiones (rol, filas propias,
  plan, esquema zod, referencias del mismo libro) para el CRUD genérico y los comandos.
- **CRUD genérico**: `PUT /v1/books/:b/t/:table/:id` (crear con el id del navegador o editar), `DELETE …/:id` (borrado
  lógico) y `POST …/:id/restore` («Deshacer»), con `BOOK_TABLE_POLICY` (revisada contra la RLS) y `BOOK_TABLE_SCHEMAS`
  (`packages/contracts/src/book-table-schemas.ts`, generado de los tipos de la base). Borrar no exige el plan; crear,
  editar y restaurar sí. Columnas del sistema y de enlaces nunca entran por aquí.

| Módulo | Rutas (`/v1/books/:b/…`) | Rol |
|---|---|---|
| `expenses` | `POST expenses` (reglas: categoría manual → regla → historial → palabras → IA, hormiga, deducible, medio por defecto, fondo para «Imprevistos», sugerencia de fijo) · `POST expenses/:id/{link-fixed,unlink-fixed,use-fund}` | registra (lo suyo) / editor |
| `incomes` | `POST incomes/plan` (planIngreso) · `POST incomes` (reparto por quincena; valor = promedio por pago; categoría del tipo) | viewer / registra |
| `fixed` | `POST fixed/:id/pay` · `DELETE fixed/payments/:id` · `POST subscriptions/:id/charge` | editor |
| `cards` | `POST cards/:id/purchases` · `POST cards/:id/payments` | editor |
| `loans` | `POST loans` (por tipo; quién presta sin duplicar; `acreedor` → regla de la migración) · `POST loans/:id/payments` (N cuotas del plan o abono) | editor |
| `savings` | `POST goals/:id/contribute` · `POST fund/{save,use}` · `PUT fund` | editor |
| `assets` | `POST/DELETE assets/:id/reconcile` · `PUT net-worth/:mes` | editor |
| `budget` | `PATCH categories/:id/tope` · `PUT budget/topes` | editor |
| `catalogs` | `POST registros/resolve` (contacto, entidad o proveedor sin duplicar) | registra (buscar) / editor (crear) |
| `import` | `POST import/statement/preview` · `POST import/statement` (ids `csv:`) · `GET export.json` · `POST backups` | editor / admin (`ajustes`) |

- **Puertos para otros frentes**: `ExpenseClassifier` (IA de gastos, hoy `NoExpenseClassifier`: F2-F lo reemplaza en
  `expenses.module.ts`), `BookDumpService` (exportado por `import`: `dump(scope, libro)` y `ownRows` para
  `GET /v1/account/export` de F2-I), `BackupStorage` (Storage `backups` con SystemScope y motivo).
- **Pruebas**: `src/modules/book-tables/book-store.test.ts` (adaptadores y errores), `packages/contracts/src/book-table-schemas.test.ts`
  y `test/f2d/*.int.test.ts` (app real con una base en memoria: roles, filas propias, plan, validación, papelera,
  cascadas, idempotencia y los argumentos exactos de cada RPC que hoy manda el navegador).
- **Pendiente**: `files` y `feedback`, `tax` (renta/:año; el CRUD de tax_years/tax_assets ya va por el genérico), importar
  respaldo v4 y ejemplo, restaurar y borrar respaldos, precios de inversiones y probar con RLS real en Supabase local.

## IA y chat (F2-F)

El código vive en **`packages/ai` (`@mirai/ai`)**, el mismo que usa la web (sus `lib/ai/*`, `lib/chat/*`,
`features/ai/classify.ts`, `features/advisor/engine.ts`, `features/chat/{server,confirm}.ts` re-exportan el paquete y las
Server Actions / `app/api/chat` solo arman la sesión). Corre con el runtime de `@mirai/services` que configura
`ServicesRuntime` (F2-E): `ai_usage`, `ai_cache`, cupos y límites con SystemScope; el libro y los hilos con el JWT de la
persona (RLS). Los tipos del chat (`ChatEvent`, `Propuesta`, `Consulta`…) están en `@mirai/contracts/chat-types`.

| Módulo | Rutas | Rol |
|---|---|---|
| `ai` | `POST /v1/books/:b/ai/{invoice,receipt,loan-doc,classify,hormiga,category,entity,cobro,prima,parse,advisor}` · `GET …/ai/usage` · `POST …/reports/:mes/summary` · `POST …/mail/scan` · `POST …/integrations/:kind/{test,models}` | los de la web: factura, clasificar, cobro, prima y frase = `registrarPropio`; comprobante, préstamo, hormiga, asistentes, resumen y correo = editor; modelos = admin; consejero y uso = viewer |
| `ai` (consola) | `GET /v1/admin/ai/usage` · `PATCH /v1/admin/ai/settings` · `PUT /v1/admin/ai/plans/:planId/cupo` · `PUT /v1/admin/ai/prices` · `DELETE /v1/admin/ai/cache` | `@PlatformAdmin`; todo en `admin_audit` |
| `chat` | `POST /v1/books/:b/chat/messages` (**NDJSON**) · `GET …/chat/hints` · `GET …/chat/threads` · `GET …/threads/:t/messages` · `PATCH/DELETE …/threads/:t` · `POST …/threads/:t/{restore,duplicate,title}` · `GET …/threads/:t/info` · `POST …/chat/messages/:m/proposals/:p/{confirm,cancel}` · `POST …/chat/attachments` | cualquier rol; permisos finos por tipo de propuesta (`chat/permisos.ts`); límites `chat` y `chatAdjunto` |

- **Streaming**: `application/x-ndjson`, un `ChatEvent` por línea (mismo protocolo de `app/api/chat`), Fastify con un
  `PassThrough` (sin búfer), latido `{"t":"ping"}` cada 15 s y cancelación al cerrar la conexión (`reply.raw` `close` →
  `AbortSignal` del turno: se guarda lo que alcanzó a llegar con `detenido`). Las guardas responden JSON antes del stream.
- **Errores**: lo que la web devolvía como `{ ok:false, msg }` sale como ApiError con el **mismo texto** (`ai/ai-errors.ts`):
  plan → 402 `PLAN_REQUIRED` (el mensaje de `run.ts`), créditos o límite → 429, IA apagada / falta la clave / datos → 400,
  no existe → 404, ya cancelada → 409, el proveedor o la lectura falló → 502. "Sin sugerencia" es `data: null`; el
  resultado de "probar conexión" es dato (`data.ok`).
- **Fotos y PDF**: `file: { fileId }` (ruta `<bookId>/…` del bucket `attachments`, descargada con el JWT: la RLS de Storage
  exige ser miembro) o `file: { name, type, data }` en base64 (compatibilidad; con el bodyLimit de 8 MB caben hasta ~6 MB).
  Puerto `AiFiles` (adaptador Supabase Storage); cuando exista `files` (F2-D-2) puede delegar en él.
- **Puertos**: `AiPort`/`AiAdminPort` (adaptador `PackageAi`, llama a `@mirai/ai`), `ChatPort` (`PackageChat`) y
  `ChatWritesPort` (escritura al confirmar; hoy `SupabaseJsChatWrites` = `server/confirm.ts`, las mismas RPC de la web;
  los servicios de F2-D se conectan con otro adaptador sin tocar el chat). Al confirmar, `EventsService.changed` con las
  tablas de la propuesta. `AiExpenseClassifier` implementa el puerto `ExpenseClassifier` de F2-D (`expenses.module.ts`).
- **Automatizaciones**: `AiRuntime` agrega `aiText` de `@mirai/ai/run` al runtime de `@mirai/services` (nodo "Consejo de
  la IA" en la API). Variables: `AI_GATEWAY_API_KEY` (ya en `ServicesEnv`); Upstash no se lee en la API (usa
  `rate_limit_hit`, como la web sin Upstash).
- **Pruebas** (sin proveedor real ni base): `packages/ai/src/**/*.test.ts` (modelo simulado `MockLanguageModelV4`, base en
  memoria `@mirai/ai/testing/fake-db`: orden de `run.ts`, respaldo entre proveedores, caché, créditos, límite, turno del
  chat, confirmar/cancelar, hilos, casos de uso), `src/modules/ai/ai.test.ts`, `test/f2f.int.test.ts` (rutas, roles,
  errores, NDJSON, límite `chat`, adjuntos, consola), `test/f2f-stream.int.test.ts` (cancelación con un socket real) y
  `test/f2f-engine.int.test.ts` (la API con el motor real de la web sobre la base en memoria).
- **Pendiente**: proxy o cambio del front (F2-H: `features/chat/store.ts` a `NEXT_PUBLIC_API_URL`), multipart (hoy base64),
  E2E `f14-chat` con `api-on`, medir el tiempo al primer token en Cloud Run y conectar la escritura a los servicios de F2-D.

## Endpoints que faltaban (V7-G)

Datos fuera de `BookStore` por el puerto **`RowStore`** (`src/core/store`: un puerto con adaptadores supabase-js y
Kysely, filtros `eq/neq/in/notNull/gte/lte/gt/lt/ilike`, `update`/`delete` nunca sin filtro, jsonb según
`json-columns.ts`, revisado contra los tipos de la base). Los módulos lo importan con `RowStoreModule`. Pruebas con la
app real y dobles en memoria: `test/v7g/*` (`createV7gApp`, `MemoryRowStore`, `MemoryObjectStore` de V7-E).

| Módulo | Rutas | Rol / plan |
|---|---|---|
| `books` | `POST /v1/books` (create_book + límite de libros) · `PATCH/DELETE /v1/books/:b` (papelera; nunca el principal ni el último) · `POST /v1/trash/books/:id/restore` · `GET/PATCH …/settings` | crear: editor del hogar · editar/ajustes: editor · borrar/restaurar: dueño |
| `me` | `PUT /v1/me/active-book` · `GET/PATCH /v1/me/profile` (con CC los dígitos DIAN salen del documento) · `GET/PATCH /v1/me/preferences` (`extraPatch` mezcla) · `GET /v1/platform/notice` (público) · `GET /v1/platform/integrations` | la persona (RLS «propio») |
| `files` | `POST /v1/files/uploads` → PUT directo → `POST /v1/files/uploads/complete { uploadId }` · `GET /v1/files/url` (5 min) · `DELETE /v1/files` | reglas por bucket en `FilesService` (libro, carpeta propia o consola); límite `subidas`; puerto `ObjectStore` de `core/files` |
| `import` | `GET …/backups` · `GET …/backups/:id/url` · `POST …/backups/:id/restore` · `DELETE …/backups/:id` · `POST …/import/{json,v4,sample}` · `POST …/data/format` | `ajustes` / admin / editor |
| `account` | `GET /v1/account/export` (exportMyData con `BookDumpService`) | la persona |
| `gami` | `POST …/gami/{visit,check,logros}` (insignias, misiones, nivel y campana con dedupe) | viewer (nivel: quien edita) |
| `feedback` | `POST /v1/feedback` · `POST /v1/feedback/rating` · `GET /v1/me/feedback` · `DELETE /v1/me/feedback/:id` | la persona; límite `opiniones` |
| `ads` | `POST /v1/ads/events` · `GET /v1/public/{adsense,ads.txt}` · `/v1/admin/ads/**` | sesión / público / `@PlatformAdmin` |
| `chat` | `POST …/chat/messages/:m/rating` · `GET …/chat/search?q=` · `GET …/chat/threads/count` | viewer (solo lo propio) |
| `billing` | `GET /v1/plans` (público) · `GET /v1/households/:h/subscription` (pagos solo el dueño) | miembro del hogar |
| `tax` | `/v1/books/:b/accountant/{shares,notes,files}` (token una vez, se guarda el hash) | ver: viewer · crear/rotar/documentos: admin + «impuestos» · notas: editor + «impuestos» |
| `admin` | `/v1/admin/{plans,coupons,integrations,whatsapp}/**` (secretos cifrados, solo máscaras; `admin_audit`) | `@PlatformAdmin` |
| `automations` | `GET/PUT/DELETE …/automations[/:id]` · `POST …/:id/{restore,test}` · `POST …/automations/{defaults,drain}` · `GET …/automation-runs` | leer/probar: viewer · escribir: editor; cupo del plan (409) e «ia» (402) |
