# Mirai v6: separar el front (Next.js) del back (NestJS)

> Documento de arquitectura (fase 2 del plan a GCP). Lo escribí el 2026-11-02 sobre la rama `pruebas` y solo leí el código: no edité la app, no corrí build ni E2E y no me conecté a la base.
> Las referencias `archivo:línea` son del árbol de trabajo de ese día. Hay cambios sin confirmar del PWA y de la portada (`app/abrir`, `app/compartir`, `app/api/public`, `features/landing/*`, `features/pwa/*`, `lib/pwa/*`, `public/sw.js`, `proxy.ts`, `utils/supabase/middleware.ts`), así que algunas líneas pueden moverse un poco.
> Lecturas base: `CLAUDE.md`, `AGENTS.md`, `docs/DEPLOY-VERCEL.md` y `docs/sinergia/mapa.md`.
> La fase 3 (Terraform en GCP) queda por fuera. Aquí solo va lo que la arquitectura necesita de la infraestructura.

---

## 0. Resumen ejecutivo

### 0.1 Decisiones

| Tema | Decisión | Estado |
|---|---|---|
| Front | El Next.js actual pasa a `apps/web`: SSR de páginas, PWA, portada, sesión (cookies de Supabase Auth) y nada de lógica de negocio en el servidor | Tomada |
| Back | NestJS (TypeScript) en `apps/api`, en Cloud Run | Tomada |
| Monorepo | **pnpm workspaces + Turborepo** (§0.3) | Recomendada |
| Contratos | `packages/contracts`: esquemas zod 4 como fuente única, contrato **ts-rest**, cliente tipado y OpenAPI generado. Plan B: `nestjs-zod` → OpenAPI → `openapi-fetch` (§2.4) | Recomendada, con prueba previa |
| Acceso a datos | Puertos (repositorios) con dos adaptadores: **`SupabaseJs`** en la fase 2 (PostgREST con el JWT de la persona, misma RLS y cero conexiones nuevas a la base saturada) y **`PgKysely`** para Cloud SQL (`pg` + Kysely, con contexto RLS por transacción) | Recomendada |
| ORM | **Kysely** (constructor de consultas tipado), no Prisma ni Drizzle (§2.3) | Recomendada |
| Seguridad por libro u hogar | Doble capa: guardas en el servicio (rol del hogar y plan) y RLS en la base. En Cloud SQL, `set local role authenticated` + `set_config('request.jwt.claims', …, true)` dentro de cada transacción, con un esquema `auth` de compatibilidad (`auth.uid()`, `auth.jwt()`) | Recomendada |
| Autenticación | Hoy: la API valida el JWT de Supabase con JWKS (`jose`). Puerto `TokenVerifier` listo para Google Identity Platform | Tomada / Recomendada |
| Colas | **Cloud Tasks** para trabajos puntuales y fan-out, **Cloud Scheduler** para el cron, tabla `automation_events` como *outbox*. Sin BullMQ ni Redis en la fase 2 (§2.7.8) | Recomendada |
| WebSocket | **socket.io** en un servicio aparte (`mirai-realtime`, Cloud Run con afinidad de sesión y `min-instances=1`) con **adaptador de Redis (Memorystore)**. Origen de los cambios: `pg_notify` por trigger en Cloud SQL. Mientras la base siga en Supabase, se queda **Supabase Realtime** (§2.8) | Recomendada |
| Cron | Cloud Scheduler (OIDC) → `POST /v1/jobs/notify/tick`, que reparte por hogar con Cloud Tasks. Reemplaza el cron de Vercel y `pg_cron` + `pg_net` | Recomendada |
| Migración | Strangler módulo por módulo, con interruptores (`platform_settings.api_rollout`) y la versión publicada intacta (§4) | Recomendada |

### 0.2 Por qué NestJS y por qué así (justificación de la decisión tomada)

1. **Mismo lenguaje, mismo código.** `lib/domain` tiene 38 módulos y unas 9 800 líneas, con pruebas de paridad contra el bundle de la v4 (`lib/domain/__tests__/legacy.ts`). Su única dependencia externa es un `import type` de `lib/supabase/tables` (`lib/domain/types.ts:8`). Con Node y TypeScript del lado del servidor, ese código se mueve **sin reescribirlo** a `packages/domain` y sigue corriendo en el navegador (Inicio, Dashboard y Balance calculan en el cliente) y en la API (chat, avisos, contador, automatizaciones). Con otro lenguaje habría que portar la lógica y volver a probar la paridad.
2. **Lo que ya funciona se reutiliza tal cual:** zod 4 (validación de todas las Server Actions), AI SDK v7 (`lib/ai/run.ts`, con respaldo entre proveedores, caché, créditos y `ai_usage`), `web-push`, `resend` y `nodemailer`, las firmas de Mercado Pago y Wompi (`lib/payments/signatures.ts`), el cifrado AES-256-GCM (`lib/crypto.ts`), el motor de automatizaciones (`lib/automations/engine.ts`, que es puro) y el registro de integraciones (`lib/integrations/registry.ts`, 27 tipos).
3. **NestJS frente a un Express o Fastify "a mano":** trae módulos e inyección de dependencias, que es justo lo que necesita el patrón puerto/adaptador para cambiar Supabase por Cloud SQL sin tocar servicios. También trae guardas e interceptores para el rol del hogar, el plan, la idempotencia y los límites; un gateway de WebSocket de primera clase; `@nestjs/schedule`/`terminus` para el estado de salud; y una estructura que varios agentes pueden llenar en paralelo sin pisarse. Debajo puede correr Fastify (`@nestjs/platform-fastify`) para tener menos latencia en Cloud Run.
4. **Next.js se queda como front** porque ya resuelve SSR con `cacheComponents`, la PWA, la portada, el SEO y la sesión con cookies (`@supabase/ssr`). Lo que sale de Next es la **lógica de negocio del servidor**: Server Actions, Route Handlers de negocio, clave secreta, cifrado, IA, avisos y pagos.

### 0.3 Monorepo: pnpm + Turborepo

- **pnpm** crea un `node_modules` estricto, sin dependencias "fantasma". Eso importa justo ahora: al separar el código, cualquier `import` de servidor que se cuele en `apps/web` (por ejemplo `server-only`, `web-push` o `nodemailer`) falla al instalar o compilar en vez de colarse en producción. Además instala rápido con caché por contenido y tiene el protocolo `workspace:*` y `pnpm deploy --filter api` para armar la imagen de Docker.
- **Turborepo** guarda en caché `build`, `typecheck`, `test` y `lint` por paquete. Vercel lo detecta solo (Root Directory `apps/web`, "Include files outside root"). `turbo prune api --docker` arma un contexto mínimo para Cloud Build.
- **npm workspaces** funcionaría, pero eleva todo a la raíz (esconde dependencias faltantes) y no deja podar el contexto de Docker igual de fácil. **Nx** es más pesado de lo que este equipo necesita.

---

## 1. Inventario: todo lo que hoy es "backend" dentro de Next.js

### 1.1 En números

| Qué | Cantidad | Dónde |
|---|---|---|
| Archivos `"use server"` | **21** | §1.3 |
| Server Actions exportadas | **142** | §1.3 |
| Route Handlers | **12**: 7 de negocio, 2 de sesión y 3 nuevos del PWA | §1.2 |
| Módulos `server-only` (librerías de servidor) | 38, sin contar las pruebas | §1.4 |
| Archivos que usan la clave secreta (`supabaseAdmin()`) | 38 de código + 2 pruebas | §1.4 |
| Archivos del navegador que usan supabase-js directo | **81** | §1.6 |
| Tablas que el navegador lee o escribe directo | 63 con `.from()` y 32 con el CRUD genérico (`useList`/`useSave`/`useSoftDelete`) | §1.6 |
| RPC que llama el navegador | 16, en 20 llamadas | §1.6 |
| Canales de Realtime | 2: `book:{id}` y `auto:{id}` | §1.6 |
| Buckets de Storage | 7, de los cuales 5 se usan desde el navegador | §1.6 |
| Migraciones SQL | 53 | `supabase/migrations/` |
| Tablas / funciones / políticas / triggers en SQL | unas 102 / 104 / 124 / 40 nombres distintos | §1.7 |
| Pruebas | 76 archivos Vitest y 43 specs de Playwright | `lib/**`, `features/**`, `tests/e2e` |

### 1.2 Route Handlers

| Ruta | Archivo | Qué hace | Seguridad | Destino en v6 |
|---|---|---|---|---|
| `POST /api/chat` | `app/api/chat/route.ts:59` (251 líneas; `maxDuration` 60 en :32) | Chat con IA en streaming **NDJSON** (no SSE): una línea JSON por evento `thread/user/tool/delta/card/done/error`. Crea y edita hilos, regenera respuestas, usa herramientas de consulta y propuesta (`lib/chat/tools.ts`) y el consejero (`features/advisor/engine.ts`) | `sameOrigin` (:52), `getAppContext` (:62), `limitError("chat")` (:63), zod `Body` (:34) y rol fino `registraAlgo` | `ChatModule`: `POST /v1/books/:bookId/chat/messages` |
| `GET /api/cron/notify` | `app/api/cron/notify/route.ts:25` | Pasada diaria u horaria: latido, refs (TRM, usura, festivos), vencimientos de Premium, resúmenes por persona × libro × canal, correos del plan, Google Calendar, foto del patrimonio y automatizaciones. Recorre en serie todos los libros y sus integrantes (:48-69) | `bearerOk(CRON_SECRET)` (:27), cliente admin | `JobsModule`: tick + fan-out con Cloud Tasks |
| `GET /api/google/connect` | `app/api/google/connect/route.ts:12` | Arma la URL de OAuth de Gmail/Calendar y guarda el `state` en la cookie `g_oauth` (:23-24) | `getAppContext` | `GoogleModule`: `GET /v1/google/connect-url` con `state` firmado (HMAC) |
| `GET /api/google/callback` | `app/api/google/callback/route.ts:8` | Cambia el código por tokens (`lib/google.ts:13`) y los guarda cifrados (`saveTokens` :22) | cookie `state` | `GoogleModule`: `GET /v1/google/callback` (nueva URI en Google Cloud) |
| `POST /api/pagos/mercadopago` | `app/api/pagos/mercadopago/route.ts:14` | Webhook de suscripciones y pagos: verifica `x-signature` (:22), consulta el recurso y aplica `applyPayment` | firma, cliente admin | `BillingModule`: `POST /v1/webhooks/mercadopago` |
| `POST /api/pagos/wompi` | `app/api/pagos/wompi/route.ts:9` | Webhook de Wompi: `wompiVerifyEvent` → `plan_payments` → `applyPayment` | firma, cliente admin | `BillingModule`: `POST /v1/webhooks/wompi` |
| `GET /ads.txt` | `app/ads.txt/route.ts:5` | Lee `platform_integrations(kind=adsense)` con la clave secreta | pública | Se queda en web, pero lee `GET /v1/public/adsense` (sin clave secreta) |
| `GET /auth/callback` | `app/auth/callback/route.ts:20` | PKCE `exchangeCodeForSession`, foto de Google y salto a MFA (aal2) | sesión | **Se queda en web** (es manejo de sesión) |
| `GET /auth/confirm` | `app/auth/confirm/route.ts:11` | `verifyOtp` con `token_hash` | sesión | **Se queda en web** |
| `GET /abrir` | `app/abrir/route.ts:5` (PWA, sin confirmar) | Redirección para la app instalada | — | Se queda en web (no lo toco) |
| `GET/POST /compartir` | `app/compartir/route.ts:10,25` (PWA, sin confirmar) | Web Share Target | — | Se queda en web. Si termina guardando un adjunto, que llame a `FilesModule` |
| `GET /api/public/version` | `app/api/public/version/route.ts:4` (PWA, sin confirmar) | Versión desplegada (`NEXT_PUBLIC_BUILD_ID`) | pública | Se queda en web (es la versión del front) |

### 1.3 Server Actions (`"use server"`) agrupadas por dominio

Guardas: **R** = `requireRole(…)`, **C** = `requireCan(…)`, **P** = `requirePremium(…)`, **A** = `requirePlatformAdmin()`, **Ctx** = solo `getAppContext()`, **L** = `limitError(…)` y **🔑** = usa `supabaseAdmin()` (salta RLS).

#### Sesión, hogar, libro y cuenta
| Archivo | Acciones (línea) | Guardas | Notas |
|---|---|---|---|
| `app/(onboarding)/bienvenida/actions.ts` | `createHousehold` :18 | zod; RPC `create_household` (:25) | Premio de referidos (`lib/referidos.ts:36`) |
| `components/app/actions.ts` | `switchBook` :12, `createBook` :22 | Ctx, zod | Cookie `mirai-book`; RPC `create_book` |
| `features/household/actions.ts` (412) | `loadHouseholdPeople` :48, `invitePerson` :167, `resendInvitation` :244, `shareInvitation` :261, `markInvitationShared` :269, `cancelInvitation` :279, `changeRole` :295, `removePerson` :302, `transferHousehold` :314, `linkPerson` :321, `saveFamilyMember` :341, `deleteFamilyMember` :362, `renameHousehold` :375, `acceptInvitation` :387 | Ctx, C(p), L(`invitar`, `invitarMin`), 🔑×12 | Correo de invitación (`features/household/send.ts`); RPC `invitation_info`, `accept_invitation` y `remove_household_member` |
| `features/account/actions.ts` (340) | `loadAccount` :48, `requestEmailChange` :91, `resendEmailChange` :119, `cancelEmailChange` :133, `removeMethod` :146, `revokeSession` :185, `signOutEverywhere` :197, `loadTransferCandidates` :218, `requestTransfer` :247, `respondTransfer` :267, `cancelTransfer` :292, `leaveHousehold` :305, `deleteHousehold` :324 | Ctx, L(`cuentaCorreo`, `cuentaMetodo`, `pasarHogar`, `borrarHogar`), 🔑×8 | Toca el esquema `auth` por RPC: `my_account`, `my_sessions`, `revoke_my_session`, `remove_my_password`, `ensure_email_identity`, `cancel_my_email_change` |
| `features/referidos/actions.ts` | `misReferidos` :9 | Ctx, 🔑 | |
| `features/import/actions.ts` | `loadSampleBook` :14, `importV4Backup` :27, `currentBook` :45 | R(`editor`) | `features/import/v4.ts` escribe más de 30 tablas |
| `features/data/actions.ts` | `exportBookJson` :13, `createBackup` :18, `backupUrl` :23, `restoreBackup` :33, `restoreFromJson` :43, `deleteBackup` :50, `formatBlocks` :66, `exportMyData` :76, `deleteAccount` :109 | R(`admin`), C(`ajustes`), 🔑×6 | `features/data/backup.ts` (bucket `backups`) y `purge.ts` |

#### IA, chat y reportes
| Archivo | Acciones | Guardas | Notas |
|---|---|---|---|
| `features/ai/actions.ts` (210) | `readInvoice` :31, `classifyExpenses` :56, `reviewMonthHormiga` :66, `suggestCategory` :94, `identifyEntity` :113, `readLoanDoc` :135, `readReceipt` :148, `improveCobro` :164, `primaPlan` :176, `parseNL` :194 | R(`editor`), C(`registrarPropio`); `aiObject`×8 y `aiText`×2 | Imágenes de hasta 8 MB (`next.config.ts`, `serverActions.bodySizeLimit`) |
| `features/chat/actions.ts` (200) | `chatHints` :24, `chatConfirm` :47, `chatCancel` :64, `chatAttach` :79, `chatTitle` :151, `chatDuplicate` :172, `chatThreadInfo` :189 | Ctx, L(`chatAdjunto`) | Al confirmar escribe con `features/chat/confirm.ts:69` |
| `features/reports/actions.ts` | `generateMonthSummary` :18 | R(`editor`), `aiObject` | `monthly_summaries` |
| `features/ia-uso/actions.ts` | `myAiUsage` :11 | R(`viewer`) | RPC `ai_usage_rollup` |

#### Integraciones, avisos, Google y automatizaciones
| Archivo | Acciones | Guardas | Notas |
|---|---|---|---|
| `features/integrations/actions.ts` | `saveIntegration` :20, `toggleIntegration` :45, `deleteIntegration` :60, `testIntegration` :67, `listModels` :107 | R(`admin`/`editor`), 🔑×5 | Cifra con `lib/crypto.ts:13` y `features/integrations/store.ts` |
| `features/notify/actions.ts` | `sendDigestNow` :26, `notifyChannels` :38, `sendTestNow` :44, `telegramStartLink` :57, `telegramConfirm` :70, `telegramUnlink` :88, `openAppNotifs` :94, `logroNotifs` :112, `cobroWaStatus` :133, `sendCobroWhatsApp` :153 | R(`viewer`/`editor`), L(`pruebaAviso`, `cobroWa`), 🔑×8 | `lib/notify/*` |
| `features/correo/actions.ts` | `scanMail` :23, `googleDisconnect` :63, `syncCalendar` :73, `calendarStatus` :84 | R(`viewer`/`editor`), `aiObject`, 🔑 | Gmail (`lib/google.ts:48`) y Calendar (`lib/google-calendar.ts:69`) |
| `features/automations/actions.ts` | `ensureDefaultAutomations` :18, `testAutomation` :45, `runPendingAutomations` :68 | Ctx | `lib/automations/server.ts:230` (`processBook`). El runner del navegador la llama por Realtime (`features/automations/runner.tsx:24,32`) |

#### Impuestos y contador
| Archivo | Acciones | Guardas | Notas |
|---|---|---|---|
| `features/contador/actions.ts` | `createShare` :43, `rotateShare` :60, `revokeShare` :70, `ownerNote` :75, `contadorOpen` :111, `contadorNotes` :124, `contadorNote` :131, `contadorFileUrl` :140 | R(`admin`/`editor`), P(`impuestos`), L(`contador`), 🔑×9 | El portal público `app/contador/[token]` entra **por token, sin sesión**, y lee el libro con la clave secreta |

#### Planes y pagos
| Archivo | Acciones | Guardas | Notas |
|---|---|---|---|
| `features/planes/actions.ts` | `paymentOptions` :18, `previewCoupon` :31, `startCheckout` :45, `paysRenewal` :83, `cancelRenewal` :90 | R(`owner`), 🔑×4 | `lib/payments/mercadopago.ts:21` (preapproval) e integridad de Wompi (`signatures.ts:11`) |

#### Consola de la plataforma (solo `platform_admins`)
| Archivo | Acciones | Guardas |
|---|---|---|
| `features/admin/actions.ts` | `adminOverview` :27, `adminClients` :59, `adminFeedback` :93, `adminUpdateFeedback` :110, `adminRevenue` :118, `adminGrantPremium` :145, `adminRevokeCourtesy` :157 | A, 🔑 |
| `features/admin/server.ts` (559) | `adminUser` :58, `adminSetSuspended` :101, `adminRecoveryLink` :111, `adminSetPlatformAdmin` :130, `adminDeleteUser` :144, `adminAddNote` :162, `adminDeleteNote` :169, `adminHouseholds` :176, `adminAssignPlan` :204, `adminSubscriptions` :220, `adminUpdateSubscription` :231, `adminManualPayment` :255, `adminUpdatePayment` :263, `adminBroadcast` :274, `adminAdmins` :309, `adminAddAdminByEmail` :318, `adminAuditLog` :327, `adminSystem` :336, `adminSaveSettings` :368, `adminCleanOrphanHouseholds` :376, `adminGlobalIntegrations` :386, `adminSaveGlobalIntegration` :401, `adminTestGlobal` :446, `adminTestDefaults` :503, `adminSendTest` :513, `adminNotifyLog` :541, `adminInviteUser` :552 | A×27, 🔑×28 |
| `features/admin/ia-server.ts` | `adminAiUsage` :17, `adminSaveAiSettings` :75, `adminSetPlanAiCupo` :86, `adminSetModelPrice` :98, `adminClearAiCache` :112 | A, 🔑 |
| `features/admin/whatsapp.ts` | `adminWaState` :35, `adminWaSaveSettings` :60, `adminWaSaveTemplate` :79, `adminWaDeleteTemplate` :99, `adminWaPreview` :115, `adminWaSendTest` :129 | A, 🔑 |

> Dato para la API: todas las Server Actions sacan el libro de la **cookie** `mirai-book` (`lib/dal.ts:10`, :84-85). En la API el libro va en la ruta (`/v1/books/:bookId/...`) y nunca en una cookie (§2.2).

### 1.4 Librerías de servidor por dominio

| Dominio | Archivos | Qué hacen y qué hay que tener en cuenta |
|---|---|---|
| **Contexto y sesión** | `lib/dal.ts` (`getAppContext` :67, `requirePremium` :97, `requirePlatformAdmin` :104, `requireRole` :114, `requireCan` :121); `utils/supabase/server.ts`, `client.ts` y `middleware.ts`; `proxy.ts` | `getAppContext` hace **un solo viaje** con el RPC `mirai_app_context` (:38-42) y tiene un respaldo de consultas sueltas (:45-57). `proxy.ts` refresca la sesión con `getClaims` (`utils/supabase/middleware.ts:28`) y protege rutas. **Las dos peticiones (navegador y servidor) mandan el encabezado `x-mirai-enlaces: 1`** (`utils/supabase/client.ts`, `server.ts`), del que dependen las cascadas de la base (`sync_enlaces_on`, `20261103003200_enlaces.sql:14-18`). La API tiene que mandarlo también |
| **Clave secreta** | `lib/supabase/admin.ts` | `supabaseAdmin()` salta la RLS. En la API pasa a ser un `SystemDbContext` explícito (§2.3) |
| **Cifrado** | `lib/crypto.ts` (`encrypt` :13, `decrypt` :20, `mask` :32) | AES-256-GCM, formato `v1.iv.tag.data`, `ENCRYPTION_KEY` de 32 bytes. **Se mueve tal cual**: no se puede cambiar la clave ni el formato |
| **Integraciones** | `lib/integrations/registry.ts` (27 tipos), `resolve.ts`, `features/integrations/store.ts` (`getGlobalIntegration` :12, `getOwnIntegration` :18, `getIntegration` :31), `refresh.ts` y `data-sources.ts` (TRM, usura, festivos, FX, CoinGecko, acciones) | La regla "global frente a hogar" vive en `resolve.ts` y es pura, así que pasa a `packages/domain` o a `packages/contracts` |
| **IA** | `lib/ai/run.ts` (bloqueo por plan :91, `aiText` :156, `aiObject` :165, `aiStream` :179), `model.ts`, `router.ts` (reglas sin IA), `usage.ts` (cupos, caché `ai_cache` y `ai_usage`), `prompts.ts`, `pricing.ts`, `credits.ts`, `features.ts` y `compact.ts` | El orden es plan → interruptor → caché → cupo → límite → proveedores → registro. Pasa completo a `AiModule` |
| **Chat** | `lib/chat/*` (`tools.ts`, `contexto.ts`, `resolver.ts`, `intent.ts`, `propuestas.ts`, `permisos.ts`…), `features/chat/server.ts` y `confirm.ts` | Las herramientas leen el libro con el cliente de la persona. Al confirmar, escribe `expenses`, `extra_incomes`, `goals` y `calendar_events` |
| **Avisos** | `lib/notify/digest.ts` (`runRule` :256, `deliver` :162), `channels.ts` (Telegram, WhatsApp Graph y push), `email.ts`, `log.ts` (`claimSend` :24 con RPC `notify_claim`), `schedule.ts`, `rules.ts`, `cron-tasks.ts`, `wa-meta.ts` y `wa-templates.ts` | La idempotencia ya existe (`notify_claim` y `notifications(user_id, dedupe)`) y se reutiliza tal cual |
| **Automatizaciones** | `lib/automations/engine.ts` (puro), `schema.ts`, `server.ts` (`processBook` :230, `runAutomationsCron` :297), `notify.ts`, `limits.ts` y `templates.ts` | Los triggers encolan en `automation_events`. El runner del navegador **y** el cron las procesan |
| **Pagos** | `lib/payments/apply.ts` (`applyPayment` :51 → RPC `apply_plan_payment`, con candado), `signatures.ts`, `mercadopago.ts`, `reminders.ts` y `state.ts` | Ya son idempotentes, así que se mueven tal cual |
| **Google** | `lib/google.ts` y `lib/google-calendar.ts` (`syncCalendarFor` :69, `syncAllCalendars` :127) | Tokens en `google_connections`, cifrados |
| **Seguridad** | `lib/security/rate-limit.ts` (`LIMITS` :11, RPC `rate_limit_hit`), `headers.ts` (CSP), `secrets.ts` (`bearerOk`), `safe-next.ts` y `safe-url.ts` | `LIMITS` se mueve a la API. La CSP se queda en web y suma el origen de la API en `connect-src` |
| **Planes** | `lib/plans.ts` (puro), `lib/plan-server.ts` (`householdCan` :13, `bookCan` :18) | Las guardas de plan de la API las usan |
| **Datos del libro** | `lib/book-data.ts` (`loadBookData` :109: 16 partes, en el navegador y en el servidor) | Va a `packages/domain`, con el cargador detrás de un puerto |
| **Varios** | `features/advisor/engine.ts`, `features/ai/classify.ts`, `features/import/v4.ts`, `features/data/backup.ts`/`purge.ts`, `features/account/send.ts`, `features/household/send.ts`/`query.ts` y `lib/referidos.ts` | Cada uno se mueve a su módulo de la API |

### 1.5 Lecturas en el servidor de Next (RSC)

- `app/(app)/layout.tsx` y `app/(admin)/admin/layout.tsx` llaman a `getAppContext()`, el contexto de todo el shell.
- `app/(onboarding)/bienvenida/page.tsx`, `app/page.tsx` y `features/landing/precios.tsx` (de la portada, no lo toco) usan `supabaseServer()`.
- `app/contador/[token]/page.tsx` llama a la Server Action `contadorOpen`.

### 1.6 Lo que el navegador hace directo contra Supabase

**CRUD genérico** en `hooks/use-book-data.ts`:
- `useList` (:89): `select * where book_id = ? and deleted_at is null`.
- `useSave` (:123): upsert optimista, con el UUID generado en el navegador.
- `useSoftDelete` (:180): marca `deleted_at` y muestra "Deshacer".

Las tablas con hooks son `expenses`, `subscriptions`, `automations`, `entities`, `providers`, `credit_cards`, `contacts`, `categories`, `wishlist`, `keyword_rules`, `investments`, `goals`, `fixed_expenses`, `assets`, `tax_assets`, `shared_groups`, `shared_group_expenses`, `savings_challenges`, `net_worth_snapshots`, `loans`, `liabilities`, `incomes`, `income_categories`, `fund_movements`, `calendar_events`, `allowances`, `allowance_movements`, `payment_methods`, `goal_movements`, `extra_incomes`, `card_purchases` y `card_payments`. Además, `features/book/use-book-data.ts` carga el libro por partes (`loadBookPart`).

**`.from()` directo**, con el número de llamadas entre paréntesis:

| Grupo | Tablas |
|---|---|
| Perfil y ajustes | `profiles` (11), `book_settings` (7), `user_preferences`, `notification_rules` (4), `push_subscriptions` (`features/notify/push-client.ts:32,39`, del PWA), `telegram_links` |
| Libro (escrituras fuera del CRUD) | `expenses` (9), `loans` (7), `fixed_expenses` (7), `tax_assets` (5), `calendar_events` (5), `savings_challenges`, `emergency_funds`, `loan_payments`, `extra_incomes`, `contacts`, `card_purchases`, `shared_groups`, `credit_cards`, `categories`, `assets`, `allowances`, `goals`, `goal_movements`, `investments`, `card_payments`, `net_worth_snapshots`, `monthly_summaries`, `tax_years`, `attachments` (4), `advisor_consultations` |
| Chat | `chat_threads`, `chat_messages` |
| Gamificación | `gami_badges`, `gami_missions`, `gami_state`, `gami_visits` |
| Hogar | `family_members` (3) |
| Planes y anuncios | `plans` (6), `coupons` (5), `plan_payments`, `ads` (10), `ad_campaigns` (7), `ad_events`, `ad_user_daily` |
| Plataforma | `platform_settings` (5), `platform_integrations_public`, `integrations_public`, `google_connections_public`, `broadcasts`, `feedback` (5), `audit_log`, `backups`, `automation_runs`, `accountant_shares`, `accountant_notes` |
| Referencias | `ref_renta_regimenes`, `ref_renta_calendar`, `ref_uvt`, `ref_usury_rate`, `ref_trm` |

**RPC desde el navegador:**

| RPC | Dónde se llama |
|---|---|
| `registro_abierto` | `components/auth/register-form.tsx:47` |
| `ad_reach` | `features/admin/admin-ads.tsx:55` |
| `ad_track` | `features/ads/ad-slot.tsx:88` |
| `asset_cuadrar` | `features/balance/asset-form.tsx:79` |
| `add_card_purchase` | `features/cards/card-forms.tsx:118`, `features/correo/correo-view.tsx:96`, `features/import/import-view.tsx:158` |
| `pay_credit_card` | `features/cards/card-forms.tsx:192`, `features/import/import-view.tsx:159` |
| `use_emergency_fund` | `features/expenses/expense-form.tsx:223` |
| `link_expense_fixed` / `unlink_expense_fixed` | `features/expenses/expense-form.tsx:237` / `:241` |
| `pay_fixed_expense` | `features/fixed/fixed-form.tsx:148`, `features/fixed/pay-fixed-dialog.tsx:53` |
| `unpay_fixed_expense` | `features/fixed/fixed-view.tsx:66` |
| `fund_save` / `fund_use` | `features/goals/goal-dialogs.tsx:95` / `:100` |
| `goal_contribute` | `features/goals/goals-view.tsx:113` |
| `household_subscription` | `features/planes/plan-tab.tsx:34` |
| `pay_subscription` | `features/subscriptions/subscriptions-view.tsx:58` |

**Auth (supabase-js en el navegador):** `signInWithPassword`, `signInWithOtp`, `signInWithOAuth`, `signUp`, `resetPasswordForEmail`, `updateUser` (×3), `signOut` (×5), `getUser`, `getClaims`, `getUserIdentities`, `linkIdentity`, y `mfa.enroll`, `mfa.challengeAndVerify`, `mfa.listFactors`, `mfa.unenroll` y `mfa.getAuthenticatorAssuranceLevel`. Están en `components/auth/*`, `app/(auth)/*`, `features/account/*` y `features/settings/tabs/security.tsx`.

**Storage desde el navegador:**

| Bucket | Operación | Dónde |
|---|---|---|
| `avatars` | upload y `getPublicUrl` | `components/mirai/avatar-picker.tsx:101-103` |
| `ads` | upload | `features/admin/admin-ads.tsx:147` |
| `public-assets` | upload | `features/admin/console-whatsapp.tsx:44` |
| `feedback` | upload | `features/opiniones/feedback-dialog.tsx:81` |
| `attachments` | upload y `createSignedUrl` | `features/renta/renta-owner.tsx:51,57` |

Los buckets `backups` y `logos` solo se usan desde el servidor.

**Realtime:**
- `hooks/use-realtime.ts`: canal `book:{id}` con `postgres_changes` sobre 42 tablas de `LIVE_TABLES` (:10-18, filtradas por `book_id`), `HOUSEHOLD_TABLES` (:25, filtradas por `household_id`) y `notifications` (por `user_id`). Usa *Presence* para mostrar quién está y en qué pantalla, agrupa ráfagas de 300 ms (:31), ignora el eco local (`isLocalEcho`) y recarga todo si se pierde la conexión.
- `features/automations/runner.tsx:32`: canal `auto:{bookId}` sobre `automation_events`, que dispara `runPendingAutomations` (:24).

### 1.7 Lógica que vive en la base

Todo esto se conserva en la v6, porque la API no reemplaza las transacciones de la base:

- **Unas 90 funciones `security definer`.** Las transaccionales del dominio son: `pay_fixed_expense`, `unpay_fixed_expense`, `pay_credit_card`, `add_card_purchase`, `pay_subscription`, `goal_contribute`, `fund_save`, `fund_use`, `use_emergency_fund`, `asset_cuadrar`, `link_expense_fixed`, `unlink_expense_fixed`, `create_household`, `create_book`, `accept_invitation`, `apply_plan_payment`, `notify_claim`, `rate_limit_hit`, `mirai_app_context`, `household_plan`, `automation_pay_fixed`, `automation_create_income` y `request/respond/cancel/apply_household_transfer`.
- **40 triggers.** Los de enlace (`trg_expense_card`, `trg_expense_fixed`, `trg_card_purchase_sync`, `trg_shared_expense`, `trg_goal_movement_sync`…), los de auditoría (`trg_audit` → `audit_log`), los de límites del plan (`books_free_limit`, `members_free_limit`, `automations_limit`), la cola (`trg_automation_enqueue`) y **tres sobre `auth.*`**: `on_auth_user_created` (`handle_new_user`), `on_auth_user_change` y `on_auth_identity_change`.
- **RLS:** 124 políticas basadas en `is_book_member(book_id, rol)` (`20261103000900_hogar_roles.sql:65`) y `is_household_member`, con 125 usos de `auth.uid()` y 2 de `auth.jwt()` (`session_id` en `20261103001600_cuenta_titularidad.sql:162,175`).
- **59 referencias a `auth.users`** (claves foráneas). La migración `cuenta_titularidad` lee `auth.sessions`, `auth.identities` y `auth.mfa_factors` (20 referencias).
- **`pg_cron` + `pg_net`:** un solo job, `mirai-notify` (`20261031001000_notify.sql:18-19`).
- **Encabezado de la petición:** `current_setting('request.headers')` en `sync_enlaces_on` (`20261103003200_enlaces.sql:14`).
- **Storage:** 7 buckets (`attachments`, `backups`, `logos`, `avatars`, `feedback`, `ads`, `public-assets`), con políticas en `storage.objects` que usan la ruta `{book_id}/…` (`20261031000200_security.sql:396-400`).

---

## 2. Diseño de `apps/api` (NestJS)

### 2.1 Capas y reglas

```
HTTP/SSE/WS ─► Controller ─► Service (casos de uso) ─► Repository (puerto) ─► Adaptador
                 │  zod (contracts)   │ guardas de rol/plan,  │ interfaz TS        │ SupabaseJs (hoy)
                 │  ts-rest           │ packages/domain,      │                    │ PgKysely (Cloud SQL)
                 │                    │ eventos de dominio    │                    │
                 ▼                    ▼                       ▼                    ▼
           RequestContext ── user, household, book, access, plan, token, requestId, idempotencyKey
```

1. **El controller** valida con el esquema zod de `packages/contracts`, lee `RequestContext` y llama **un** método del servicio. No contiene lógica.
2. **El servicio** aplica las reglas: rol del hogar (`lib/household/roles.ts`), plan (`lib/plans.ts`), cálculos de `packages/domain`, orquestación de varios repositorios, emisión de eventos (para Realtime y automatizaciones) y registro de uso. **No conoce Supabase.**
3. **El repositorio** es una interfaz por agregado (`ExpensesRepo`, `BookTablesRepo`, `HouseholdRepo`…). Todos sus métodos reciben un `DbScope`:
   - `UserScope { userId, token, claims }`, que aplica RLS;
   - o `SystemScope { reason }`, que salta RLS y queda en el log.
4. **El adaptador** implementa el puerto: `SupabaseJs*Repo` en la fase 2 y `PgKysely*Repo` en la 4. Se elige por módulo con `DB_ADAPTER=supabase|pg`.
5. **Errores:** los servicios lanzan `DomainError(code, msg)`, con mensajes en español para la persona. Un filtro global los convierte en `{ ok: false, msg, code }` (§2.7.2).

### 2.2 Contexto de la petición y guardas

| Guarda o interceptor | Qué hace | Reemplaza a |
|---|---|---|
| `AuthGuard` (global, salvo `@Public()`) | Valida `Authorization: Bearer <JWT>` con `TokenVerifier` y carga `user` | `getClaims` en `proxy.ts` y `getAppContext` |
| `BookGuard` (rutas `/v1/books/:bookId/**`) | Carga membresía, `access_role` y plan del hogar del libro, con una caché de 30 s por (usuario, libro). Responde 404 si la persona no es miembro (no revela que el libro existe) | cookie `mirai-book` y `getAppContext` |
| `@MinRole('editor')` / `@Can('ajustes')` | Usa `atLeast()` y `can()` de `lib/household/roles.ts`, que pasa a `packages/domain` | `requireRole` y `requireCan` (`lib/dal.ts:114,121`) |
| `@Premium('ia')` | `can(plan, feature)` | `requirePremium` (`lib/dal.ts:97`) |
| `@PlatformAdmin()` | `is_platform_admin()` | `requirePlatformAdmin` (`lib/dal.ts:104`) |
| `@RateLimit('chat', 'user'\|'household'\|'token')` | Usa `LIMITS` de `lib/security/rate-limit.ts:11` con un almacenamiento intercambiable | `limitError` |
| `IdempotencyInterceptor` | `Idempotency-Key` en POST de comandos (§2.7.6) | — |
| `@Public()` + `WebhookSignatureGuard('wompi'\|'mercadopago')` | Verifica la firma sobre el cuerpo crudo | `app/api/pagos/*` |
| `SchedulerGuard` | Token OIDC de Cloud Scheduler o Cloud Tasks (audiencia = URL del servicio). Durante la transición también acepta `Bearer CRON_SECRET` | `bearerOk` (`app/api/cron/notify/route.ts:27`) |
| `AccountantTokenGuard` | Token del portal del contador, con su límite (`portalContador`) | `contadorOpen` |

`RequestContext` se guarda en `AsyncLocalStorage` (`nestjs-cls`), así el log, las trazas y los repositorios lo leen sin pasarlo a mano.

### 2.3 Repositorios, ORM y RLS

**Hoy (fase 2): adaptador `SupabaseJs`.**
- Crea un cliente `createClient(url, publishableKey, { global: { headers: { Authorization: 'Bearer ' + token, 'x-mirai-enlaces': '1' } }, auth: { persistSession: false } })` **por petición**, en una fábrica con alcance `REQUEST` o una clase barata.
- Así PostgREST evalúa **la misma RLS** con el mismo `auth.uid()`, sin abrir conexiones directas a una base que ya está saturada y que comparten pruebas y producción.
- El `SystemScope` usa la clave secreta, que es lo que hoy hace `supabaseAdmin()`.
- Con esto, la fase 2 cambia **dónde** corre el código y no **cómo** se protege.

**Mañana (Cloud SQL): adaptador `PgKysely`.**
- Usa `pg.Pool` con Kysely y los tipos generados con `kysely-codegen` en `packages/db`.
- Cada operación con `UserScope` corre en una transacción que primero ejecuta:
  ```sql
  set local role authenticated;
  select set_config('request.jwt.claims', $1, true);   -- {"sub": "<uuid>", "role": "authenticated", "session_id": "…", "email": "…"}
  select set_config('request.headers', '{"x-mirai-enlaces":"1"}', true);
  ```
- Así las 124 políticas, `auth.uid()`, `auth.jwt()` y `sync_enlaces_on()` siguen funcionando sin reescribirlas (§5.2). `set local` vive solo en la transacción, así que es seguro con un pool y con poolers en modo transacción.
- El `SystemScope` usa la conexión del dueño de las tablas, sin `set role`.

**Por qué Kysely:**

| Opción | A favor | En contra para Mirai |
|---|---|---|
| **Kysely** ✔ | SQL explícito y tipado; transacciones con `set local` triviales; llama RPC (`select * from pay_fixed_expense(...)`) sin fricción; no tiene motor nativo, así que arranca rápido en Cloud Run; usa las migraciones SQL que ya existen (sin un segundo sistema de migraciones); los tipos se pueden derivar de la base | No es un ORM: las relaciones se escriben a mano (y Mirai casi no las necesita, porque usa `book_id` + RPC) |
| Drizzle | Tipado, ligero, también genera SQL | Quiere ser dueño del esquema y de las migraciones (`drizzle-kit`). Para RLS tiene `pgPolicy`, pero duplicaría las 124 políticas. Habría dos fuentes de verdad |
| Prisma | Ecosistema grande | Mal encaje con RLS (`set_config` por transacción obliga a extensiones de cliente o `$transaction` interactivo), migraciones propias, más peso en el arranque de Cloud Run y no maneja bien funciones `security definer` ni triggers |

**Defensa en dos capas:**
1. El servicio exige rol y plan **antes** de tocar la base. Con eso da mensajes claros ("Tu rol no permite…") y no depende de un error de RLS.
2. La RLS de la base sigue activa para todo `UserScope`.

Las únicas operaciones sin RLS son las de `SystemScope`: cron, webhooks, portal del contador, consola admin e integraciones globales. Cada una tiene un `reason` que queda en el log, y una regla de lint impide usarlo en controladores de rutas `/v1/books/**`.

### 2.4 Contratos y cliente tipado (`packages/contracts`)

- Esquemas zod 4 por recurso, con mensajes en español: `ExpenseRow`, `ExpenseUpsert`, `PayFixedInput`, `ChatEvent`, `ApiError`…
- La mayoría de las filas se **derivan** de `packages/db` (tipos de la base) con `z.object({...}) satisfies z.ZodType<Insert<'expenses'>>`, para que una columna nueva rompa la compilación si el contrato no se actualiza.
- **Contrato ts-rest** por módulo (`expensesContract`) que define método, ruta, `pathParams`, `body`, `query` y `responses`:
  - la API lo implementa con `@ts-rest/nest` (`@TsRestHandler`);
  - el front lo consume con `initClient` / `@ts-rest/react-query`;
  - el OpenAPI se genera con `@ts-rest/open-api` para Swagger UI en `/docs` (solo en pruebas).
- **Prueba previa obligatoria (F2-A-6):** confirmar que la versión de ts-rest soporta zod 4 (vía Standard Schema). Si no, el plan B es `nestjs-zod` + `@nestjs/swagger`, `z.toJSONSchema()` de zod 4 para OpenAPI y `openapi-typescript` + `openapi-fetch` en el front. Los esquemas zod no cambian en ninguno de los dos caminos.
- También van aquí, porque las comparten front y back: `LIVE_TABLES` y `HOUSEHOLD_TABLES` (para el gateway), `LIMITS`, `ChatEvent`, `ApiError`, `qk()` y la lista de `BOOK_TABLES` con su política (§2.5).

### 2.5 Módulo genérico `book-tables` (CRUD del libro)

Hay 33 tablas del libro con la misma forma (`id`, `book_id`, `deleted_at`, `created_by`) y la misma semántica (`useList`/`useSave`/`useSoftDelete`). Escribir 33 controladores repetiría código. Por eso propongo:

- **Un registro declarativo** en `packages/contracts/src/book-tables.ts`:
  ```ts
  export const BOOK_TABLE_POLICY = {
    expenses:        { schema: ExpenseUpsert, write: "registra", own: true,  feature: null,   live: true },
    incomes:         { schema: IncomeUpsert,  write: "registra", own: true,  feature: null,   live: true },
    tax_assets:      { schema: TaxAssetUpsert, write: "editor",  own: false, feature: "impuestos", live: true },
    categories:      { schema: CategoryUpsert, write: "editor",  own: false, feature: null,   live: true },
    // … las 33 de features/data/backup.ts:5-12 + wishlist, net_worth_snapshots, providers, automations…
  } as const
  ```
  `own: true` aplica la regla de "Registra sus gastos" (`OWN_ROW_TABLES` y `canEditRow`, `lib/household/roles.ts:83-87`).
- **Endpoints genéricos:**
  - `GET /v1/books/:bookId/t/:table?eq.campo=valor&order=campo.asc&select=` → `useList`
  - `PUT /v1/books/:bookId/t/:table/:id` (upsert con el UUID del navegador, idempotente) → `useSave`
  - `DELETE /v1/books/:bookId/t/:table/:id` (borrado lógico) y `POST …/:id/restore` ("Deshacer") → `useSoftDelete`
  - `GET /v1/books/:bookId/snapshot?parts=…` → `loadBookData` / `loadBookPart` (`lib/book-data.ts:59,109`)
- Las tablas con **reglas propias** (pagos, tarjetas, fondo, metas) tienen además **comandos** en su módulo, envolviendo las RPC transaccionales. El CRUD genérico de esas tablas queda solo para campos simples, como hoy.

### 2.6 Catálogo de módulos

Convenciones:
- Rutas bajo `/v1`.
- **Rol** = rol mínimo del hogar (`owner > admin > editor > registra > viewer`); **Plan** = función Premium exigida.
- **Nav** = hoy lo hace el navegador directo (✔ sí, ◐ en parte, ✘ no: Server Action o Route Handler).
- Los DTO viven en `packages/contracts/src/<módulo>.ts`.

| # | Módulo | Endpoints principales | DTO (zod) | Rol / Plan | Externos | Tablas | Nav |
|---|---|---|---|---|---|---|---|
| 1 | **auth** | `GET /v1/me` (contexto: usuario, hogares, libros, plan y admin; reemplaza `getAppContext`); `GET /v1/auth/session` | `AppContext` | autenticado | JWKS de Supabase (luego Identity Platform) | RPC `mirai_app_context`, `profiles` | ✘ (`lib/dal.ts`) |
| 2 | **account** | `GET /v1/account`; `POST /v1/account/email-change` (+ `resend`, `cancel`); `DELETE /v1/account/methods/:id`; `GET/DELETE /v1/account/sessions/:id`; `POST /v1/account/sign-out-all`; `GET /v1/account/export`; `DELETE /v1/account` | `EmailChange`, `SessionRow` | autenticado, L(`cuenta*`) | Supabase Auth Admin (luego Identity Platform Admin) | RPC `my_account`, `my_sessions`, `revoke_my_session`… | ✘ (`features/account/actions.ts`, `features/data/actions.ts:76,109`) |
| 3 | **households** | `POST /v1/households` (bienvenida); `PATCH /v1/households/:id`; `GET/POST /v1/households/:id/people`; `PATCH …/people/:userId/role`; `DELETE …/people/:userId`; `POST/DELETE …/invitations[/:id]` (+ `resend`, `share`); `GET /v1/invitations/:token` (pública); `POST /v1/invitations/:token/accept`; `POST/PATCH/DELETE …/transfer`; `POST …/leave`; `DELETE /v1/households/:id`; `PUT/DELETE …/family/:id` | `InvitePerson`, `ChangeRole`, `FamilyMember` | `owner`/`admin` según `canManage`; plan: límite de personas (`members_free_limit`) | correo (Resend…) | `households`, `household_members`, `invitations`, `family_members` | ◐ (`family_members` directo) |
| 4 | **books** | `GET /v1/books`; `POST /v1/books` (`create_book`); `PATCH/DELETE /v1/books/:id`; `GET/PATCH /v1/books/:id/settings` | `BookSettings` (incluye `nomina`) | `admin` para crear; límite `books_free_limit` | — | `books`, `book_settings` | ◐ (`book_settings` directo, 7 llamadas) |
| 5 | **catalogs** | CRUD genérico (§2.5) de `categories`, `income_categories`, `entities`, `payment_methods`, `keyword_rules`, `providers`, `contacts`; `POST /v1/books/:b/categories/suggest` (IA, delega a ai) | filas de cada tabla | `editor` | — | esas tablas + triggers `provider_*` | ✔ |
| 6 | **expenses** | CRUD genérico de `expenses`; `POST …/expenses/:id/link-fixed` / `unlink-fixed`; `POST …/expenses/:id/use-fund` (`use_emergency_fund`); `POST …/expenses/import` (CSV en lote, con `external_id`) | `ExpenseUpsert`, `LinkFixed`, `ImportBatch` | `registra` (solo las propias) / `editor` | — | `expenses` + triggers `trg_expense_*` | ✔ |
| 7 | **incomes** | CRUD genérico de `incomes` y `extra_incomes`; `POST …/incomes/plan` (calcula `planIngreso`, sin guardar) | `IncomeUpsert` (`reparto`, `deducciones`) | `registra`/`editor` | — | `incomes`, `extra_incomes`, `income_categories` | ✔ |
| 8 | **fixed & subscriptions** | CRUD de `fixed_expenses` y `subscriptions`; `POST …/fixed/:id/pay` (`pay_fixed_expense`); `DELETE …/fixed/:id/payments/:pid` (`unpay_fixed_expense`); `POST …/subscriptions/:id/charge` (`pay_subscription`) | `PayFixed`, `ChargeSub` | `editor` | — | `fixed_expenses`, `fixed_expense_payments`, `subscriptions` | ✔ (RPC) |
| 9 | **cards** | CRUD de `credit_cards`; `POST …/cards/:id/purchases` (`add_card_purchase`); `POST …/cards/:id/payments` (`pay_credit_card`) | `CardPurchase`, `CardPayment` | `editor` | — | `credit_cards`, `card_purchases`, `card_payments` | ✔ (RPC) |
| 10 | **loans** | CRUD de `loans`; `POST/DELETE …/loans/:id/payments[/:pid]`; `POST …/loans/:id/reminder` (WhatsApp de cobro; delega a notifications) | `LoanUpsert`, `LoanPayment` | `editor`; cobro: L(`cobroWa`) | WhatsApp | `loans`, `loan_payments` | ✔ |
| 11 | **savings** (metas, fondo, cuentas, retos, mesadas, compartidos, deseos) | CRUD de `goals`, `emergency_funds`, `savings_challenges`, `allowances`(+mov), `shared_groups`(+gastos), `wishlist`; `POST …/goals/:id/contribute` (`goal_contribute`); `POST …/funds/:id/save` / `use` | `Contribute`, `FundMove` | `editor` | — | esas tablas + `goal_movements`, `fund_movements` | ✔ |
| 12 | **assets** (inversiones, patrimonio) | CRUD de `assets`, `liabilities`, `investments`; `POST …/assets/:id/reconcile` (`asset_cuadrar`); `PUT …/net-worth/:mes` (foto del mes) | `AssetUpsert`, `Snapshot` | `editor` | CoinGecko y Alpha Vantage (precios, vía integrations) | `assets`, `liabilities`, `investments`, `net_worth_snapshots` | ✔ |
| 13 | **budget** | `PATCH …/categories/:id/tope`; `GET …/budget?mes=` (50/30/20 calculado) | `Tope`, `BudgetView` | `editor` / `viewer` | — | `categories`, `expenses`, `incomes` | ✔ |
| 14 | **insights** (solo lectura: flujo integral, balance, dashboard, indicadores, agenda, reportes) | `GET /v1/books/:b/views/{flujo-integral,balance,dashboard,indicadores,agenda,hallazgos}?mes=`; `GET …/reports/:mes`; `POST …/reports/:mes/summary` (IA) | salidas de `packages/domain` | `viewer`; IA: `editor` + Premium `ia` | — | libro completo (`loadBookData`) + `net_worth_snapshots`, `fund_movements`, `allowances*`, `tax_assets` | ✘ (hoy se calcula en el cliente; ver §3.4) |
| 15 | **tax** (renta, calendario fiscal, contador) | CRUD de `tax_years`, `tax_assets`; `GET …/renta/:año` (cálculo); `POST/PATCH/DELETE …/accountant-shares[/:id]` (+ `rotate`); `POST …/accountant-shares/:id/notes`; **portal público**: `GET /v1/accountant/:token`, `GET/POST /v1/accountant/:token/notes`, `GET /v1/accountant/:token/files/:id` (URL firmada) | `TaxAsset`, `Share`, `Note` | `admin`/`editor` + Premium `impuestos`; portal: token + L(`portalContador`) | Storage | `tax_*`, `attachments`, `accountant_*`, `ref_renta_*` | ◐ |
| 16 | **billing** (planes y pagos) | `GET /v1/plans` (público); `GET /v1/households/:h/subscription`; `GET …/payment-options`; `POST …/coupons/preview`; `POST …/checkout`; `POST/DELETE …/renewal`; **webhooks**: `POST /v1/webhooks/mercadopago`, `POST /v1/webhooks/wompi` | `Checkout`, `CouponPreview` | `owner`; webhooks: firma | Mercado Pago, Wompi | `plans`, `plan_subscriptions`, `plan_payments`, `coupons` (RPC `apply_plan_payment`) | ◐ |
| 17 | **ai** | `POST /v1/books/:b/ai/{invoice,receipt,loan-doc,classify,hormiga,category,entity,cobro,prima,parse}`; `GET /v1/books/:b/ai/usage` | entradas de `features/ai/actions.ts`; imágenes por `fileId` (§2.7.10) | `editor`/`registra` + Premium `ia` (bloqueo en `run.ts:91`) + cupo | OpenAI, Anthropic, Gemini, Groq, OpenRouter, AI Gateway | `ai_usage`, `ai_cache`, `integrations` | ✘ |
| 18 | **chat** | `POST /v1/books/:b/chat/messages` (**streaming NDJSON**, §2.7.11); `GET …/chat/threads`, `GET …/threads/:id/messages`; `PATCH/DELETE …/threads/:id`; `POST …/threads/:id/duplicate`; `POST …/chat/proposals/:id/{confirm,cancel}`; `POST …/chat/attachments`; `GET …/chat/hints` | `ChatBody`, `ChatEvent` (unión discriminada) | autenticado, permisos finos (`lib/chat/permisos.ts`), L(`chat`, `chatAdjunto`) | IA | `chat_threads`, `chat_messages`, `advisor_consultations` + escrituras confirmadas | ◐ (lecturas de hilos directas) |
| 19 | **notifications** | `GET /v1/notifications` (campana); `PATCH /v1/notifications/:id/read`; `GET/PUT /v1/books/:b/notification-rules/me`; `POST …/notifications/test`, `…/digest-now`; `POST /v1/telegram/link` / `confirm` / `DELETE`; `PUT/DELETE /v1/push/subscriptions` | `Rule`, `PushSub` | `viewer`; L(`pruebaAviso`) | Resend, Brevo, SendGrid, SMTP, Gmail, Telegram, WhatsApp Cloud, Web Push | `notifications`, `notification_rules`, `notification_log`, `push_subscriptions`, `telegram_links` | ◐ |
| 20 | **integrations** | `GET /v1/households/:h/integrations` (públicas, con máscara); `PUT/PATCH/DELETE …/integrations/:kind`; `POST …/integrations/:kind/test`; `GET …/integrations/:kind/models` | `IntegrationValue` (registro) | `admin` (IA del hogar) | proveedores de IA | `integrations`, `integrations_public`, `platform_integrations` | ◐ (lectura de `integrations_public`) |
| 21 | **google** | `GET /v1/google/connect-url?scope=`; `GET /v1/google/callback`; `DELETE /v1/google`; `POST /v1/books/:b/mail/scan`; `POST /v1/books/:b/calendar/sync`; `GET …/calendar/status` | `MailScanResult` | `viewer`/`editor` + Premium `banco` | Gmail, Calendar | `google_connections`, `google_event_map` | ✘ |
| 22 | **automations** | CRUD de `automations`; `POST …/automations/:id/test`; `POST …/automations/defaults`; `GET …/automation-runs`; interno: `POST /v1/jobs/automations/book/:b` (Cloud Tasks) | grafo (`lib/automations/schema.ts`) | `editor`; límite por plan (`automation_limit`) | canales de aviso | `automations`, `automation_runs`, `automation_events` | ◐ |
| 23 | **import** | `POST /v1/books/:b/import/v4` (respaldo v4); `POST …/import/sample`; `POST …/backups`, `GET …/backups/:id/url`, `POST …/backups/:id/restore`, `POST …/restore-json`, `DELETE …/backups/:id`; `GET …/export.json` | `V4Backup`, `BookDump` | `editor` / `admin` | Storage (`backups`) | más de 30 tablas | ✘ |
| 24 | **gamification & academy** | `GET/PUT /v1/me/gami`; `POST /v1/books/:b/gami/check` (otorga logros en el servidor); `PUT /v1/me/preferences` (`extra.academia`); `GET /v1/me/referrals` | `GamiState`, `Prefs` | autenticado | — | `gami_*`, `user_preferences`, `referral_codes` | ✔ |
| 25 | **ads** | `GET /v1/ads/eligible?slot=`; `POST /v1/ads/events` (`ad_track`); `GET /v1/public/adsense` | `AdEvent` | autenticado (plan con `ads`) | AdSense | `ads`, `ad_campaigns`, `ad_events`, `ad_user_daily` | ✔ |
| 26 | **feedback** | `POST /v1/feedback` (+ adjunto); `GET /v1/me/feedback` | `Feedback` | autenticado | Storage (`feedback`) | `feedback` | ✔ |
| 27 | **admin console** | `/v1/admin/{overview,clients,users,users/:id,households,plans,subscriptions,payments,coupons,ads,broadcasts,feedback,admins,audit,system,settings,integrations,integrations/:kind/test,notify-log,ai-usage,ai-settings,whatsapp/*}` | uno por acción de `features/admin/*` | `@PlatformAdmin()`; todo queda en `admin_audit`; **nunca devuelve montos ni movimientos** | Meta Graph (plantillas), Supabase Auth Admin | `platform_*`, `plans`, `coupons`, `broadcasts`, `admin_audit`… | ◐ (`plans`, `coupons`, `ads`, `ad_campaigns` y `platform_settings` directos) |
| 28 | **files** | `POST /v1/files/upload-url` (bucket, `bookId?`, tipo y tamaño → URL firmada de subida); `GET /v1/files/:id/url`; `DELETE /v1/files/:id` | `UploadRequest` (tipos MIME y tamaños de `20261103001400_seguridad.sql:128-132`) | según bucket: `attachments` = miembro del libro, `avatars` = la persona misma, `ads`/`public-assets` = admin | Supabase Storage (luego Cloud Storage) | `attachments`, `backups` | ✔ (5 buckets) |
| 29 | **realtime gateway** | WS `wss://rt.mirai…/socket.io`: eventos `join:book`, `presence:update`, `change` y `notification` (§2.8) | `LiveChange`, `PresenceUser` | autenticado + miembro del libro | Redis (adaptador) | — | ✔ (Supabase Realtime) |
| 30 | **jobs / cron** | `POST /v1/jobs/notify/tick` (Scheduler, cada hora); `POST /v1/jobs/notify/household/:h` (Cloud Tasks); `POST /v1/jobs/refs/refresh`; `POST /v1/jobs/calendar/sync`; `POST /v1/jobs/plan/reminders`; `POST /v1/jobs/automations/drain`; `POST /v1/jobs/net-worth/monthly` | `TickReport` | `SchedulerGuard` | todos los canales | todas (con `SystemScope`) | ✘ |
| 31 | **health & meta** | `GET /healthz` (vida), `GET /readyz` (base, secretos y JWKS), `GET /v1/version`, `GET /docs` (solo en pruebas) | — | público | — | — | — |

**Dependencias entre módulos** (Nest las inyecta como servicios, nunca como controladores):

- **Base de todos:** `auth`, `files` e `integrations`.
- `ai` → `integrations`.
- `chat` → `ai` y los módulos de escritura (por sus servicios, no por su API).
- `notifications` → `integrations`.
- `automations` → `notifications`, `expenses`, `savings` y `fixed`.
- `jobs` → `notifications`, `automations`, `billing`, `google` y `assets`.
- `insights` → `book-tables` (snapshot) y `packages/domain`.
- `billing` → `notifications` (correos del plan).
- Todos los de escritura → `EventsService`, que emite `LiveChange` para el gateway y el *outbox* de automatizaciones.

### 2.7 Transversal

#### 2.7.1 Validación
- Un `ZodValidationPipe` global, o el de ts-rest, con mensajes en español (el mapa de errores de zod 4 en `packages/contracts/src/zod-es.ts`).
- Los webhooks leen el **cuerpo crudo** (`rawBody: true` en Nest) antes de convertirlo.

#### 2.7.2 Errores
- **Éxito:** `200`/`201` con el recurso, o `{ ok: true, data }` en los comandos. El cliente lo desenvuelve.
- **Error:** siempre `{ ok: false, msg: "<español para la persona>", code: "ROLE_DENIED" | "PLAN_REQUIRED" | "VALIDATION" | "RATE_LIMITED" | "NOT_FOUND" | "CONFLICT" | "UPSTREAM" | "INTERNAL", details? }` con el código HTTP correspondiente (403, 402, 400, 429, 404, 409, 502, 500).
- `INTERNAL` nunca muestra el mensaje real y lleva el `requestId`.
- Así se acaba el problema de "Next oculta el mensaje de los `throw` en producción" (CLAUDE.md §7).
- Los mensajes que ya existen (`deniedMsg`, "no está incluido en tu plan", `limitMsg`) se reutilizan.

#### 2.7.3 Logs
- `nestjs-pino` con el formato de Cloud Logging: `severity`, `message`, `httpRequest` y `logging.googleapis.com/trace` = `projects/<p>/traces/<traceId>`.
- Se ocultan `authorization`, `cookie`, `*token*`, `*secret*`, `*key*` y los cuerpos con montos (`data-money` no aplica en el servidor: **nunca se registran montos**).
- Se registra `userId`, `householdId`, `bookId` y `requestId`.

#### 2.7.4 Trazas
- OpenTelemetry (`@opentelemetry/sdk-node` + instrumentaciones de http, pg, undici y nestjs) → `@google-cloud/opentelemetry-cloud-trace-exporter`.
- Se propaga `traceparent` desde el front (fetch del cliente de la API).
- Sentry (`@sentry/nestjs`) para errores, con el mismo DSN de proyecto que la web.

#### 2.7.5 Límites de tasa
- `@nestjs/throttler` con un `ThrottlerStorage` propio que llama a **`rate_limit_hit`** (RPC compartido entre instancias, `lib/security/rate-limit.ts:33`). Si falla, usa el contador en memoria, como hoy.
- Con Cloud SQL se puede seguir con la misma función o pasar a Redis si ya existe Memorystore por el gateway.
- Los límites globales por IP van en Cloud Armor (fase 3).

#### 2.7.6 Idempotencia
1. Los upserts usan **el UUID generado en el navegador** (ya es así: `hooks/use-book-data.ts:111-118`), así que `PUT` es idempotente por naturaleza.
2. Los comandos POST (`pay`, `contribute`, `checkout`, `invite`, `chat/messages`) aceptan `Idempotency-Key`. La tabla `api_idempotency(key, user_id, route, status, response, created_at)` guarda la respuesta 24 h: si la llave se repite, devuelve la misma respuesta, y si llega mientras la primera sigue en curso, responde 409. Es una migración aditiva.
3. Los webhooks ya son idempotentes (`apply_plan_payment` con candado por referencia, `lib/payments/apply.ts:46-57`).
4. Los avisos ya lo son (`notify_claim`, `notifications(user_id, dedupe)`).
5. Las tareas de Cloud Tasks se nombran de forma determinista (`notify-<hogar>-<AAAAMMDDHH>`), y Cloud Tasks rechaza los duplicados.

#### 2.7.7 Cron
- **Cloud Scheduler**: job `mirai-notify-hourly` (`5 * * * *`, America/Bogota) → `POST /v1/jobs/notify/tick` con un token OIDC de la cuenta de servicio `mirai-scheduler@`.
- El *tick* reparte el trabajo:
  - toma el latido (`platform_settings.cron_horario_visto`);
  - decide las tareas del día (`lib/notify/schedule.ts`);
  - **encola una tarea de Cloud Tasks por hogar** (`/v1/jobs/notify/household/:h`) en vez de recorrer todos los libros en serie dentro de 60 s, que es el riesgo actual de `route.ts:48-69`.
- La pasada "diaria" (`daily=1`) desaparece: el respaldo sin latido lo resuelve el mismo *tick*, porque Scheduler reintenta solo.
- Así se reemplazan `vercel.json` (`crons`) y el job `mirai-notify` de `pg_cron` + `pg_net`. Ver el orden del corte en §4, paso 9.

#### 2.7.8 Colas: Cloud Tasks y no BullMQ

| | Cloud Tasks (+ Pub/Sub si hace falta difundir) ✔ | BullMQ + Redis (Memorystore) |
|---|---|---|
| Cloud Run con escala a cero | Empuja HTTP al servicio y lo despierta. Los trabajadores son los mismos endpoints | Necesita un proceso trabajador siempre encendido (`min-instances ≥ 1` + CPU siempre asignada) |
| Infraestructura | Administrada, sin VPC | Memorystore + conector VPC (o VPC directa) y su costo fijo |
| Reintentos, demora y tasa | Por cola (`maxDispatchesPerSecond`, *backoff*), con nombre para no duplicar | Sí |
| Programar a futuro | `scheduleTime` (para las esperas de automatizaciones) | Sí |
| Desarrollo local | Adaptador `QueuePort` en proceso (`InlineQueue`) | Redis local |

Las tres colas son:
- `notify` (fan-out por hogar);
- `automations` (procesar un libro y las esperas cumplidas);
- `slow` (resúmenes con IA, importación v4, respaldos y sincronización de Calendar).

**Automatizaciones:** se conservan los triggers que encolan en `automation_events` (patrón *outbox* transaccional). Se procesan de dos formas:
- después de cada escritura de la API, `EventsService` encola `automations/book/:b` con una demora de 1 s, deduplicada por libro y segundo. Reemplaza el runner del navegador (`features/automations/runner.tsx`);
- un *drain* cada 5 minutos desde Scheduler recoge lo que quede, incluidas las escrituras hechas fuera de la API durante la transición.

**Pub/Sub** solo si más adelante hay varios consumidores del mismo evento (analítica, BigQuery). No hace falta en la fase 2.

#### 2.7.9 Salud, configuración y secretos
- `@nestjs/terminus`: `/healthz` solo responde 200; `/readyz` revisa la base (un `select 1` con el adaptador `pg`, o un `HEAD` de PostgREST con el adaptador `supabase`), el JWKS en caché y que `ENCRYPTION_KEY` tenga 32 bytes.
- `@nestjs/config` con un esquema zod de las variables, que falla al arrancar si falta algo.
- En Cloud Run, los secretos se montan desde **Secret Manager** como variables (`--set-secrets`):
  `SUPABASE_SECRET_KEY`, `ENCRYPTION_KEY`, `CRON_SECRET` (mientras haya transición), `GOOGLE_CLIENT_SECRET`, `AI_GATEWAY_API_KEY`, `VAPID_PRIVATE_KEY`, `UPSTASH_REDIS_REST_TOKEN`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`, `GOOGLE_OAUTH_STATE_KEY` (nueva), `DATABASE_URL` (Cloud SQL) y `SUPABASE_JWT_SECRET` (solo si el proyecto sigue con HS256).
- Las variables públicas (`SUPABASE_URL`, `PUBLISHABLE_KEY`, `SITE_URL`, `WEB_ORIGINS`) van como variables normales.
- Ambientes: `MIRAI_ENV=pruebas|produccion`, cada uno con su servicio de Cloud Run y su conjunto de secretos.

#### 2.7.10 Archivos grandes
- Hoy las imágenes viajan en el cuerpo de la Server Action (hasta 8 MB).
- En la API: `POST /v1/files/upload-url` → el navegador sube directo a Storage → `POST /v1/books/:b/ai/invoice { fileId }`. Así el servidor no tiene que recibir el archivo en el cuerpo y se respeta el límite de 32 MB de Cloud Run con HTTP/1.
- Se acepta `multipart/form-data` (≤ 8 MB) como camino de compatibilidad mientras el front migra.

#### 2.7.11 Chat en streaming
- Se **conserva el protocolo NDJSON** que ya consume `features/chat/store.ts:115-135` (un `ChatEvent` por línea), con `content-type: application/x-ndjson` y `cache-control: no-store`.
- **No uso `EventSource`** porque no permite POST ni el encabezado `Authorization`. Si más adelante se quiere SSE, se puede enmarcar con `data: <json>\n\n`, y el tipo `ChatEvent` no cambia.
- En Cloud Run, el *timeout* del servicio es de 300 s. Se usa HTTP/1.1 *chunked* sin búfer, se escribe un latido (`{"t":"ping"}`) cada 15 s y la petición se cancela con `req.on('close')`, que equivale a `req.signal` (`app/api/chat/route.ts:70-71`).

#### 2.7.12 CORS y CSP
- La API vive en `api.mirai.engynex.com` (pruebas: `api-pruebas…`). CORS con lista de orígenes permitidos (`WEB_ORIGINS`), `credentials: false` (se usa Bearer, no cookies) y `Idempotency-Key`, `traceparent` y `X-Mirai-Client` en los encabezados permitidos.
- La web suma ese origen en `connect-src` (`lib/security/headers.ts:13`) y, cuando exista el gateway, también `wss://rt.mirai.engynex.com`.
- Como no hay cookies hacia la API, no hay superficie de CSRF. La comprobación `sameOrigin` del chat (`route.ts:52`) se reemplaza por CORS + Bearer.

### 2.8 Gateway de WebSocket

**Decisión: socket.io** (`@nestjs/platform-socket.io`), y no `ws` nativo, por estas razones:
- trae salas (`book:{id}`, `household:{id}`, `user:{id}`) y adaptadores para varias instancias (Redis) sin construirlos a mano;
- reconecta solo y recupera el estado de la conexión (`connectionStateRecovery`), que reemplaza el "recarga el libro si se perdió" de `hooks/use-realtime.ts:83-86`;
- tiene confirmaciones (*acks*) y *middleware* de autenticación.

Con `ws` habría que reescribir salas, presencia, reconexión y difusión entre instancias. El costo es un protocolo propio y un cliente de unos 15 KB, aceptable.

**Diseño:**
- **Servicio aparte de Cloud Run**, `mirai-realtime`, con el mismo código (`apps/api`, `MODE=realtime`), para que las conexiones largas no compitan con la API:
  - `--session-affinity`, necesaria si socket.io cae a *long-polling*;
  - `--timeout=3600` (Cloud Run corta el WS a los 60 min y el cliente reconecta solo);
  - `min-instances=1` y `concurrency=250`.
- **Autorización:** en el *handshake*, `auth: { token }` se valida con el mismo `TokenVerifier`. `join:book {bookId}` comprueba la membresía (la misma consulta de `BookGuard`). Cada 10 minutos se revisa que el token siga vigente y, si ya venció, se desconecta.
- **Varias instancias:** `@socket.io/redis-adapter` sobre Memorystore (Redis básico de 1 GB). Esta es la primera razón real para tener Redis, así que el límite de tasa también puede pasar a Redis.
  - Alternativa sin Redis: `@socket.io/postgres-adapter`, que usa LISTEN/NOTIFY, pero necesita conexiones directas de sesión (no sirve con poolers en modo transacción) y agrega carga a la base. La descarto.
- **De dónde salen los cambios** (reemplazo de `postgres_changes`):
  1. **Escrituras de la API:** después de confirmar la transacción, `EventsService.emit({ table, bookId, id, op })` → `io.to('book:'+bookId).emit('change', …)` por el adaptador.
  2. **Escrituras que hace la base sola** (triggers de enlace, RPC que tocan varias tablas, cron, automatizaciones): trigger `mirai_live_notify()` `after insert or update or delete` en las tablas de `LIVE_TABLES` y `HOUSEHOLD_TABLES` → `pg_notify('mirai_live', json_build_object('t', TG_TABLE_NAME, 'b', book_id, 'h', household_id, 'id', id, 'op', TG_OP)::text)`. El gateway mantiene **una** conexión directa con `LISTEN mirai_live`, elegida con un candado consultivo para que solo una instancia escuche, y reenvía por el adaptador. La carga útil es mínima (≤ 8 000 bytes, sin montos).
  3. La campana se envía a `user:{id}` (`notification`).
- **Presencia:** `presence:update {path}` → `io.to(book).emit('presence', lista)`, con estado en Redis (`HSET presence:book:{id}`, TTL 60 s y latido).
- **`LIVE_TABLES`** pasa a `packages/contracts/src/live.ts`. Lo usan el trigger (una migración genera la lista), el gateway y el cliente. El cliente nuevo (`useBookLive`) recibe `{ table, id }` y sigue llamando a `invalidateBook(qc, bookId, table)` y a `isLocalEcho(table, id)` de `hooks/use-book-data.ts:52,74`, que no cambian.
- **Convivencia:** mientras la base esté en Supabase, **se queda Supabase Realtime** (funciona, es gratis y no abre conexiones nuevas). El gateway se construye y se prueba en la fase 2 contra una base local (`supabase start`), y entra en producción **con Cloud SQL**, cuando `pg_notify` reemplaza la publicación `supabase_realtime`. El cliente queda detrás de un interruptor `live=supabase|gateway` para poder volver atrás.

---

## 3. Front (`apps/web`)

### 3.1 Qué se queda en Next
- SSR de páginas con `cacheComponents` y `<Suspense>` + esqueletos, la portada (`features/landing`), legales, la PWA (`public/sw.js`, manifiesto, `features/pwa`, `/abrir`, `/compartir` y `/api/public/version`) y el SEO.
- **Sesión:** `@supabase/ssr` con cookies, `proxy.ts` (refresca la sesión y protege rutas), `app/auth/callback` y `app/auth/confirm`, y las pantallas de login, registro, MFA y recuperación, que siguen llamando a `supabase.auth.*` en el navegador porque eso es el proveedor de identidad y no lógica de negocio.
- La UI completa: componentes, TanStack Query, Zustand y `packages/domain`, para que los cálculos en el cliente sean instantáneos.

### 3.2 Cliente de la API
- `apps/web/lib/api/client.ts`: cliente ts-rest (`initClient(contract, { baseUrl: NEXT_PUBLIC_API_URL, api: fetcher })`).
- El `fetcher`:
  - agrega `Authorization: Bearer <access_token>`, que en el navegador sale de `createClient().auth.getSession()` (supabase-js lo renueva solo);
  - agrega `traceparent`, `X-Mirai-Client: web@<BUILD_ID>` e `Idempotency-Key` en los comandos;
  - convierte `{ ok:false, msg, code }` en un `ApiError` que el toast ya sabe mostrar.
- **En el servidor de Next** (RSC y layouts): `apps/web/lib/api/server.ts` lee el token de la cookie con `supabaseServer().auth.getSession()` (después de `getClaims`, que valida) y llama a la API de servidor a servidor. `getAppContext()` pasa a ser `cache(() => api.me())` con la misma forma `AppContext` (`lib/dal.ts:15-26`), así que los layouts no cambian.
- El libro activo sigue en la cookie `mirai-book` **solo para el front** (elegir libro). Al llamar a la API va en la ruta.

### 3.3 TanStack Query contra la API
- `useList`, `useSave` y `useSoftDelete` **conservan su firma** (`hooks/use-book-data.ts:89,123,180`) y por dentro eligen la fuente:
  `source(table) === 'api' ? api.bookTables.list({ params: { bookId, table }, query }) : supabase.from(table)…`
- Las claves `qk(bookId, tabla, …)`, la invalidación por tabla, el eco local, el UUID generado en el navegador, `inflight` y el evento `mirai:accion` **no cambian**. Por eso las 43 specs de Playwright siguen valiendo.
- Las RPC del navegador (§1.6) se envuelven en *hooks* por comando (`usePayFixed`, `useAddCardPurchase`…) con el mismo interruptor.
- Las Server Actions se reemplazan una por una con una función del mismo nombre en `features/<x>/api.ts`, que llama al cliente. Los componentes solo cambian el `import`.

### 3.4 Qué queda directo a Supabase mientras tanto, y cómo se quita

| Qué | Por qué se queda por ahora | Cómo se quita |
|---|---|---|
| `supabase.auth.*` (login, MFA, identidades) | Es el proveedor de identidad | Con Identity Platform: `firebase/auth` en el navegador. Las operaciones de cuenta pasan por `AccountModule` |
| Realtime (`hooks/use-realtime.ts`) | Funciona y no carga más la base | Gateway con Cloud SQL (§2.8) |
| Lecturas del CRUD genérico de tablas que aún no tienen interruptor | El cambio es gradual | Se activa `api_rollout` por grupo de tablas (§4) |
| Storage público (`getPublicUrl` de `avatars`, `ads`, `public-assets`) | Son URL públicas | `FilesModule` + Cloud Storage con CDN |
| Cálculos en el cliente (Inicio, Dashboard, Balance, Flujo) | Son instantáneos y no son "backend" | **Se quedan en el cliente** con `packages/domain`. Los endpoints de `insights` sirven al chat, los avisos, el contador y futuros clientes nativos |

---

## 4. Plan de migración incremental (strangler)

### 4.1 Mecanismos de convivencia
- **Interruptor por módulo:** `platform_settings.api_rollout jsonb default '{}'`, una migración aditiva. Ejemplo: `{"catalogs":"admins","expenses":"off","chat":"pct:10"}`.
  - Valores: `off` | `admins` (solo `platform_admins`) | `qa` (usuario QA de E2E) | `pct:N` (por `hash(user_id)`) | `on`.
  - Se lee en `/v1/me` (que la web consulta igual) y queda en `AppContext.rollout`. La web decide la fuente. Si la API no responde, `apps/web` vuelve a Supabase o a la Server Action en las **lecturas** (nunca en las escrituras, para no duplicarlas).
  - Variable de respaldo: `NEXT_PUBLIC_API_FORCE=off` apaga todo de inmediato con un nuevo despliegue.
- **Las Server Actions y Route Handlers no se borran** hasta que su módulo lleve 2 semanas en `on` sin incidentes. Así volver atrás es cambiar el interruptor.
- **La base es la misma**, y las reglas críticas están en RPC y triggers. Por eso la API y Next pueden escribir a la vez sin que los datos diverjan: ambos llaman a las mismas RPC con la misma RLS y el mismo encabezado `x-mirai-enlaces`.
- **Despliegue en paralelo:** Vercel (web; `pruebas` → Preview y `main` → Production) y Cloud Run (`mirai-api-pruebas` y `mirai-api`; en la fase 2 se despliega con `gcloud run deploy` desde Cloud Build disparado por las ramas `pruebas` y `main`; en la fase 3 se pasa a Terraform).
  - **Región `us-west1` (Oregon)**, junto a Supabase `us-west-2` y Vercel `pdx1` (`vercel.json`), para que la latencia web → API → base no aumente. Ver §7, D4.
  - `min-instances=1` en producción para evitar arranques en frío.

### 4.2 Pruebas en cada paso
- **Vitest en `packages/domain`:** las pruebas actuales y la paridad con la v4, sin cambios.
- **API (Vitest + `@nestjs/testing` + `unplugin-swc` para los decoradores):**
  - pruebas unitarias de servicios con repositorios falsos;
  - pruebas de integración contra **Supabase local** (`supabase start` en Docker con `supabase/migrations`), para **no tocar la base compartida ni saturarla**;
  - pruebas de contrato: el mismo caso por Server Action y por endpoint debe dar la misma salida (paridad de migración).
- **E2E Playwright existentes** (escritorio a 1366 px y móvil a 400 px), corridas dos veces en `pruebas`: con el módulo en `off` y en `qa`. El usuario QA queda en `api_rollout`.
- **Prueba de humo después de desplegar la API:** `/readyz`, `/v1/me` con el usuario QA y un CRUD de una categoría de prueba.

### 4.3 Pasos (de menor a mayor riesgo)

| Paso | Qué | Riesgo | Terminado cuando |
|---|---|---|---|
| **0** | Monorepo (`apps/web` con Next movido sin cambios, `packages/domain`, `db`, `config` y `contracts` vacío). Vercel con Root Directory `apps/web` | Bajo (solo mueve archivos) | `pnpm turbo build typecheck lint test` en verde; E2E en verde en `pruebas`; despliegue de Vercel idéntico (misma URL, mismas capturas) |
| **1** | Esqueleto de la API en Cloud Run: `/healthz`, `/readyz`, `/v1/me`, `AuthGuard` con JWKS, errores, logs y trazas. La web **no** lo usa todavía | Bajo | `/v1/me` devuelve lo mismo que `getAppContext` para 3 cuentas de prueba (dueño, colabora y solo mira) |
| **2** | Lecturas sin efectos: `refs` (`ref_*`), `plans` públicos, `ia-uso`, `referidos`, `notifications` (campana), `gami` (lectura) y `public/adsense` | Bajo | Interruptor `on` 1 semana; E2E `f12-ia-uso` y `f7-perfil-ayuda-logros` en verde con `qa` |
| **3** | Catálogos con el CRUD genérico: `categories`, `income_categories`, `entities`, `payment_methods`, `keyword_rules`, `contacts`, `providers`, `wishlist` | Bajo-medio | Paridad del CRUD (lista, guardar, borrar y deshacer) y Realtime que sigue invalidando (las escrituras por la API también disparan `postgres_changes`) |
| **4** | IA sin escritura: `features/ai/actions.ts`, `reports/summary` y la subida por `fileId` | Medio (costos) | `ai_usage` registra igual (misma `feature` y los mismos créditos); E2E `f4-ia-asistentes` y `f4-reportes` en verde |
| **5** | Ajustes e integraciones del hogar, reglas de aviso, pruebas de envío, Telegram, push y Google (con la nueva URI de *callback*) | Medio | Envío de prueba por cada canal registrado en `notification_log` desde la API |
| **6** | Movimientos: `expenses`, `incomes`, `extra_incomes` + comandos (`pay_fixed`, `card_purchase`, `pay_card`, `pay_subscription`, `goal_contribute`, `fund_*`, `asset_cuadrar`, `link_fixed`) y el resto de tablas del libro (`loans`, `savings`, `assets`, `tax`) | **Alto** (es el corazón) | Por grupo: `admins` 3 días → `pct:10` → `on`; E2E `f1-*`, `f2-*`, `f3-*`, `f16`, `f19`, `f20` y `f21` en verde; ningún aumento de errores en Sentry |
| **7** | Chat en streaming y su confirmación de propuestas | Alto (UX) | Tiempo al primer token ≤ el actual + 150 ms; E2E `f14-chat` en verde; cancelar a mitad funciona |
| **8** | Hogar y cuenta (invitaciones, roles, pasar el hogar, sesiones y cambio de correo), importar, respaldos y contador (portal por token) | Alto (permisos) | Matriz de roles completa probada (`ROLE_MATRIX`, 5 roles × permisos) contra la API; E2E `f17`, `f18`, `f1-importar` y `f5-renta` en verde |
| **9** | Cron y automatizaciones: (a) el *tick* de la API corre en **modo simulación** (`dry=1`: calcula y no envía) junto al cron actual y se comparan los reportes 3 días; (b) se cambia `mirai_schedule_notify` a la URL de la API (`select mirai_schedule_notify('https://api.mirai.engynex.com/v1/jobs/notify/tick', …)`) y se quita `crons` de `vercel.json`; (c) se pasa a Cloud Scheduler y se borra el job de `pg_cron`; (d) el runner de automatizaciones del navegador se apaga con el interruptor `automations_server_only` | Alto (envíos) | Cero duplicados (`notification_log` sin claves repetidas en `enviado`) y cero faltantes frente a la simulación |
| **10** | Planes y pagos: `checkout` por la API; webhooks con **doble ruta**: la de Next reenvía el cuerpo crudo y los encabezados a la API (`fetch` con `duplex`), y después se cambia la URL en los tableros de Mercado Pago y Wompi | **Alto** (dinero) | Pagos sandbox de punta a punta en `pruebas`; `apply_plan_payment` idempotente con la misma notificación enviada 3 veces |
| **11** | Consola admin | Medio | Cada acción deja su fila en `admin_audit`; la consola sigue sin mostrar montos (revisión automática del contrato: ningún DTO de `admin` tiene campos `valor`/`monto`) |
| **12** | Limpieza: se borran las Server Actions, `lib/supabase/admin.ts`, `lib/crypto.ts` y las librerías de servidor de `apps/web`. Una regla de ESLint prohíbe `server-only`, `supabaseAdmin`, `@supabase/supabase-js` (excepto `auth`) y `.from(` en `apps/web` | Medio | `apps/web` no tiene `SUPABASE_SECRET_KEY`, `ENCRYPTION_KEY` ni ningún secreto de negocio en Vercel |
| **13** (fase 4) | Cloud SQL + gateway WS + Storage en GCS (§5) | Alto | Ver §5.4 |

---

## 5. Preparación para Cloud SQL

### 5.1 Qué depende de Supabase y con qué se reemplaza

| Dependencia | Dónde | Reemplazo |
|---|---|---|
| **Auth** (contraseña, enlace mágico, Google, MFA TOTP, vincular identidades, sesiones, cambio de correo, Turnstile) | navegador (§1.6) y `features/account/*` | **Identity Platform**: correo y contraseña, enlace de correo, Google, MFA TOTP y reCAPTCHA Enterprise. Los usuarios se importan con `auth.importUsers` usando **hash BCRYPT** (el formato de Supabase), así nadie tiene que restablecer su clave. Las sesiones y su revocación pasan a `revokeRefreshTokens` y una tabla propia `user_sessions`. Puerto `TokenVerifier` con `IdentityPlatformVerifier` (JWKS de `securetoken.google.com`) |
| **`auth.uid()`, `auth.jwt()` en RLS** (125 + 2 usos) | migraciones | Esquema `auth` de compatibilidad en Cloud SQL: `create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid $$` (igual `auth.jwt()` y `auth.role()`) + roles `anon`, `authenticated` y `service_role` (`nologin`) con los mismos `grant`. Las 124 políticas no se tocan |
| **`auth.users`** (59 claves foráneas) + triggers `on_auth_user_created`/`_change` y `on_auth_identity_change` | migraciones | Tabla `auth.users(id uuid pk, email, created_at, last_sign_in_at, external_sub text unique)` que llena la API: en el primer login con Identity Platform, `AuthService.ensureUser(sub)` crea la fila y ejecuta lo que hacía `handle_new_user`. **El `uid` interno sigue siendo el UUID de Supabase** (la importación lo conserva en `localId`). Las funciones que leen `auth.sessions`, `auth.identities` y `auth.mfa_factors` (`cuenta_titularidad.sql`) se reescriben en `AccountService` contra la API de Identity Platform |
| **`request.headers`** (`sync_enlaces_on`) | `20261103003200_enlaces.sql:14` | `set_config('request.headers', …, true)` por transacción (§2.3) |
| **PostgREST** (supabase-js) | adaptador `SupabaseJs` | Adaptador `PgKysely` (§2.3), activado por módulo con `DB_ADAPTER` |
| **Funciones `security definer`** (~90) | migraciones | Se quedan. Hay que revisar `set search_path = public` (ya lo tienen) y que el dueño sea el rol de migraciones (`mirai_owner`, no `cloudsqlsuperuser`) |
| **Realtime** (publicación `supabase_realtime`) | `hooks/use-realtime.ts` | Trigger `pg_notify` + gateway (§2.8). No hace falta replicación lógica ni Datastream |
| **Storage** (7 buckets y políticas en `storage.objects`) | §1.6 | **Cloud Storage**: `mirai-<env>-private` (attachments, backups, logos y feedback) y `mirai-<env>-public` (avatars, ads y public-assets, detrás de Cloud CDN). La autorización pasa a `FilesModule`, que firma URL V4 por 5 minutos después de revisar la membresía del libro (la misma regla `{book_id}/…`). Se copian los objetos con la API S3 de Supabase Storage → `rclone`/`gcloud storage cp` y se reescriben `profiles.avatar_url`, `family_members.avatar` y `ads.*url` con un script idempotente |
| **`pg_cron` + `pg_net`** (job `mirai-notify`) | `20261031001000_notify.sql:18-19` | Cloud Scheduler (§2.7.7). Se borran `mirai_schedule_notify` y `mirai_notify_cron_active`, o quedan como no-op |
| **Clave secreta** (`service_role`) | 38 archivos | `SystemScope` con el rol dueño. Ya no existe una "clave" que se pueda filtrar al navegador |
| **Supavisor** (pooler) | conexiones | Conector de Cloud SQL para Node (IAM) + `pg.Pool` de tamaño pequeño por instancia (`max = 5`), o Managed Connection Pooling de Cloud SQL si está disponible en la edición elegida |
| **Tipos generados** (`supabase gen types`) | `lib/supabase/database.types.ts` | `packages/db`: `kysely-codegen` contra Cloud SQL y, por compatibilidad, los tipos `Database` de hoy (la web y `packages/domain` usan `Row<T>`) |

### 5.2 Migraciones SQL
- Se siguen aplicando con `scripts/db-migrate.mjs` (o con su sucesor en `packages/db`).
- Una migración `00000000_supabase_compat.sql`, que **solo** corre en Cloud SQL, crea los esquemas `auth`, `storage` (vacío, para que las migraciones viejas que lo nombran no fallen) y `extensions`, más los roles y funciones de compatibilidad.
- Las migraciones que tocan `storage.buckets` o `cron.*` quedan envueltas en `do $$ begin if exists (select 1 from pg_namespace where nspname='cron') then … end if; end $$`. Esto se hace al crear el `baseline` de Cloud SQL, no reescribiendo la historia.
- Alternativa más limpia: un `pg_dump --schema-only` de Supabase filtrado se convierte en `baseline.sql` para Cloud SQL, y las migraciones nuevas parten de ahí.

### 5.3 Migración de datos
1. **Ensayo** (varias veces, en pruebas): `pg_dump --data-only --schema=public` + la parte de `auth.users` que hace falta (id, email y fechas) → `pg_restore` en Cloud SQL → comparar conteos por tabla y sumas de control (`md5(string_agg(...))` por tabla y libro) con un script.
2. **Database Migration Service** (continua, con CDC) si el origen lo permite: requiere `pglogical` o replicación lógica y permisos que **hay que confirmar** en el plan de Supabase. Plan B: la base es pequeña (finanzas personales), así que el volcado completo cabe en una ventana corta.
3. **Corte:**
   1. Aviso en la app (`platform_settings.aviso_global`).
   2. `platform_settings.mantenimiento = true`: la API responde 503 "Estamos actualizando Mirai, vuelve en unos minutos" a las escrituras, y la web muestra el aviso.
   3. Se apagan los jobs de Scheduler.
   4. Volcado final o promoción de DMS → verificación de conteos.
   5. `DB_ADAPTER=pg` en la API.
   6. Identity Platform toma el login (los usuarios ya se importaron antes; se repite la importación para los nuevos en el corte).
   7. Gateway `live=gateway`.
   8. Pruebas de humo + E2E corto.
   9. Se quita el mantenimiento.
4. **Vuelta atrás:**
   - Supabase queda **intacto y en solo lectura** hasta 7 días.
   - Si algo falla **antes** de reabrir escrituras: `DB_ADAPTER=supabase` y el login vuelve a Supabase Auth (el interruptor de la web).
   - Si falla **después**: replicación lógica Cloud SQL → Supabase (Cloud SQL publica con `cloudsql.logical_decoding`), preparada en el ensayo, o un volcado de las tablas tocadas desde el corte (`updated_at > corte`, todas las tablas tienen `trg_touch`).

### 5.4 Terminado (fase 4)
- Cero diferencias en los conteos y sumas por tabla.
- E2E completos en verde contra Cloud SQL.
- Latencia p95 de `/v1/me` ≤ la de hoy.
- `pg_notify` → gateway entrega los cambios en menos de 1 s.
- Ningún secreto de Supabase en uso durante 7 días.
- Supabase en pausa.

---

## 6. Estructura del monorepo

### 6.1 Árbol

```
mirai/
├─ package.json                 # "packageManager": "pnpm@<9.x o 10.x>", scripts turbo
├─ pnpm-workspace.yaml          # apps/*, packages/*
├─ turbo.json                   # build, typecheck, lint, test, test:e2e (dependsOn ^build)
├─ supabase/migrations/         # se queda en la raíz (fuente única del esquema)
├─ docs/
├─ legacy/
├─ apps/
│  ├─ web/                      # el Next.js actual (app/, components/, features/, hooks/, lib/ de UI, public/, tests/e2e)
│  │  ├─ lib/api/client.ts      # cliente ts-rest del navegador
│  │  ├─ lib/api/server.ts      # cliente para RSC (token desde la cookie)
│  │  └─ lib/api/rollout.ts     # source(módulo) → 'api' | 'legacy'
│  └─ api/
│     ├─ Dockerfile             # multi-stage: turbo prune api --docker → pnpm deploy → node:22-slim (distroless opcional)
│     ├─ src/
│     │  ├─ main.ts             # Fastify, rawBody, CORS, OTel (se carga primero: src/otel.ts), MODE=api|realtime
│     │  ├─ app.module.ts       # importa core + modules/index.ts
│     │  ├─ core/
│     │  │  ├─ config/          # esquema zod de las variables
│     │  │  ├─ auth/            # TokenVerifier (puerto), SupabaseJwtVerifier, IdentityPlatformVerifier, AuthGuard, @Public
│     │  │  ├─ context/         # RequestContext (nestjs-cls), BookGuard, @MinRole, @Can, @Premium, @PlatformAdmin
│     │  │  ├─ db/              # DbScope, SupabaseJsFactory, PgKyselyFactory, SystemScope
│     │  │  ├─ errors/          # DomainError, filtro global → { ok:false, msg, code }
│     │  │  ├─ rate-limit/      # ThrottlerStorage → rate_limit_hit
│     │  │  ├─ idempotency/     # IdempotencyInterceptor
│     │  │  ├─ queue/           # QueuePort, CloudTasksQueue, InlineQueue
│     │  │  ├─ events/          # EventsService (LiveChange + outbox de automatizaciones)
│     │  │  ├─ crypto/          # lib/crypto.ts movido
│     │  │  ├─ logging/         # nestjs-pino (formato de Cloud Logging)
│     │  │  └─ health/          # terminus
│     │  └─ modules/
│     │     ├─ index.ts         # lista de todos los módulos (F2-B la crea con todos los módulos como stubs)
│     │     ├─ me/  account/  households/  books/  book-tables/  catalogs/  expenses/  incomes/
│     │     ├─ fixed/  cards/  loans/  savings/  assets/  budget/  insights/  tax/  billing/
│     │     ├─ ai/  chat/  notifications/  integrations/  google/  automations/  import/
│     │     ├─ gami/  ads/  feedback/  admin/  files/  realtime/  jobs/
│     └─ test/                  # integración (supabase local) y contrato
└─ packages/
   ├─ domain/      # lib/domain + lib/household/roles.ts + lib/plans.ts + lib/integrations/resolve.ts + lib/book-data.ts (con un cargador como puerto)
   │               # sin dependencias de runtime; "exports" ESM; pruebas Vitest (incluida la paridad v4)
   ├─ contracts/   # esquemas zod, contratos ts-rest, ApiError, ChatEvent, LIVE_TABLES, BOOK_TABLE_POLICY, LIMITS, zod-es
   ├─ db/          # database.types.ts (supabase gen), tables.ts (Row/Insert/Update/qk), tipos Kysely (codegen) y migrate
   ├─ ai/          # (opcional, si la web aún necesita prompts o precios del lado del cliente) prompts.ts, pricing.ts, features.ts
   └─ config/      # tsconfig base (strict, ES2023, moduleResolution bundler), eslint (flat), prettier, vitest preset
```

Dónde termina hoy cada cosa:
- `lib/notify`, `lib/automations/server.ts`, `lib/payments`, `lib/google*`, `features/*/actions.ts` y `server.ts` → `apps/api/src/modules/*`.
- `lib/automations/engine.ts` y `schema.ts` (puros) → `packages/domain/automations`.
- `lib/content/*` y `lib/data/*` se quedan en `apps/web`. Si la API necesita textos (avisos y correos), se mueven a `packages/content`.

### 6.2 Ejemplo completo: módulo `expenses`

**`packages/contracts/src/expenses.ts`**
```ts
import { z } from "zod"
import { initContract } from "@ts-rest/core"
import type { Insert } from "@mirai/db"
import { ApiError, Uuid, IsoDate, Money } from "./common"

export const ExpenseUpsert = z.object({
  id: Uuid,                                   // lo genera el navegador (idempotente)
  fecha: IsoDate,
  descripcion: z.string().trim().min(1, "Escribe en qué gastaste").max(200),
  valor: Money.positive("El valor debe ser mayor que cero"),
  category_id: Uuid.nullable(),
  payment_method_id: Uuid.nullable(),
  member_id: Uuid.nullable().optional(),
  origen: z.enum(["manual", "tarjeta", "correo", "importar", "compartido", "fijo", "chat"]).default("manual"),
  external_id: z.string().max(200).nullable().optional(),
}) satisfies z.ZodType<Partial<Insert<"expenses">>>

export const LinkFixed = z.object({ fixedId: Uuid, periodo: z.string().regex(/^\d{4}-\d{2}(-[12])?$/) })

const c = initContract()
export const expensesContract = c.router({
  linkFixed: {
    method: "POST", path: "/v1/books/:bookId/expenses/:id/link-fixed",
    pathParams: z.object({ bookId: Uuid, id: Uuid }), body: LinkFixed,
    responses: { 200: z.object({ ok: z.literal(true) }), 400: ApiError, 403: ApiError, 404: ApiError },
  },
  useFund: {
    method: "POST", path: "/v1/books/:bookId/expenses/:id/use-fund",
    pathParams: z.object({ bookId: Uuid, id: Uuid }), body: z.object({ fundId: Uuid }),
    responses: { 200: z.object({ ok: z.literal(true) }), 403: ApiError, 409: ApiError },
  },
})
// El CRUD (list/upsert/delete/restore) sale del contrato genérico book-tables con BOOK_TABLE_POLICY.expenses.
```

**`apps/api/src/modules/expenses/expenses.repository.ts`** (puerto)
```ts
import type { DbScope } from "@/core/db/scope"
export abstract class ExpensesRepo {
  abstract linkFixed(s: DbScope, a: { expenseId: string; fixedId: string; periodo: string }): Promise<void>
  abstract unlinkFixed(s: DbScope, expenseId: string): Promise<void>
  abstract useFund(s: DbScope, a: { expenseId: string; fundId: string }): Promise<void>
  abstract ownerOf(s: DbScope, expenseId: string): Promise<{ created_by: string | null; book_id: string } | null>
}
```

**`apps/api/src/modules/expenses/adapters/supabase-js.expenses.repo.ts`** (hoy)
```ts
@Injectable()
export class SupabaseJsExpensesRepo extends ExpensesRepo {
  constructor(private readonly sb: SupabaseJsFactory) { super() }
  async linkFixed(s: DbScope, a: { expenseId: string; fixedId: string; periodo: string }) {
    const { error } = await this.sb.for(s).rpc("link_expense_fixed", { p_expense: a.expenseId, p_fixed: a.fixedId, p_periodo: a.periodo })
    if (error) throw DomainError.fromPg(error)          // traduce 42501 (RLS) → ROLE_DENIED, P0001 → msg de la función
  }
  // …
}
```

**`apps/api/src/modules/expenses/adapters/pg-kysely.expenses.repo.ts`** (Cloud SQL)
```ts
@Injectable()
export class PgKyselyExpensesRepo extends ExpensesRepo {
  constructor(private readonly db: PgKyselyFactory) { super() }
  linkFixed(s: DbScope, a: { expenseId: string; fixedId: string; periodo: string }) {
    return this.db.tx(s, (trx) =>                         // tx(): set local role + set_config(claims, headers)
      sql`select public.link_expense_fixed(${a.expenseId}, ${a.fixedId}, ${a.periodo})`.execute(trx).then(() => undefined))
  }
  // …
}
```

**`apps/api/src/modules/expenses/expenses.service.ts`**
```ts
@Injectable()
export class ExpensesService {
  constructor(private readonly repo: ExpensesRepo, private readonly events: EventsService, private readonly cls: ClsService<RequestContext>) {}
  async linkFixed(expenseId: string, input: z.infer<typeof LinkFixed>) {
    const ctx = this.cls.get()
    const row = await this.repo.ownerOf(ctx.db, expenseId)
    if (!row || row.book_id !== ctx.book.id) throw DomainError.notFound("No encontramos ese gasto")
    if (!canEditRow(ctx.access, row, ctx.user.id)) throw DomainError.role("Tu rol solo te deja cambiar los gastos que registraste tú")
    await this.repo.linkFixed(ctx.db, { expenseId, ...input })
    this.events.changed(ctx.book.id, ["expenses", "fixed_expense_payments", "fixed_expenses"], expenseId)
    return { ok: true as const }
  }
}
```

**`apps/api/src/modules/expenses/expenses.controller.ts`**
```ts
@Controller()
@UseGuards(BookGuard)
export class ExpensesController {
  constructor(private readonly svc: ExpensesService) {}
  @TsRestHandler(expensesContract.linkFixed)
  @MinRole("registra") @Idempotent()
  linkFixed() {
    return tsRestHandler(expensesContract.linkFixed, async ({ params, body }) => ({ status: 200, body: await this.svc.linkFixed(params.id, body) }))
  }
}
```

**`apps/api/src/modules/expenses/expenses.module.ts`**
```ts
@Module({
  imports: [DbModule, EventsModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, { provide: ExpensesRepo, useClass: env.DB_ADAPTER === "pg" ? PgKyselyExpensesRepo : SupabaseJsExpensesRepo }],
  exports: [ExpensesService],                           // el chat y las automatizaciones lo usan
})
export class ExpensesModule {}
```

Archivos de prueba: `expenses.service.spec.ts` (con un repositorio falso: roles × filas propias), `test/expenses.int.spec.ts` (Supabase local: RLS real con 5 usuarios, uno por rol) y `test/expenses.contract.spec.ts` (paridad con `features/expenses/expense-form.tsx:237-241`).

### 6.3 Dependencias

**`apps/api`:** `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-fastify`, `@nestjs/config`, `@nestjs/terminus`, `@nestjs/throttler`, `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `@socket.io/redis-adapter`, `redis`, `nestjs-cls`, `nestjs-pino`, `pino`, `@ts-rest/core`, `@ts-rest/nest`, `@ts-rest/open-api`, `zod` (4), `jose`, `@supabase/supabase-js`, `pg`, `kysely`, `@google-cloud/cloud-sql-connector`, `@google-cloud/tasks`, `@google-cloud/storage`, `google-auth-library` (verificar OIDC de Scheduler y Tasks), `firebase-admin` (Identity Platform, fase 4), `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/groq`, `@openrouter/ai-sdk-provider`, `resend`, `nodemailer`, `web-push`, `exceljs` (si la importación se hace en el servidor), `@react-pdf/renderer` (si los reportes en PDF pasan al servidor), `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, `@google-cloud/opentelemetry-cloud-trace-exporter`, `@sentry/nestjs` y `date-fns` + `@date-fns/tz`.
Desarrollo: `vitest`, `unplugin-swc`, `@swc/core`, `@nestjs/testing`, `supertest`, `kysely-codegen`, `supabase` (CLI para la base local) y `tsx`.

**`apps/web`:** las de hoy menos `nodemailer`, `resend`, `web-push`, `server-only` (en lo de negocio), `@ai-sdk/*`/`ai` (salvo tipos) y `exceljs` (si la exportación queda en el cliente, se mantiene). Más `@ts-rest/core`, `@ts-rest/react-query` y `socket.io-client` (cuando entre el gateway).

**`packages/*`:** `domain` sin dependencias de runtime (solo `date-fns` si ya la usa); `contracts` → `zod` y `@ts-rest/core`; `db` → `kysely` (solo tipos) y `pg` (en el script de migración); `config` → `typescript`, `eslint`, `prettier` y `vitest`.

---

## 7. Riesgos y decisiones abiertas

### 7.1 Riesgos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R1 | **La base está saturada y la comparten pruebas y producción** | Una API con un pool propio la satura más; las pruebas de la API dañan datos de producción | Fase 2 con adaptador `SupabaseJs` (PostgREST, sin conexiones nuevas); pruebas de integración en **Supabase local**; separar la base de pruebas (`docs/DEPLOY-VERCEL.md`, "Separar la base de datos de pruebas") **antes del paso 6** |
| R2 | Mover Next a `apps/web` (paso 0) choca con los agentes que editan el PWA y la portada | Conflictos en cientos de archivos | Hacer el paso 0 **después** de integrar esos cambios, en una ventana sin otros agentes, con `git mv` puro en un solo commit y sin editar contenido |
| R3 | Latencia extra (navegador → API → base) | La app se siente más lenta | Región `us-west1` junto a Supabase y Vercel; `min-instances=1`; `/v1/me` con caché de 30 s por (usuario, libro); los cálculos siguen en el cliente; HTTP/2 en Cloud Run |
| R4 | Doble escritura durante la transición (Server Action y API para lo mismo) | Datos duplicados | Interruptores por módulo y por persona (no por pantalla); UUID del navegador + upsert; RPC transaccionales; `Idempotency-Key` |
| R5 | Las cascadas de la base dependen del encabezado `x-mirai-enlaces` | Si la API no lo manda, los enlaces gasto ↔ tarjeta ↔ fijo se rompen sin dar error | Lo agrega la fábrica de clientes (`SupabaseJsFactory`) y `tx()`, con una prueba de integración que lo verifica |
| R6 | ts-rest y zod 4 | El contrato no compila | Prueba previa F2-A-6; plan B (`nestjs-zod` + OpenAPI) sin cambiar los esquemas |
| R7 | Streaming en Cloud Run (búferes y *timeouts*) | El chat se corta | Fastify sin búfer, latido NDJSON cada 15 s, *timeout* de 300 s y prueba E2E de cancelación |
| R8 | Webhooks de pagos durante el cambio de URL | Pagos que no se aplican | Proxy desde Next con el cuerpo crudo; `apply_plan_payment` idempotente; se concilia con `adminRevenue` |
| R9 | Funciones que leen `auth.sessions`, `auth.identities` y `auth.mfa_factors` | No existen en Cloud SQL | Reescribirlas en `AccountService` contra Identity Platform **antes** del corte (fase 4) |
| R10 | El cron recorre todo en serie (`route.ts:48-69`) | *Timeout* cuando crezcan los usuarios | Fan-out por hogar con Cloud Tasks (§2.7.7) |
| R11 | Costo fijo (Memorystore + `min-instances`) | Gasto mensual | Redis solo cuando entre el gateway (fase 4); en la fase 2, Cloud Run con `min-instances=1` solo en producción |
| R12 | Secretos en dos lugares durante la transición (Vercel y Secret Manager) | Se desincronizan; `ENCRYPTION_KEY` distinta = integraciones ilegibles | Paso 12: se quitan de Vercel. Mientras tanto, una prueba en `/readyz` descifra una integración de control |

### 7.2 Decisiones abiertas

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | Dominio de la API | (a) `api.mirai.engynex.com` + CORS + Bearer; (b) *rewrite* de Vercel `/api/v1/*` → Cloud Run (mismo origen) | **(a)**: sin doble salto ni límites de Vercel en el streaming, y lista para una app nativa. (b) solo si CORS da problemas con algún navegador |
| D2 | Contrato | ts-rest frente a OpenAPI primero | **ts-rest**, si pasa la prueba con zod 4 |
| D3 | ¿Los cálculos se pasan al servidor? | Cliente (hoy) frente a `insights` en la API | **Se quedan en el cliente**; la API los expone solo para el chat, los avisos, el contador y clientes futuros |
| D4 | Región definitiva | `us-west1` (junto a Supabase) frente a `us-east1` o `southamerica-*` (más cerca de Colombia) | `us-west1` mientras la base esté en Supabase `us-west-2`. **Elegir la región de Cloud SQL y de todo el sistema juntos en la fase 3** (medir latencia desde Bogotá) |
| D5 | CRUD genérico frente a módulos explícitos | `book-tables` + comandos frente a 33 controladores | **Genérico + comandos** (§2.5), con la política declarativa revisable |
| D6 | ¿Cuándo Identity Platform? | Antes, con o después de Cloud SQL | **Con Cloud SQL** (fase 4), porque los dos tocan `auth.*`. El puerto `TokenVerifier` queda listo en la fase 2 |
| D7 | Redis | Ahora frente a cuando entre el gateway | **Cuando entre el gateway.** El límite de tasa sigue con `rate_limit_hit` hasta entonces |
| D8 | ¿El servicio WS va aparte? | Mismo servicio frente a `mirai-realtime` | **Aparte**, con la misma imagen y `MODE=realtime` |
| D9 | Versión de la API | `/v1` en la ruta frente a encabezado | **`/v1` en la ruta** |

---

## 8. Backlog de la fase 2

Cada frente es dueño de sus carpetas y ningún otro las edita. Los archivos compartidos (`apps/api/src/modules/index.ts`, `packages/contracts/src/index.ts`) los crea **F2-B** y **F2-A** con todos los módulos ya listados (como stubs vacíos), así que los demás frentes solo llenan su propia carpeta y su archivo de contrato.

```
F2-A ──► F2-B ──┬──► F2-C ──► F2-D ─────────────┐
                ├──► F2-E ──► F2-F               ├──► F2-H (por módulo, según llegan)
                ├──► F2-I                        │
                └──► F2-G (en paralelo; prod en fase 4)
```

### F2-A — Monorepo y paquetes compartidos
**Dueño de:** la raíz (`package.json`, `pnpm-workspace.yaml`, `turbo.json`), `packages/*` y el movimiento a `apps/web`. **Depende de:** que el PWA y la portada ya estén integrados (R2).
1. **F2-A-1** Crear el workspace pnpm + Turborepo y `packages/config` (tsconfig, eslint, prettier, vitest).
2. **F2-A-2** `git mv` de la app a `apps/web` (sin editar contenido) y ajustar alias `@/*`, `scripts/*`, Playwright (`tests/e2e`) y Vercel (Root Directory `apps/web`, "Include files outside root").
3. **F2-A-3** `packages/db`: `database.types.ts`, `tables.ts` (`Row`, `Insert`, `qk`), `db:migrate`, `db:types` y la carpeta `supabase/` en la raíz.
4. **F2-A-4** `packages/domain`: mover `lib/domain/**`, `lib/household/roles.ts`, `lib/plans.ts`, `lib/integrations/resolve.ts`, `lib/automations/{engine,schema,types,limits}.ts` y `lib/book-data.ts` (con el cargador como parámetro). `apps/web` re-exporta desde `@mirai/domain` para no tocar todos los `import` de una vez.
5. **F2-A-5** `packages/contracts`: `common.ts` (`Uuid`, `Money`, `IsoDate`, `ApiError`), `zod-es.ts`, `live.ts` (`LIVE_TABLES`, `HOUSEHOLD_TABLES`), `limits.ts` (`LIMITS`), `book-tables.ts` (`BOOK_TABLE_POLICY` de las 33 tablas) y un stub por módulo.
6. **F2-A-6** Prueba previa de ts-rest + zod 4 + `@ts-rest/nest` + `@ts-rest/react-query` (un endpoint de ejemplo). Decidir D2 y documentarlo aquí.
7. **F2-A-7** CI: `turbo run lint typecheck test build` en cada PR; Playwright contra el despliegue de pruebas.

**Terminado cuando:** `pnpm i && pnpm turbo build typecheck lint test` en verde; E2E en verde en `pruebas`; Vercel despliega `apps/web` igual que antes (mismas capturas); las pruebas de paridad v4 corren desde `packages/domain`.

### F2-B — Esqueleto NestJS, autenticación y transversal
**Dueño de:** `apps/api/src/{main.ts,app.module.ts,otel.ts,core/**}`, `apps/api/Dockerfile`, `apps/api/test/setup/**` y `modules/index.ts` (con todos los stubs). **Depende de:** F2-A-1, A-3, A-5 y A-6.
1. **F2-B-1** `main.ts` (Fastify, `rawBody`, CORS, apagado ordenado, `MODE=api|realtime`), `config/` con zod y `health/` (terminus).
2. **F2-B-2** `auth/`: puerto `TokenVerifier`, `SupabaseJwtVerifier` (JWKS `…/auth/v1/.well-known/jwks.json` con `jose.createRemoteJWKSet`; HS256 si el proyecto aún no rota a claves asimétricas), `AuthGuard` y `@Public`.
3. **F2-B-3** `context/`: `RequestContext` (nestjs-cls), `BookGuard` (membresía, `access_role` y plan, caché de 30 s), `@MinRole`, `@Can`, `@Premium`, `@PlatformAdmin`, `SchedulerGuard` (OIDC + Bearer de transición) y `AccountantTokenGuard`.
4. **F2-B-4** `db/`: `DbScope`, `SupabaseJsFactory` (Bearer de la persona + `x-mirai-enlaces`), `SystemScope` (clave secreta + `reason`), y `PgKyselyFactory` con `tx()` (`set local role` + `set_config`) probada contra Supabase local.
5. **F2-B-5** `errors/` (`DomainError`, `fromPg`, filtro global), `logging/` (pino, formato de Cloud Logging, campos ocultos), OTel → Cloud Trace y Sentry.
6. **F2-B-6** `rate-limit/` (`ThrottlerStorage` → `rate_limit_hit`), `idempotency/` (migración aditiva `api_idempotency` + interceptor), `queue/` (`QueuePort`, `CloudTasksQueue`, `InlineQueue`) y `events/` (`EventsService`, sin gateway: no-op + *outbox*).
7. **F2-B-7** `crypto/` (mover `lib/crypto.ts` con sus pruebas; una prueba de compatibilidad descifra un valor cifrado por la v5).
8. **F2-B-8** Módulo `me`: `GET /v1/me` (paridad con `getAppContext`) y migración aditiva `platform_settings.api_rollout`.
9. **F2-B-9** `Dockerfile` (turbo prune + pnpm deploy), `cloudbuild.yaml` mínimo y despliegue manual a Cloud Run `mirai-api-pruebas` (`us-west1`) con secretos de Secret Manager.
10. **F2-B-10** Arnés de pruebas: Supabase local con `supabase/migrations`, 5 usuarios semilla (uno por rol) y utilidades de Supertest.

**Terminado cuando:** `/readyz` en verde en Cloud Run de pruebas; `/v1/me` da el mismo resultado que `getAppContext` para los 5 roles; un error de rol devuelve `{ ok:false, msg:"Tu rol no permite…", code:"ROLE_DENIED" }` con 403; el log se ve agrupado por traza en Cloud Logging.

### F2-C — Módulos de lectura
**Dueño de:** `modules/{book-tables (solo lectura), insights, gami, ads (lectura), notifications (solo la campana), refs}` y sus contratos. **Depende de:** F2-B.
1. **F2-C-1** `book-tables` de lectura: `GET /v1/books/:b/t/:table` (con `eq`, `order` y `select` en lista blanca por tabla) y `GET …/snapshot?parts=` (`loadBookData` / `loadBookPart`).
2. **F2-C-2** `refs`: `GET /v1/refs/{uvt,trm,usura,festivos,renta-calendar,renta-regimenes}` con caché HTTP (`s-maxage`).
3. **F2-C-3** `billing` lectura pública: `GET /v1/plans` y `GET /v1/households/:h/subscription` (solo la parte de lectura; los comandos son de F2-I).
4. **F2-C-4** `insights`: `views/{flujo-integral,balance,dashboard,indicadores,agenda,hallazgos}` y `reports/:mes` con `packages/domain`, más pruebas de paridad contra el cálculo del cliente con el libro de ejemplo (`lib/data/sample-v4.json`).
5. **F2-C-5** Campana: `GET /v1/notifications` y `PATCH …/:id/read`.
6. **F2-C-6** `gami`, referidos e `ia-uso` (lectura): `GET /v1/me/gami`, `/v1/me/referrals` y `/v1/books/:b/ai/usage`.

**Terminado cuando:** cada endpoint tiene una prueba de integración con RLS (el que solo mira lee; alguien que no es miembro recibe 404) y una de paridad; latencia p95 < 250 ms en Cloud Run de pruebas.

### F2-D — Módulos de escritura
**Dueño de:** `modules/{book-tables (escritura), catalogs, expenses, incomes, fixed, cards, loans, savings, assets, budget, tax (sin portal), import, feedback, files}`. **Depende de:** F2-B y F2-C-1.
1. **F2-D-1** `book-tables` de escritura: `PUT` (upsert idempotente), `DELETE` (borrado lógico), `restore` y la regla `own` para "Registra sus gastos". Emite `EventsService.changed`.
2. **F2-D-2** `files`: URL firmada de subida y descarga con las reglas de cada bucket; tipos MIME y tamaños como en `20261103001400_seguridad.sql`.
3. **F2-D-3** `expenses` (`link-fixed`, `unlink-fixed`, `use-fund`, `import` en lote con `external_id`).
4. **F2-D-4** `fixed` (`pay`, `unpay`) y suscripciones (`charge`).
5. **F2-D-5** `cards` (`purchases`, `payments`).
6. **F2-D-6** `savings` (`contribute`, `funds/save|use`) y `assets` (`reconcile`, foto del patrimonio).
7. **F2-D-7** `loans` (pagos; el recordatorio delega a F2-E).
8. **F2-D-8** `tax` (CRUD + `renta/:año`), `budget` (tope) e `incomes/plan`.
9. **F2-D-9** `import` (v4, ejemplo, respaldos, restaurar y exportar) y `feedback`.

**Terminado cuando:** cada comando tiene pruebas de integración (rol permitido y denegado, idempotencia con la misma llave, cascadas de la base verificadas con `x-mirai-enlaces`); la paridad con la RPC llamada desde el navegador da filas idénticas.

### F2-E — Notificaciones, integraciones, Google, cron y colas
**Dueño de:** `modules/{notifications (envíos, reglas, push, telegram), integrations, google, automations, jobs}`. **Depende de:** F2-B (F2-D solo para que las automatizaciones usen los servicios de escritura, por inyección).
1. **F2-E-1** `integrations`: mover `registry.ts`, `store.ts` (`getIntegration`, `getOwnIntegration`, `getGlobalIntegration`) y `refresh.ts`/`data-sources.ts`; endpoints del hogar (con máscara) y `test`/`models`.
2. **F2-E-2** `notifications`: mover `lib/notify/*` completo (digest, canales, correo, WhatsApp, Telegram, push y log/claim); endpoints de reglas, prueba, resumen ahora, Telegram y suscripciones push.
3. **F2-E-3** `google`: `connect-url` con `state` firmado (HMAC con `GOOGLE_OAUTH_STATE_KEY`), `callback` (nueva URI en Google Cloud), `mail/scan` y `calendar/sync|status`.
4. **F2-E-4** `automations`: CRUD, `test`, `defaults`, `processBook` y *drain*; `EventsService` encola `automations/book/:b` después de cada escritura.
5. **F2-E-5** `jobs`: `notify/tick` (latido, `horarioActivo`, fan-out por hogar con Cloud Tasks y nombres deterministas), `notify/household/:h`, `refs/refresh`, `calendar/sync`, `plan/reminders`, `net-worth/monthly` y modo `dry=1`.
6. **F2-E-6** Cloud Scheduler (pruebas) y colas de Cloud Tasks `notify`, `automations` y `slow` (creadas con `gcloud`; Terraform en la fase 3).

**Terminado cuando:** en simulación, el *tick* produce el mismo `report` que `app/api/cron/notify` para el mismo minuto; ningún envío duplicado en 3 días de simulación comparada; envío de prueba real por cada canal desde la API.

### F2-F — IA, chat y streaming
**Dueño de:** `modules/{ai, chat}` y `packages/ai` (si se crea). **Depende de:** F2-B y F2-E-1 (integraciones). Usa los servicios de F2-D por inyección para confirmar propuestas; mientras F2-D no termine, puede usar `SystemScope` + RPC del mismo modo que `features/chat/confirm.ts`.
1. **F2-F-1** Mover `lib/ai/*` (run, model, router, usage, prompts, pricing, credits, features, compact) con sus pruebas.
2. **F2-F-2** Endpoints de `features/ai/actions.ts` (10) con entrada por `fileId` y compatibilidad multipart.
3. **F2-F-3** `chat/messages` en streaming NDJSON (Fastify `reply.raw`, latido, cancelación), con el mismo `ChatEvent` en `packages/contracts`.
4. **F2-F-4** Hilos, mensajes, duplicar, título, sugerencias, adjuntos y `proposals/:id/confirm|cancel` (`features/chat/confirm.ts`).
5. **F2-F-5** Consejero (`features/advisor/engine.ts`) y `reports/:mes/summary`.

**Terminado cuando:** `ai_usage` registra igual (la misma `feature`, los mismos créditos ±1 %); tiempo al primer token ≤ el actual + 150 ms; el plan Gratis recibe `PLAN_REQUIRED` con el mismo mensaje de `run.ts:91`; E2E `f14-chat` en verde con `qa`.

### F2-G — Gateway de WebSocket
**Dueño de:** `modules/realtime/**`, la migración de los triggers `mirai_live_notify` (aditiva, **sin aplicarla en la base compartida** hasta la fase 4) y `apps/web/hooks/use-live-gateway.ts` (archivo nuevo). **Depende de:** F2-B-2, B-3 y B-6.
1. **F2-G-1** Gateway socket.io: autenticación en el *handshake*, `join:book` con membresía, salas de libro, hogar y persona, y revisión periódica del token.
2. **F2-G-2** Fuente de cambios: `EventsService` → `io.to(...)`; `PgListener` (`LISTEN mirai_live`, con candado consultivo) para lo que escribe la base.
3. **F2-G-3** Presencia con TTL (en memoria en una sola instancia; adaptador Redis detrás de una variable).
4. **F2-G-4** Migración `mirai_live_notify` generada desde `LIVE_TABLES` (en `supabase/migrations`, protegida por `platform_settings.live_notify` o aplicada solo en Supabase local y Cloud SQL).
5. **F2-G-5** Cliente `use-live-gateway.ts` con la misma interfaz que `useBookRealtime` (`status`, `online`), que reutiliza `invalidateBook` e `isLocalEcho`. Interruptor `live=supabase|gateway`.

**Terminado cuando:** con Supabase local, dos navegadores ven el cambio del otro en menos de 1 s, la presencia funciona y, al reconectar, se recarga el libro; prueba de carga de 500 conexiones por instancia.

### F2-H — Front: cliente de la API y migración de llamadas
**Dueño de:** `apps/web/lib/api/**`, `apps/web/hooks/use-book-data.ts` (solo el selector de fuente) y `apps/web/features/*/api.ts` (archivos nuevos que reemplazan los `actions.ts`). **Depende de:** F2-A y de cada módulo de la API en cuanto llega. Puede avanzar en paralelo usando el contrato con un servidor simulado (MSW) antes de que el endpoint exista.
1. **F2-H-1** `lib/api/client.ts` (Bearer, `traceparent`, idempotencia, `ApiError` → toast), `lib/api/server.ts` (RSC) y `lib/api/rollout.ts`.
2. **F2-H-2** `getAppContext()` → `api.me()` con respaldo a la versión actual (detrás del interruptor).
3. **F2-H-3** `useList`, `useSave` y `useSoftDelete` con un selector de fuente por tabla, sin cambiar la firma ni las claves.
4. **F2-H-4** *Hooks* de comandos que reemplazan las 20 llamadas RPC del navegador (§1.6).
5. **F2-H-5** Reemplazar las Server Actions por `features/<x>/api.ts`, un módulo a la vez, siguiendo el orden de §4.3.
6. **F2-H-6** Chat: `features/chat/store.ts:115` apunta a `NEXT_PUBLIC_API_URL` con Bearer.
7. **F2-H-7** CSP: `connect-src` con el origen de la API (y del WS) en `lib/security/headers.ts`.
8. **F2-H-8** E2E: proyecto de Playwright `api-on` (QA en `api_rollout`), corrido junto al normal.
9. **F2-H-9** Paso 12: reglas de ESLint que prohíben el backend en `apps/web` y borrado de las Server Actions migradas.

**Terminado cuando:** cada módulo en `on` pasa sus E2E con `api-on`; `apps/web` ya no tiene secretos de negocio en Vercel.

### F2-I — Hogar, cuenta, planes y consola admin
**Dueño de:** `modules/{households, books, account, billing (comandos y webhooks), admin, tax/accountant-portal}`. **Depende de:** F2-B (y F2-E-2 para los correos de invitación y del plan, por inyección).
1. **F2-I-1** `households` + `books` (bienvenida, invitaciones, roles, familia, pasar el hogar, salir y borrar) con la matriz de roles completa en las pruebas.
2. **F2-I-2** `account` (correo, métodos, sesiones y borrar cuenta) sobre Supabase Auth Admin, detrás de un puerto `IdentityAdmin` (preparado para Identity Platform).
3. **F2-I-3** `billing`: `checkout`, `coupons/preview`, `renewal` y webhooks `mercadopago`/`wompi` con firma sobre el cuerpo crudo y `applyPayment`; proxy temporal desde `apps/web/app/api/pagos/*` (lo hace F2-H).
4. **F2-I-4** Portal del contador por token (`/v1/accountant/:token/**`) con `SystemScope` + límite.
5. **F2-I-5** `admin`: las 45 acciones de `features/admin/*` con `@PlatformAdmin`, `admin_audit` y una prueba que revisa que ningún DTO de `admin` tenga montos.

**Terminado cuando:** E2E `f17-hogar`, `f18-cuenta`, `f9-planes`, `f8-opiniones-admin` y `f5-renta` en verde con `api-on`; pagos sandbox de punta a punta; un webhook repetido 3 veces aplica una sola vez.

### Orden recomendado
1. **F2-A** solo y primero: mueve archivos, así que nadie más trabaja mientras tanto.
2. **F2-B**: es la base de la API.
3. En paralelo: **F2-C**, **F2-E**, **F2-G** e **F2-I**, más **F2-H-1/H-2** contra el servidor simulado.
4. **F2-D**, cuando estén F2-C-1 y F2-B.
5. **F2-F**, cuando esté F2-E-1.
6. **F2-H** va migrando módulo por módulo según §4.3, y cierra con H-9 (limpieza).
