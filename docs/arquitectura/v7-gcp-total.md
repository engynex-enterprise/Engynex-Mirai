# Mirai v7: todo en GCP (sin Vercel ni Supabase) y portable a otra nube

> Documento de arquitectura escrito el 2026-11-02 en la rama `v6`. Solo leí el código: no edité `apps/` ni `packages/`, no corrí builds, E2E ni migraciones y no me conecté a la base ni a la nube.
> Las referencias `archivo:línea` son del árbol de trabajo de ese día (commit `8dcc093`). Pueden moverse unas líneas si la batería E2E que está corriendo deja cambios.
> Lecturas base: `CLAUDE.md`, `AGENTS.md`, `docs/arquitectura/v6-separacion-front-back.md` (doc v6), `docs/arquitectura/v6-f2h-encendido.md` (F2-H), `docs/infra/estrategia-gcp.md` (estrategia), `docs/infra/runbook.md`, `apps/api/README.md` e `infra/terraform/**`.

**Dos decisiones del dueño que manda este documento:**
1. *"Nada va a quedar en Vercel ni Supabase: todo pasa a GCP, inclusive la base de datos."*
2. *"La infraestructura debe quedar como código de forma que, si ya no me sirve GCP, pueda migrar a AWS, Azure u otra plataforma."*

Lo que cambia frente al plan v6 y la estrategia de la fase 3:
- La identidad **ya no se cambia por Identity Platform**: recomiendo un **auth propio dentro de la API sobre Postgres** (Better Auth), porque cualquier IdP administrado (Identity Platform, Cognito, Entra) amarra a una nube. Identity Platform queda como adaptador opcional (§3.1).
- El navegador **no le habla a ninguna base ni a PostgREST**: todo por la API NestJS, en el **mismo origen** de la web (§3.1.5).
- Cada pieza de nube detrás de un **puerto con adaptadores** (colas, archivos, secretos, scheduler, logs, realtime), y Terraform organizado por **capacidades con un contrato común** y tres implementaciones: GCP (destino inicial), AWS y Azure (§3.11).
- CI/CD principal en **GitHub Actions** con OIDC sin llaves; Cloud Build queda como alternativa (§3.12).

---

## 0. Resumen ejecutivo

### 0.1 Decisiones

| # | Tema | Decisión (recomendada) | Por qué | Alternativa |
|---|---|---|---|---|
| D1 | Identidad | **Better Auth en `apps/api`** con Kysely sobre la misma Postgres; tablas en el esquema `auth` (`auth.users` conserva el nombre y los UUID, así las 44 claves foráneas no se tocan) | Portable (es una librería TypeScript, no un servicio de una nube), verifica los hashes **bcrypt** de Supabase (nadie cambia su clave), sesiones en la base (listar y cerrar por dispositivo, como hoy), TOTP migrable si Supabase lo guarda en claro, correos propios en español | Identity Platform como adaptador (`AUTH_PROVIDER=gip`), diseñado en §3.1.9 |
| D2 | Sesión en la web | **Cookie httpOnly de Better Auth en el mismo origen** (`mirai.engynex.com/api/auth/*` y `/v1/*` enrutados a la API por el balanceador). El navegador nunca ve un token | Sin CORS ni tokens en JavaScript; SSR, `proxy.ts`, la API y el gateway leen la misma cookie; funciona igual en ALB (AWS) y Front Door (Azure) | Token *bearer* (plugin `bearer`/`jwt` de Better Auth) para clientes nativos y pruebas |
| D3 | RLS sin Supabase | **Esquema `auth` de compatibilidad** (`auth.uid()`, `auth.jwt()`, `auth.role()` idénticos a los de Supabase) + roles `anon`, `authenticated`, `service_role`, `authenticator` recreados. Las 124 políticas no se tocan | Menor riesgo: ni una política reescrita | Reescribir políticas con `current_setting('mirai.uid')` (descartado: 134 usos) |
| D4 | Acceso a datos en el servidor | **Puente PostgREST interno** (contenedor *open source*, solo tráfico interno) para los ~430 sitios que hoy usan el constructor de supabase-js en `packages/services`, `packages/ai` y los adaptadores `supabase-js.*` de la API; **Kysely** donde ya existe adaptador y para lo nuevo | Evita reescribir ~430 consultas antes del corte; PostgREST fija `role`, `request.jwt.claims` **y** `request.headers` igual que Supabase, así RLS y `sync_enlaces_on()` siguen idénticos | Todo Kysely antes del corte (+4–6 semanas) |
| D5 | Archivos | **Puerto `ObjectStore`** con adaptadores `gcs` (ADC, URL firmadas V4 sin llaves), `s3` (AWS S3 y cualquier compatible: MinIO en local, R2) y `azure-blob` (SAS). Las rutas lógicas (`attachments/{book_id}/…`) no cambian | Portable y sin llaves en GCP | GCS por su API S3 (HMAC): descartado como principal porque obliga a llaves de larga vida |
| D6 | Colas | **Puerto `QueuePort`** con `cloudtasks` (GCP, empuje HTTP con OIDC, ya existe) y **`pg`** (cola en Postgres con `FOR UPDATE SKIP LOCKED` / pg-boss, sirve en cualquier nube); `sqs` y `servicebus` opcionales | La cola en Postgres no depende de nadie y la carga de Mirai es baja | Solo Cloud Tasks (amarra a GCP) |
| D7 | Cron | Solo **endpoints HTTP protegidos** (`/v1/jobs/*`, OIDC o `Bearer CRON_SECRET`). Cada nube pone su reloj: Cloud Scheduler / EventBridge Scheduler / Container Apps Job | Ya está así en la API (`SchedulerGuard`) | — |
| D8 | Secretos | **Variables de entorno inyectadas por la plataforma** (Secret Manager → Cloud Run, Secrets Manager → ECS, Key Vault → Container Apps). Cero SDK de secretos en el código | Ya está así en la API | Adaptador opcional para leer en caliente |
| D9 | Tiempo real | Gateway **socket.io** de F2-G + Redis estándar + trigger `pg_notify` (`20261103004100_live_notify.sql`) | Ya escrito y probado con dobles | — |
| D10 | Datos | **`pg_dump`/`pg_restore` por secciones** en una ventana de 2 h (la base pesa ~90 MB), con 2 ensayos como mínimo. No Database Migration Service | Un volcado de 90 MB tarda minutos; DMS pide `pglogical` en Supabase y trae más riesgo que beneficio | DMS con CDC si la base creciera > 20 GB |
| D11 | Corte | **Dos pasos**: (A) web y API en Cloud Run con Supabase todavía detrás, cron en Scheduler, archivos en GCS y la web 100 % por la API; (B) **una ventana** que mueve juntos base, auth y tiempo real | La identidad vive en la misma base: moverlas por separado obligaría a sincronizar dos fuentes de usuarios | Tres o más pasos (más ventanas, más riesgo de divergencia) |
| D12 | Región final | **`us-east1`** (Carolina del Sur, ~55–70 ms desde Bogotá) desde el corte B. El paso A sigue en `us-west1` (junto a Supabase `us-west-2`) | Sin Supabase desaparece la razón de Oregón (estrategia §3) | Quedarse en `us-west1` (menos cambios el día del corte, +50 ms por petición) — **pregunta al dueño** |
| D13 | IA | Proveedor por defecto de la plataforma: **Vertex AI** (Gemini con la cuenta de servicio, sin llave) en lugar de **Vercel AI Gateway** (`packages/ai/src/model.ts:24-28`, `models.ts:9`). AI Gateway queda como integración opcional del hogar | "Nada en Vercel" incluye su facturación | Mantener AI Gateway como servicio externo (es una API con llave) — **pregunta al dueño** |
| D14 | Terraform | `infra/terraform/capabilities/<capacidad>/{gcp,aws,azure}` con el **mismo contrato** (variables y salidas); `stacks/<nube>` compone y `envs/<nube>/<ambiente>` aplica. GCP reusa los módulos actuales | Cambiar de nube = otra raíz, no otro diseño | — |
| D15 | CI/CD | **GitHub Actions** (build una vez, pruebas, escaneo, despliegue por nube con OIDC sin llaves). Cloud Build (`infra/cloudbuild/*`) queda como alternativa | Portable | Solo Cloud Build |
| D16 | Imagen web | **Una sola imagen de la web para todos los ambientes**: los `NEXT_PUBLIC_*` pasan a configuración en tiempo de ejecución (`window.__MIRAI__` desde el layout del servidor) | Promover por *digest* igual que la API, en cualquier nube | Compilar por ambiente (hoy, estrategia §15) |

### 0.2 Inventario en números (detalle en §1)

| Tipo de dependencia de Supabase | Cantidad |
|---|---|
| Paquetes npm `@supabase/*` declarados | 5 declaraciones en 4 `package.json` (`apps/web`: `ssr` + `supabase-js`; `apps/api`, `packages/ai`, `packages/services`: `supabase-js`) |
| Archivos que importan `@supabase/*` directo (sin pruebas) | 16 (13 web, 1 API, 1 `ai`, 1 `services`) + `apps/web/tests/e2e/qa.ts` |
| Archivos de la web que usan el cliente del navegador / del servidor / la clave secreta | **85** / **24** / **24** |
| Llamadas `supabase.auth.*` en la web / `auth.admin.*` | **52** / **11** |
| Tablas que la web lee o escribe directo con `.from("…")` | **88** tablas, **432** llamadas: 69 tablas desde código del navegador (198 llamadas) y 43 desde el servidor de Next (234); más el CRUD genérico de 32 tablas (`hooks/use-book-data.ts:109,155,159,211`) |
| RPC llamadas desde la web | **27** funciones en 34 llamadas |
| Storage: buckets / llamadas | **7** buckets; **17** llamadas en la web y **7** en la API |
| Realtime | 2 canales (`book:{id}` con *presence* y `auto:{id}`) |
| Consultas supabase-js en el servidor después de F2 | `packages/services` 113 `.from` + 6 `.rpc`; `packages/ai` 101 + 7; `apps/api` 161 + 45 |
| Base: `auth.uid()` / `auth.jwt()` / `auth.role()` | **134** (17 migraciones) / **2** / **5** |
| Base: claves foráneas a `auth.users` | **44** (42 en línea + 2 con `alter table`); 59 menciones de `auth.users` en total |
| Base: triggers sobre `auth.*` | **3** (`on_auth_user_created`, `on_auth_user_change`, `on_auth_identity_change`) |
| Base: funciones que leen o escriben `auth.users/identities/sessions` | **8** (`handle_new_user`, `on_auth_user_change`, `my_account`, `cancel_my_email_change`, `ensure_email_identity`, `remove_my_password`, `my_sessions`, `revoke_my_session`) |
| Base: extensiones | **3**: `pgcrypto` (en el esquema `extensions`), `pg_cron`, `pg_net` |
| Base: `pg_cron`/`pg_net` | 1 job (`mirai-notify`) y 1 `net.http_get`; 1 función que lee `cron.job` |
| Base: Storage | 6 `insert into storage.buckets` (7 buckets) y **17** políticas sobre `storage.objects` |
| Base: publicación `supabase_realtime` | 7 migraciones la crean o le agregan tablas |
| Base: otros | `request.headers` (1), `set_config('request.jwt.*')` (2), `extensions.digest` (2), 31 menciones de `service_role`, 63 de `anon` |
| Vercel | `vercel.json` (región `pdx1` y el cron diario), `@vercel/speed-insights`, `VERCEL_*` en 4 archivos, **Vercel AI Gateway** como proveedor de IA por defecto |

### 0.3 Qué ya está hecho y sirve

- La API NestJS tiene 31 módulos con contrato ts-rest, guardas de rol y plan, idempotencia, límites, colas (`QueuePort` con Cloud Tasks e *inline*), cron protegido (`SchedulerGuard`), gateway socket.io (`MODE=realtime`) y el puerto `TokenVerifier` (hoy `SupabaseJwtVerifier`).
- Hay adaptadores **Kysely** (`PgKyselyFactory`, con `set local role authenticated` + `request.jwt.claims` + `request.headers`, `apps/api/src/core/db/pg-kysely.factory.ts:27-32`) para: contexto de la app, `book-tables` (repo y `BookStore`), `catalogs`, `gami`, `insights` (+ `refs`), `ads` y la campana.
- La web ya tiene el cliente tipado, los interruptores por módulo (F2-H, **apagados**) y el gateway como fuente opcional (`hooks/use-live.ts`).
- Terraform de GCP (17 módulos, `stack/`, 3 raíces) valida y tiene 10 pruebas simuladas.

---

## 1. Inventario exacto de lo que queda de Supabase

### 1.1 Paquetes y clientes

| Qué | Dónde | Reemplazo |
|---|---|---|
| `@supabase/ssr` ^0.12.7, `@supabase/supabase-js` ^2.118.0 | `apps/web/package.json:38-39` | Cliente de la API (ts-rest) + `better-auth/react` (§3.1) |
| `@supabase/supabase-js` | `apps/api/package.json:54`, `packages/ai/package.json:24`, `packages/services/package.json:18` | `@supabase/postgrest-js` (ya instalado, 2.118.0) contra el PostgREST interno, y Kysely (§3.3) |
| Cliente del navegador (instancia única, encabezado `x-mirai-enlaces`) | `apps/web/utils/supabase/client.ts:14` | Se borra |
| Cliente del servidor con cookies | `apps/web/utils/supabase/server.ts:10-34` (`supabaseServer()`) | `lib/api/server.ts` reenvía la cookie a la API |
| Refresco de sesión y rutas protegidas | `apps/web/utils/supabase/middleware.ts:12-48` (`getClaims` en :28, lista `PUBLIC` en :9), `apps/web/proxy.ts:4-6` | `proxy.ts` revisa la cookie de sesión de Better Auth (§3.1.5) |
| Clave secreta (`supabaseAdmin()`) | `apps/web/lib/supabase/admin.ts:6` y 23 archivos que la usan: `app/ads.txt/route.ts`, `app/api/pagos/{mercadopago,wompi}/route.ts`, `features/{account,admin,contador,correo,data,household,notify,planes,referidos}/actions.ts`, `features/admin/{server,whatsapp}.ts`, `features/contador/api.ts`, `features/data/{backup,purge}.ts`, `lib/api/webhook-proxy.ts`, `lib/payments/{apply,reminders}.ts`, `lib/referidos.ts`, `lib/security/rate-limit.ts`, `lib/services.ts` | Todo pasa a la API (`SystemScope`) |
| Archivos web que importan `@supabase/*` | `app/auth/callback/route.ts`, `app/auth/confirm/route.ts`, `features/import/v4.ts`, `features/renta/data.ts`, `hooks/use-realtime.ts`, `lib/api/rollout.ts`, `lib/api/server.ts`, `lib/book-data.ts`, `lib/ref-data.ts`, `lib/supabase/admin.ts`, `utils/supabase/{client,middleware,server}.ts` | §2 y §3 |
| API: fábrica supabase-js | `apps/api/src/core/db/supabase-js.factory.ts` y 30 archivos que la inyectan (contexto, idempotencia, límites, 21 adaptadores) | `PostgrestFactory` (mismo uso) y Kysely (§3.3) |
| Paquetes: tipo `Db = SupabaseClient<Database>` | `packages/services/src/runtime.ts:6-11`, `packages/ai/src/server/ctx.ts:3-9` | `Db = PostgrestClient<Database>` (mismo `.from`/`.rpc`; `.auth` y `.storage` dejan de compilar, que es justo lo que hay que mover) |
| Pruebas E2E | `apps/web/tests/e2e/qa.ts:1,19-59` (crea el usuario QA con `auth.admin.createUser` y toca tablas con la clave secreta) | Endpoint de pruebas protegido (`/v1/test/qa`, solo con `MIRAI_ENV≠produccion`) o el script de semillas contra Postgres local |

### 1.2 Auth en la web (52 llamadas a `supabase.auth.*` y 11 a `auth.admin.*`)

| Flujo | Dónde (relativo a `apps/web/`) |
|---|---|
| Correo + contraseña (con Turnstile) | `components/auth/login-form.tsx:67` (`signInWithPassword`), :72 (`mfa.getAuthenticatorAssuranceLevel`) |
| Enlace mágico (sin crear cuenta) | `components/auth/login-form.tsx:58` (`signInWithOtp`, `shouldCreateUser: false`) |
| Google | `components/auth/google-button.tsx:22` (`signInWithOAuth`) |
| Registro (metadatos `nombre`, `acepta_version`, `ref`; Turnstile) | `components/auth/register-form.tsx:47` (RPC `registro_abierto`), :50 (`signUp`) |
| Vuelta de Google, enlace, confirmación y PKCE | `app/auth/callback/route.ts:29` (`exchangeCodeForSession`), :32 (AAL), :39 (`getClaims`), :58 (foto de Google en `profiles`) |
| Confirmación por `token_hash` | `app/auth/confirm/route.ts:19` (`verifyOtp`), :21 (`getUser`) |
| MFA TOTP: verificar al entrar | `app/(auth)/verificacion/page.tsx:22` (`listFactors`), :28 (`challengeAndVerify`), :50 (`signOut`) |
| MFA TOTP: activar y quitar | `features/settings/tabs/security.tsx:29` (`listFactors`), :34 y :47 (`unenroll`), :35 (`enroll`), :42 (`challengeAndVerify`) |
| Recuperar clave / actualizar clave | `app/(auth)/recuperar/page.tsx:24` (`resetPasswordForEmail`), `app/(auth)/actualizar-clave/page.tsx:24`, `features/account/password-form.tsx:18` (`updateUser({ password })`) |
| Cambio de correo | `features/account/actions.ts:102` (`auth.admin.generateLink email_change_new`), :108 y :128 (`updateUser({ email })`), :136 (RPC `cancel_my_email_change`) |
| Identidades vinculadas | `features/profile/profile-view.tsx:93` (`getUserIdentities`), `features/account/connected-accounts.tsx:94` (`linkIdentity`), :111 (`signOut`), `features/account/actions.ts:157,167,173,174,177` (`getClaims`, `getUserIdentities`, `refreshSession`, `unlinkIdentity`), :161 (`remove_my_password`), :172 (`ensure_email_identity`) |
| Sesiones | `features/account/actions.ts:41` (`my_account`), :55 (`my_sessions`), :191 (`revoke_my_session`), :203 (`signOut global`); `features/settings/tabs/security.tsx:79` (`signOut others`) |
| Cerrar sesión | `components/app/app-sidebar.tsx:324`, `features/settings/tabs/data.tsx:202`, `features/account/api.ts:59` |
| Aceptación de términos (Ley 1581) en `user_metadata` | `features/legal/legal-update.tsx:20` (`getUser`), :26 (`updateUser({ data })`) |
| Sesión en el servidor | `lib/dal.ts:99`, `app/page.tsx:31`, `app/(onboarding)/bienvenida/{page.tsx:35,actions.ts:22}`, `app/api/google/{callback:18,connect:14}/route.ts`, `features/household/actions.ts:407`, `features/household/accept-invitation.tsx:31` (`getClaims`) |
| Token para la API y el gateway | `lib/api/client.ts:23,26` (`refreshSession`, `getSession`), `lib/api/server.ts:20`, `hooks/use-live-gateway.ts:32,34` (`getSession`, `onAuthStateChange`) |
| Consola: cuentas | `features/admin/actions.ts:18`, `features/admin/server.ts:38` (`listUsers`), :63, :114, :149 (`getUserById`), :105 (`updateUserById` = suspender), :116 (`generateLink recovery`), :157 y `features/data/actions.ts:127` (`deleteUser`), `features/admin/server.ts:556` (`inviteUserByEmail`) |
| API: puerto `IdentityAdmin` (GoTrue) | `apps/api/src/modules/account/identity-admin.ts:21-37` (12 métodos) y `SupabaseIdentityAdmin` (:39 en adelante, `/auth/v1/user` con el token de la persona) |
| API: verificación de tokens | `apps/api/src/core/auth/supabase-jwt.verifier.ts` (JWKS `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, emisor y audiencia en `core/config/config.schema.ts:36-38,112-115`) |

### 1.3 Tablas que la web todavía lee o escribe directo

Generado con `grep -o '\.from("…")'` sobre `apps/web` (sin pruebas). "Navegador" = archivos `"use client"` o que importan `utils/supabase/client`, más módulos compartidos que corren en el navegador; "servidor" = Server Actions, Route Handlers, `server-only` y archivos con la clave secreta. Además de estas, el CRUD genérico (`useList`/`useSave`/`useSoftDelete`, `hooks/use-book-data.ts:109,155,159,211`), la carga del libro por partes (`lib/book-data.ts:11`), el buscador `components/app/command-palette.tsx:52`, el conteo de la puesta en marcha `features/setup/use-setup.ts:30`, la importación v4 `features/import/v4.ts:42,77,82` y las copias `features/data/{backup.ts:19,79,85, actions.ts:72}` usan nombres de tabla variables.

#### 1.3.1 Desde el navegador (69 tablas, 198 llamadas)

| Tabla | Llamadas | Dónde (archivo:líneas, relativo a `apps/web/`) |
|---|---|---|
| `profiles` | 12 | features/loans/reminder-dialog.tsx:73, features/loans/acuerdo.ts:15, features/settings/tabs/data.tsx:114, features/opiniones/rating-prompt.tsx:22, features/setup/use-setup.ts:35, features/renta/data.ts:51, features/profile/profile-view.tsx:92,108, features/agenda/use-dian.ts:22, features/agenda/fiscal-calendar.tsx:69,88, features/gami/use-gami.ts:28 |
| `family_members` | 4 | features/planning/family-view.tsx:38, features/renta/renta-owner.tsx:48, features/renta/data.ts:47, features/catalogs/hooks.ts:40 |
| `plans` | 6 | features/planes/premium.tsx:22, features/admin/console-negocio.tsx:56, features/admin/console-plataforma.tsx:66,66,114,118 |
| `books` | 1 | features/renta/data.ts:39 |
| `platform_settings` | 5 | features/ads/ad-slot.tsx:58, features/ayuda/extras.tsx:76, features/admin/admin-ads.tsx:257,258, components/app/platform-notice.tsx:14 |
| `ads` | 10 | features/ads/ad-slot.tsx:55, features/admin/admin-ads.tsx:53,147,149,159,159,307,308,309,310 |
| `book_settings` | 7 | features/settings/prefs.ts:42, features/setup/setup-view.tsx:30, features/setup/use-setup.ts:36, features/renta/renta-owner.tsx:32, features/catalogs/hooks.ts:27, features/gami/logros-view.tsx:67, features/gami/use-gami.ts:23 |
| `backups` | 1 | features/settings/tabs/data.tsx:58 |
| `expenses` | 9 | features/home/quick-entry.tsx:63,69, features/correo/correo-view.tsx:92, features/expenses/expenses-view.tsx:65, features/expenses/expense-form.tsx:221, features/subscriptions/subscriptions-view.tsx:67, features/import/import-view.tsx:165, features/extras/compartidos-view.tsx:112,119 |
| `feedback` | 5 | features/ayuda/extras.tsx:189, features/opiniones/feedback-dialog.tsx:32,81,85, features/opiniones/opiniones-view.tsx:99 |
| `accountant_shares` | 1 | features/contador/contador-view.tsx:72 |
| `notifications` | 3 | features/notify/bell.ts:13,30,39 |
| `loans` | 7 | features/loans/loan-edit-dialog.tsx:73, features/loans/loan-detail.tsx:84,85,142, features/loans/loan-form.tsx:307, features/setup/use-setup.ts:39,40 |
| `ad_campaigns` | 7 | features/ads/ad-slot.tsx:56, features/admin/admin-ads.tsx:52,90,90,283,284,286 |
| `notification_rules` | 4 | features/settings/tabs/account.tsx:79,89, features/settings/tabs/alerts.tsx:42,48 |
| `attachments` | 5 | features/renta/renta-owner.tsx:51,52,55,57, features/renta/data.ts:44 |
| `fixed_expenses` | 7 | features/goals/goal-dialogs.tsx:160,161,172,173, features/fixed/fixed-form.tsx:135,139, features/agenda/fiscal-calendar.tsx:218 |
| `plan_payments` | 1 | features/planes/plan-tab.tsx:40 |
| `coupons` | 5 | features/admin/console-negocio.tsx:337,337,375,380,384 |
| `tax_assets` | 6 | features/renta/renta-owner.tsx:35,35,38,39,45, features/renta/data.ts:49 |
| `calendar_events` | 5 | features/agenda/fiscal-calendar.tsx:79,79,120,157,216 |
| `audit_log` | 1 | features/settings/tabs/data.tsx:112 |
| `emergency_funds` | 4 | features/goals/goal-dialogs.tsx:162, features/goals/goals-view.tsx:131, features/expenses/expense-form.tsx:124, features/gami/use-gami.ts:27 |
| `extra_incomes` | 3 | features/home/quick-entry.tsx:48,51, features/import/import-view.tsx:172 |
| `chat_messages` | 4 | features/chat/api.ts:91, features/chat/hooks.ts:45,57,133 |
| `accountant_notes` | 1 | features/contador/contador-view.tsx:73 |
| `savings_challenges` | 4 | features/extras/retos-view.tsx:119,127,132, features/gami/use-gami.ts:26 |
| `loan_payments` | 3 | features/loans/pay-loan-dialog.tsx:88, features/loans/loan-detail.tsx:79, features/loans/loan-form.tsx:314 |
| `contacts` | 3 | features/loans/loan-form.tsx:295,298, features/profile/profile-view.tsx:98 |
| `user_preferences` | 2 | features/settings/prefs.ts:18,22 |
| `push_subscriptions` | 2 | features/notify/push-client.ts:39,50 |
| `chat_threads` | 3 | features/chat/api.ts:85,125, features/gami/use-gami.ts:24 |
| `card_purchases` | 3 | features/cards/card-forms.tsx:113, features/cards/cards-view.tsx:75,79 |
| `ref_renta_calendar` | 3 | features/renta/data.ts:56, features/agenda/use-dian.ts:25, features/agenda/fiscal-calendar.tsx:57 |
| `platform_integrations_public` | 2 | features/ads/ad-slot.tsx:39, features/settings/tabs/integrations.tsx:46 |
| `telegram_links` | 1 | features/settings/tabs/alerts.tsx:78 |
| `ref_uvt` | 2 | features/calculadoras/calculadoras-view.tsx:101, lib/ref-data.ts:13 |
| `credit_cards` | 2 | features/cards/cards-view.tsx:76,78 |
| `assets` | 2 | features/setup/use-setup.ts:38, features/balance/asset-form.tsx:83 |
| `categories` | 2 | features/setup/use-setup.ts:41, features/planning/budget-view.tsx:44 |
| `broadcasts` | 1 | features/admin/console-plataforma.tsx:383 |
| `tax_years` | 2 | features/renta/renta-owner.tsx:29, features/renta/data.ts:50 |
| `payment_methods` | 2 | features/balance/asset-form.tsx:87,89 |
| `ref_renta_regimenes` | 2 | features/agenda/use-dian.ts:26, features/agenda/fiscal-calendar.tsx:58 |
| `allowances` | 2 | features/extras/mesadas-view.tsx:48,55 |
| `gami_visits` | 2 | features/gami/gami-check.tsx:36, features/gami/use-gami.ts:19 |
| `gami_badges` | 2 | features/gami/gami-check.tsx:52, features/gami/use-gami.ts:20 |
| `gami_missions` | 2 | features/gami/gami-check.tsx:55, features/gami/use-gami.ts:21 |
| `gami_state` | 2 | features/gami/gami-check.tsx:56, features/gami/use-gami.ts:22 |
| `shared_groups` | 2 | features/extras/compartidos-view.tsx:62,175 |
| `ad_user_daily` | 1 | features/ads/ad-slot.tsx:57 |
| `ref_trm` | 1 | features/settings/tabs/finance.tsx:41 |
| `ref_usury_rate` | 1 | features/settings/tabs/finance.tsx:42 |
| `integrations_public` | 1 | features/settings/tabs/integrations.tsx:56 |
| `google_connections_public` | 1 | features/correo/correo-view.tsx:57 |
| `card_payments` | 1 | features/cards/card-forms.tsx:200 |
| `goal_movements` | 1 | features/goals/goals-view.tsx:121 |
| `ad_events` | 1 | features/admin/admin-ads.tsx:54 |
| `net_worth_snapshots` | 1 | features/patrimonio/patrimonio-card.tsx:31 |
| `income_categories` | 1 | features/renta/data.ts:48 |
| `liabilities` | 1 | features/renta/data.ts:53 |
| `goals` | 1 | features/profile/profile-view.tsx:98 |
| `automation_runs` | 1 | features/automations/hooks.ts:24 |
| `monthly_summaries` | 1 | features/reports/reports-view.tsx:45 |
| `allowance_movements` | 1 | features/extras/mesadas-view.tsx:65 |
| `shared_group_expenses` | 1 | features/extras/compartidos-view.tsx:115 |
| `advisor_consultations` | 1 | features/gami/use-gami.ts:25 |
| `investments` | 1 | features/investments/investments-view.tsx:122 |
| `ref_smmlv` | 1 | lib/ref-data.ts:13 |

#### 1.3.2 Desde el servidor de Next (43 tablas, 234 llamadas)

| Tabla | Llamadas | Dónde (archivo:líneas, relativo a `apps/web/`) |
|---|---|---|
| `profiles` | 22 | app/auth/callback/route.ts:58, app/(onboarding)/bienvenida/actions.ts:24, app/(onboarding)/bienvenida/page.tsx:40, features/contador/actions.ts:98, features/admin/actions.ts:64,99, features/referidos/actions.ts:18, features/admin/server.ts:64,184,299,314,332,546, features/household/actions.ts:59,189,408, features/data/actions.ts:80, features/account/actions.ts:64,228,259, components/app/actions.ts:19, lib/dal.ts:38 |
| `plan_subscriptions` | 30 | app/api/pagos/mercadopago/route.ts:36,37,38, features/planes/actions.ts:62,85,95,102, features/admin/actions.ts:67,122,150,159, features/admin/server.ts:74,183,211,224,234,239,241,244,247, features/account/actions.ts:225,282,284,332, lib/referidos.ts:57,60,61, lib/payments/reminders.ts:15,16,27 |
| `household_members` | 22 | app/(onboarding)/bienvenida/page.tsx:39, features/admin/actions.ts:32,65,152, features/admin/server.ts:65,77,151,153,181,213,281, features/household/actions.ts:54,185,397, features/data/actions.ts:83,115,117, features/account/actions.ts:57,224, lib/referidos.ts:29, lib/dal.ts:39, lib/payments/apply.ts:22 |
| `family_members` | 11 | features/household/actions.ts:55,198,349,355,356,366,369, features/data/backup.ts:75, features/import/v4.ts:60,64,72 |
| `plans` | 8 | features/landing/precios.tsx:18, features/admin/actions.ts:124, features/referidos/actions.ts:19, features/admin/server.ts:209, lib/referidos.ts:53, lib/dal.ts:52, lib/payments/apply.ts:16,54 |
| `books` | 11 | features/admin/actions.ts:33, features/admin/server.ts:76,182, features/household/actions.ts:308,404, features/import/actions.ts:19, features/data/purge.ts:36, features/account/actions.ts:316, features/data/backup.ts:13,73, lib/dal.ts:44 |
| `platform_settings` | 6 | features/referidos/actions.ts:15, features/admin/server.ts:340,371, features/import/actions.ts:36, lib/referidos.ts:43, lib/api/rollout.ts:64 |
| `household_invitations` | 11 | features/household/actions.ts:56,138,151,186,226,238,252,274,283,371,394 |
| `book_settings` | 3 | features/data/backup.ts:14,90, features/import/v4.ts:50 |
| `backups` | 9 | features/data/actions.ts:27,29,36,38,53,55,56, features/data/backup.ts:35,37 |
| `expenses` | 1 | features/data/actions.ts:94 |
| `feedback` | 5 | features/admin/actions.ts:35,96,102,113, features/admin/server.ts:67 |
| `accountant_shares` | 9 | features/contador/actions.ts:51,65,72,82,96,117,118, features/household/actions.ts:309, features/account/actions.ts:317 |
| `platform_admins` | 10 | features/admin/actions.ts:68, features/admin/server.ts:69,136,138,139,186,279,312,323, lib/dal.ts:40 |
| `notifications` | 6 | features/notify/actions.ts:84, features/admin/actions.ts:153, features/admin/server.ts:214,293, lib/referidos.ts:62, lib/payments/apply.ts:30 |
| `platform_integrations` | 8 | app/ads.txt/route.ts:6, features/admin/whatsapp.ts:66,72, features/admin/server.ts:348,390,439,456,457 |
| `households` | 8 | features/admin/actions.ts:125, features/admin/server.ts:154,180,225, features/household/actions.ts:380, features/data/actions.ts:124, features/account/actions.ts:65,335 |
| `referrals` | 8 | features/referidos/actions.ts:14, features/admin/server.ts:343,344, lib/referidos.ts:44,47,49,51,64 |
| `notification_rules` | 3 | features/correo/actions.ts:34, features/admin/server.ts:505, features/data/actions.ts:84 |
| `attachments` | 2 | features/contador/actions.ts:144,146 |
| `plan_payments` | 5 | app/api/pagos/wompi/route.ts:21, features/planes/actions.ts:69, features/admin/actions.ts:123, features/admin/server.ts:75,266 |
| `coupons` | 1 | features/planes/actions.ts:25 |
| `calendar_events` | 1 | features/import/v4.ts:174 |
| `audit_log` | 4 | features/admin/actions.ts:34,66, features/admin/server.ts:66,185 |
| `emergency_funds` | 1 | features/import/v4.ts:190 |
| `extra_incomes` | 1 | features/data/actions.ts:96 |
| `accountant_notes` | 3 | features/contador/actions.ts:84,127,137 |
| `user_preferences` | 1 | features/data/actions.ts:81 |
| `push_subscriptions` | 1 | features/data/actions.ts:85 |
| `admin_audit` | 3 | features/admin/whatsapp.ts:18, features/admin/server.ts:31,330 |
| `admin_notes` | 3 | features/admin/server.ts:68,165,171 |
| `automations` | 3 | features/automations/actions.ts:23,28,29 |
| `referral_codes` | 3 | lib/referidos.ts:18,22,42 |
| `telegram_links` | 1 | features/data/actions.ts:86 |
| `broadcasts` | 1 | features/admin/server.ts:302 |
| `account_events` | 2 | features/account/actions.ts:36,56 |
| `google_connections` | 1 | features/correo/actions.ts:22 |
| `google_event_map` | 1 | features/correo/actions.ts:46 |
| `integrations` | 1 | features/admin/server.ts:391 |
| `notification_log` | 1 | features/admin/server.ts:544 |
| `consents` | 1 | features/data/actions.ts:82 |
| `incomes` | 1 | features/data/actions.ts:95 |
| `household_transfers` | 1 | features/account/actions.ts:58 |

### 1.4 RPC que llama la web (27 funciones)

| RPC | Dónde (`apps/web/`) | Endpoint de la API |
|---|---|---|
| `mirai_app_context`, `household_plan` | `lib/dal.ts:30,51`; `features/admin/server.ts:79,287` | `GET /v1/me` (existe) · consola (existe) |
| `create_household` | `app/(onboarding)/bienvenida/actions.ts:25` | `POST /v1/households` (existe) |
| `create_book` | `components/app/actions.ts:31`, `features/import/actions.ts:17` | **falta** `POST /v1/books` |
| `registro_abierto` | `components/auth/register-form.tsx:47` | **falta**: dentro de `POST /api/auth/sign-up` (§3.1) |
| `my_account`, `my_sessions`, `revoke_my_session`, `cancel_my_email_change`, `remove_my_password`, `ensure_email_identity` | `features/account/actions.ts:41,55,191,136,161,172` | `/v1/account/*` (existe) → se reescribe contra Better Auth (§3.1.6) |
| `request/respond/cancel_household_transfer`, `remove_household_member` | `features/account/actions.ts:256,273,298,313` | `/v1/households/*/transfer…`, `/people/:id` (existen) |
| `invitation_info`, `accept_invitation` | `features/household/actions.ts:389,401`, `features/household/query.ts:13` | `GET/POST /v1/invitations/:token[/accept]` (existen) |
| `admin_migrations`, `count_orphan_households`, `delete_orphan_households` | `features/admin/server.ts:341,342,378` | `/v1/admin/system*` (existen) |
| `ad_reach` | `features/admin/admin-ads.tsx:55` | **falta** (`/v1/admin/ads/*`) |
| `ad_track` | `features/ads/ad-slot.tsx:88` | **falta** `POST /v1/ads/events` |
| `household_subscription` | `features/planes/plan-tab.tsx:34` | **falta** `GET /v1/households/:h/subscription` |
| `apply_plan_payment` | `lib/payments/apply.ts:46` | webhooks de la API (existen) |
| `rate_limit_hit` | `lib/security/rate-limit.ts:19` | núcleo de la API (existe) |
| Las 16 del libro (`pay_fixed_expense`, `add_card_purchase`, `pay_credit_card`, `goal_contribute`, `fund_*`, `asset_cuadrar`, `use_emergency_fund`, `link/unlink_expense_fixed`, `unpay_fixed_expense`, `pay_subscription`) | `features/{fixed,cards,goals,expenses,balance,subscriptions,correo,import}/…` (doc v6 §1.6) | Comandos F2-D (existen; detrás de los interruptores `expenses`, `fixed`, `cards`, `savings`, `assets`). Ojo: algunos casos siguen por la RPC (F2-H §2: pagos `prev-…`, compras con `p_medio`, > 48 cuotas) → **falta** cubrirlos en el comando |

### 1.5 Storage

| Bucket (público) | Ruta | Desde la web | Desde la API | Política hoy |
|---|---|---|---|---|
| `attachments` (no) | `{book_id}/renta/{año}/{uuid}-{nombre}` | `features/renta/renta-owner.tsx:51` (subir), :57 (URL firmada 300 s); `features/contador/actions.ts:146` | `modules/tax/adapters/supabase-js.accountant.repo.ts:92`, `modules/ai/adapters/supabase-js.ai-files.ts:24` | `20261031000200_security.sql:401-411`, `20261103001400_seguridad.sql:100-102` (miembro del libro: ver = viewer, escribir = editor) |
| `logos` (no) | `{book_id}/…` | — (solo se borra en `features/data/purge.ts:38`) | `modules/households/ports.ts:70,84` | igual a `attachments` |
| `backups` (no) | `{book_id}/{fecha}-{tipo}.json` | `features/data/backup.ts:35`, `features/data/actions.ts:29,38,55` | `modules/import/backup-storage.ts:25` | `20261103001400_seguridad.sql:103-105` (admin del libro) |
| `feedback` (no) | `{user_id}/{uuid}.{ext}` | `features/opiniones/feedback-dialog.tsx:80-81`; `features/admin/actions.ts:102` (URL firmadas 3600 s) | `modules/admin/adapters/supabase-js.admin.repo.ts:170` | `20261101000300_opiniones.sql:101-108` (dueño o admin de la plataforma) |
| `avatars` (**sí**) | `{user_id o family_member}/{uuid}.webp` | `components/mirai/avatar-picker.tsx:100-103` (subir + `getPublicUrl`) | — | `20261101000100_perfil.sql:44-55` |
| `ads` (**sí**) | `{uuid}.{ext}` | `features/admin/admin-ads.tsx:146-149` | — | `20261101000600_anuncios.sql:55-61` (admin de la plataforma) |
| `public-assets` (**sí**) | `whatsapp/{uuid}.{png,jpg}` | `features/admin/console-whatsapp.tsx:43-46` | — | `20261103000500_whatsapp_plantillas.sql:6-15` |

Borrado por Ley 1581 (supresión): `features/data/purge.ts:14,29` y `apps/api/src/modules/households/ports.ts:70,84` listan y borran por prefijo.
**URL públicas guardadas en la base** (hay que reescribirlas): `profiles.avatar_url`, `family_members.avatar`, las imágenes de `ads`/`ad_campaigns` y la imagen de WhatsApp en `platform_integrations.config`. El script de §3.7 busca `supabase.co/storage` en **todas** las columnas `text`/`jsonb` de `public` para no dejar ninguna.

### 1.6 Realtime

- `apps/web/hooks/use-realtime.ts:40` canal `book:{id}` con *presence* (`:66-67`), `postgres_changes` por `book_id` (`:50`, tablas de `LIVE_TABLES`), por `household_id` (`:57`) y `notifications` por `user_id` (`:63`).
- `apps/web/features/automations/runner.tsx:35-36` canal `auto:{bookId}` sobre `automation_events` (dispara el runner del navegador).
- Base: publicación `supabase_realtime` en `20261031000200_security.sql:376-387`, `20261101000900_funciones.sql:50-51`, `20261103000300_automatizaciones.sql:98-99`, `20261103000700_proveedores.sql:74-75`, `20261103003100_cuentas_metas.sql:61-62`, `20261103003200_enlaces.sql:67-68`.
- Reemplazo listo: `hooks/use-live.ts` + `hooks/use-live-gateway.ts` (gateway) y `20261103004100_live_notify.sql` (`mirai_live_notify()` y `mirai_live_notify_install()`, escrita y sin aplicar).

### 1.7 Base de datos (56 migraciones en `supabase/migrations/`)

| Dependencia | Dónde | Qué pasa en Cloud SQL |
|---|---|---|
| `create extension pgcrypto` | `20261031000100_core.sql:6` | Se crea en el esquema `extensions` (Supabase la tiene ahí: `extensions.digest` en `20261103000900_hogar_roles.sql:226,246`; `digest` sin esquema en `20261031000200_security.sql:359`). `gen_random_uuid()` (65 usos) es nativa de PG ≥ 13 |
| `create extension pg_cron`, `pg_net` | `20261031001000_notify.sql:11-12` | **No se crean**. pg_net no existe en Cloud SQL ni en RDS |
| Job `mirai-notify` (`cron.schedule` + `net.http_get`) | `20261031001000_notify.sql:14-21` (`mirai_schedule_notify`) | Se borra en Supabase antes del corte (`cron.unschedule`); en Cloud SQL la función queda como no-op que avisa |
| `mirai_notify_cron_active()` lee `cron.job` | `20261103003200_avisos.sql:68-74` | Se redefine leyendo el latido `platform_settings.cron_horario_visto` (< 2 h) |
| `auth.uid()` | 134 usos en 17 migraciones (políticas, `default auth.uid()`, funciones) | Función de compatibilidad idéntica (§3.2) |
| `auth.jwt()` | `20261103001600_cuenta_titularidad.sql:162,175` (`session_id`) | Compatibilidad; la API pone `session_id` en los claims |
| `auth.role()` | `20261103000200_ia_uso.sql:70,83,84`, `20261103001400_seguridad.sql:60,117` (compara con `service_role`, `authenticated`, `anon`) | Compatibilidad: lee `role` de los claims. **Ojo:** `SystemScope` con Kysely hoy no pone claims (`pg-kysely.factory.ts:28`): hay que poner `{"role":"service_role"}` o esas 5 comprobaciones fallan |
| 44 claves foráneas a `auth.users(id)` | `20261031000100_core.sql` (18: :23,43,54,61,74,88,124,139,173,626,658,680,700,707,722,735,749,757), `20261101000400_planes.sql:45`, `20261101001000_ads_manager.sql:44`, `20261103000100_notificaciones.sql:10`, `20261103000300_automatizaciones.sql:18`, `20261101000900_funciones.sql:14,62,72,73`, `20261101000300_opiniones.sql:7,23,34`, `20261101000700_consola_admin.sql:75,113,123,136,138`, `20261103003200_avisos.sql:49`, `20261103000900_hogar_roles.sql:107,108`, `20261103000200_ia_uso.sql:12`, `20261103001600_cuenta_titularidad.sql:16,198,199,205` | **Se conservan**: Better Auth usa la tabla `auth.users` (§3.1.3) |
| Trigger `on_auth_user_created` → `handle_new_user()` (perfil, preferencias, consentimientos, invitaciones pendientes) | `20261031000200_security.sql:255-281`, redefinida en `20261101000100_perfil.sql:10-32` (lee `raw_user_meta_data`) | Se conserva tal cual: `auth.users` mantiene `raw_user_meta_data` |
| Trigger `on_auth_user_change` (correo, clave, último ingreso → `account_events`) | `20261103001600_cuenta_titularidad.sql:40-62` (vigila `encrypted_password`) | Se redefine: la clave vive en `auth.accounts` (§3.1.6) |
| Trigger `on_auth_identity_change` | `20261103001600_cuenta_titularidad.sql:64-78` | Pasa a `auth.accounts` (proveedores ≠ `credential`) |
| Funciones sobre `auth.identities`/`auth.sessions`/internos de GoTrue | `20261103001600_cuenta_titularidad.sql:86-190` (`my_account`, `cancel_my_email_change` toca `email_change*`, `ensure_email_identity` inserta en `auth.identities` y cambia `raw_app_meta_data`, `remove_my_password` pone `encrypted_password = null`, `my_sessions`, `revoke_my_session` borra de `auth.sessions`); `20261101000100_perfil.sql:35-41` (foto de Google desde `identity_data`); `20261103001400_seguridad.sql:113-118` (correo del perfil desde `auth.users`) | Migración `cuenta_titularidad v2` contra las tablas de Better Auth (§3.1.6) |
| `set_config('request.jwt.claim.sub' / 'request.jwt.claims')` | `20261103003400_planes_automat.sql:175-176` (automatizaciones que actúan como la persona) | Funciona igual con la compatibilidad |
| `current_setting('request.headers')` | `20261103003200_enlaces.sql:14` (`sync_enlaces_on`) | PostgREST lo pone solo; Kysely ya lo pone (`pg-kysely.factory.ts:24,31`) |
| Políticas RLS | 124 `create policy` en 21 migraciones; **17 sobre `storage.objects`** | Las de `public` se conservan; las de `storage.objects` no se llevan (la autorización pasa a la API, §3.4) |
| `force row level security` | 0 usos | Los dueños de las tablas saltan la RLS: lo usa `SystemScope` si `service_role` no puede tener `BYPASSRLS` (§3.2) |
| Funciones `security definer` | 93 (en 29 migraciones), todas con `set search_path` | Se conservan; dueño = `service_role` o `mirai_owner` (§3.2) |
| Identidades (`generated always as identity`) | `audit_log` (`core.sql:773`), `admin_audit` (`consola_admin.sql:122`), `notification_log` (`notificaciones.sql:8`), `account_events` (`cuenta_titularidad.sql:15`) | `pg_dump` lleva el `setval`; se verifica después |
| Esquemas de Supabase | `auth`, `storage`, `realtime`, `extensions`, `cron`, `net`, `graphql`, `vault`, `supabase_functions` | Solo se recrean `auth` (compatibilidad + Better Auth) y `extensions`. Los demás no se llevan |
| Migraciones escritas sin aplicar | `20261103003800_api_idempotency.sql`, `20261103003801_api_rollout.sql`, `20261103004100_live_notify.sql` | Van en la línea base de Cloud SQL (y `mirai_live_notify_install(true)` después de restaurar) |

### 1.8 Vercel y otras dependencias de plataforma

| Qué | Dónde | Reemplazo |
|---|---|---|
| Región y cron diario | `apps/web/vercel.json` (`pdx1`; `/api/cron/notify?daily=1` a las 11:00 UTC) | Scheduler → `/v1/jobs/notify/tick` (estrategia §7, etapa 2) |
| Ruta del cron en Next | `apps/web/app/api/cron/notify/route.ts` | Se borra (la API tiene `jobs`) |
| Speed Insights | `apps/web/app/layout.tsx:4,64` | Se quita; Web Vitals por Sentry o OTLP |
| `VERCEL_*` | `lib/site-url.ts:6,17` (dominio de producción), `app/api/pagos/mercadopago/route.ts:25` (`VERCEL_ENV`), `next.config.ts:13` (`VERCEL_GIT_COMMIT_SHA` → `NEXT_PUBLIC_BUILD_ID`), `features/ads/ad-slot.tsx:44` (fuente "vercel" de AdSense), consola (`features/admin/console-plataforma.tsx`, `admin/server.ts`, `apps/api/src/modules/admin/admin.service.ts`) | `SITE_URL`, `MIRAI_ENV`, `GIT_SHA` neutros |
| Vercel AI Gateway | `packages/ai/src/model.ts:2,24-28` (`createGateway`, `AI_GATEWAY_API_KEY`), `packages/ai/src/models.ts:9,22,40`, registro `packages/services/src/integrations/registry.ts:40` | D13: Vertex AI por defecto |
| Integración "Vercel Analytics" en el registro | `packages/services/src/integrations/registry.ts:73` | Se retira del registro |
| Upstash Redis (límites en la web) | `UPSTASH_*` | Desaparece con la web sin backend (la API usa `rate_limit_hit` o Redis) |
| CSP con el origen de Supabase | `apps/web/lib/security/headers.ts:13,28`, `next.config.ts:18` | `connect-src 'self'` + `files.` + Sentry (todo el resto va por el mismo origen) |
| Placeholders de Supabase en CI y la imagen | `infra/cloudbuild/ci.yaml:27-30`, `infra/cloudbuild/deploy-web.yaml:40-42`, `infra/docker/web.Dockerfile:52` | Se quitan |
| Terraform: secretos y variables de Supabase | `infra/terraform/stack/secrets.tf:10-11` (`supabase-secret-key` **obligatorio**), :58-67 (`supabase-jwt-secret`, `supabase-db-url`), `stack/services.tf:27-28` | Opcionales hasta el corte B; se borran al apagar Supabase |

---

## 2. Endpoints que faltan en la API

### 2.1 De F2-H (§7 de `v6-f2h-encendido.md`), confirmados en el código

| # | Qué | Hoy en la web | Endpoint nuevo | Módulo (dueño) |
|---|---|---|---|---|
| E1 | Crear libro | `components/app/actions.ts:31`, `features/import/actions.ts:17` (RPC `create_book`) | `POST /v1/books` | `books` (stub `apps/api/src/modules/books/books.module.ts`) |
| E2 | Cambiar de libro activo | cookie `mirai-book` en Next | Se queda en la web (preferencia de UI) + `PUT /v1/me/active-book` para recordarlo entre dispositivos (opcional) | `me` |
| E3 | Copias: URL, restaurar, borrar | `features/data/actions.ts:27-56` | `GET /v1/books/:b/backups`, `GET …/backups/:id/url`, `POST …/backups/:id/restore`, `DELETE …/backups/:id` | `import` |
| E4 | Restaurar JSON, importar v4, libro de ejemplo, `formatBlocks` | `features/data/actions.ts:72`, `features/import/v4.ts`, `features/import/actions.ts` | `POST /v1/books/:b/import/{json,v4,sample}`, `POST …/data/format` | `import` |
| E5 | Exportar mis datos, borrar cuenta | `features/data/actions.ts:80-127` | `GET /v1/account/export` (usa `BookDumpService`), `DELETE /v1/account` (existe en el contrato `account`: falta conectarlo a Better Auth) | `account` |
| E6 | Logros (`logroNotifs`, lectura/escritura de `gami_*`) | `features/gami/{use-gami.ts:19-28, gami-check.tsx:36-56}` | `GET /v1/books/:b/gami` (existe, lectura) + `POST …/gami/visit`, `POST …/gami/check` (evalúa en el servidor y escribe `gami_badges`/`gami_missions`/`gami_state`) | `gami` |
| E7 | Reglas de aviso desde Ajustes | `features/settings/tabs/{alerts.tsx:42,48, account.tsx:79,89}` (`notification_rules`) | `GET/PUT …/notification-rules/me` (existen): falta usarlos en la web | `notifications` |
| E8 | Contador del lado del titular | `features/contador/contador-view.tsx:72-73` | `GET/POST/DELETE /v1/books/:b/accountant/shares`, `GET …/accountant/notes` | `tax` |
| E9 | Integraciones globales y envío de prueba de la consola, WhatsApp | `features/admin/{server.ts:348-457, whatsapp.ts:18-72}` | `GET/PUT /v1/admin/integrations/:kind`, `POST …/:kind/test`, `GET/PUT /v1/admin/whatsapp/templates` | `admin` |
| E10 | Automatizaciones (CRUD, probar, plantillas, runner) | `features/automations/{actions.ts:23-29, hooks.ts:24, runner.tsx}` | `GET/PUT/DELETE /v1/books/:b/automations[/:id]`, `POST …/:id/test`, `POST …/automations/defaults`, `GET …/automation-runs`; runner solo en el servidor (outbox ya existe) | `automations` (stub) |
| E11 | Suscripción del hogar | `features/planes/plan-tab.tsx:34,40` | `GET /v1/households/:h/subscription` (+ pagos del hogar) | `billing` |
| E12 | Anuncios: eventos, alcance, administración | `features/ads/ad-slot.tsx:39-88`, `features/admin/admin-ads.tsx:52-310` | `POST /v1/ads/events` (`ad_track`), `GET /v1/admin/ads/{campaigns,ads,reach}`, `PUT/DELETE …` | `ads` |
| E13 | Opiniones | `features/opiniones/{feedback-dialog.tsx:32-85, opiniones-view.tsx:99, rating-prompt.tsx:22}`, `features/ayuda/extras.tsx:189` | `POST /v1/feedback`, `GET /v1/me/feedback`, `POST /v1/feedback/rating` | `feedback` (stub) |
| E14 | Archivos firmados | §1.5 | `POST /v1/files/uploads`, `POST /v1/files/uploads/:id/complete`, `GET /v1/files/url`, `DELETE /v1/files` (§3.4) | `files` (stub) |
| E15 | Calificar mensaje del chat, buscar en conversaciones, conteo de hilos | `features/chat/{api.ts:85-125, hooks.ts:45-133}` | `POST …/chat/messages/:m/rating`, `GET …/chat/search?q=`, `GET …/chat/threads/count` | `chat` |

### 2.2 Encontrados en este inventario (no estaban en la lista de F2-H)

| # | Qué | Dónde | Endpoint |
|---|---|---|---|
| E16 | **Todo Auth** (registro, entrar, enlace, Google, TOTP, recuperar, cambiar clave y correo, métodos, sesiones) | §1.2 | Montado por Better Auth en `/api/auth/*` + `/v1/account/*` (§3.1) |
| E17 | Aceptación de términos (hoy en `user_metadata`) | `features/legal/legal-update.tsx:20,26` | `GET/POST /v1/me/consents` (tabla `consents` ya existe) |
| E18 | Ajustes del libro y preferencias | `features/settings/prefs.ts:18,22,42`, `features/setup/{setup-view.tsx:30, use-setup.ts:35-41}`, `features/catalogs/hooks.ts:27,40`, `features/gami/logros-view.tsx:67` | `GET/PATCH /v1/books/:b/settings`, `GET/PATCH /v1/me/preferences` |
| E19 | Perfil propio | `features/profile/profile-view.tsx:92,108` y lecturas de `profiles` en 10 archivos (§1.3.1) | `GET/PATCH /v1/me/profile` (o en `/v1/me`) |
| E20 | Escrituras del libro fuera del CRUD genérico | `expenses` (`features/home/quick-entry.tsx:63,69`, `features/extras/compartidos-view.tsx:112,119`…), `loans` (`features/loans/*`), `fixed_expenses` (`features/goals/goal-dialogs.tsx:160-173`, `features/fixed/fixed-form.tsx:135,139`), `tax_assets` (`features/renta/renta-owner.tsx:35-45`), `calendar_events` (`features/agenda/fiscal-calendar.tsx:79-216`), `savings_challenges` (`features/extras/retos-view.tsx:119-132`), `emergency_funds`, `loan_payments`, `allowances`… | La mayoría cabe en `PUT/DELETE /v1/books/:b/t/:tabla/:id` (existe, `BOOK_TABLE_POLICY`); revisar cada `update … where` con filtros que no sean por `id` (p. ej. `goal-dialogs.tsx:160-161`) y crear un comando cuando haga falta |
| E21 | Lecturas sueltas del libro | `card_purchases`/`credit_cards` (`features/cards/cards-view.tsx:75-79`), `investments`, `net_worth_snapshots` (`features/patrimonio/patrimonio-card.tsx:31`), `monthly_summaries` (`features/reports/reports-view.tsx:45`), `goal_movements`, `advisor_consultations`, `audit_log` (`features/settings/tabs/data.tsx:112`), `backups` (`:58`) | `GET /v1/books/:b/t/:tabla` (existe) o `snapshot?parts=` (existe); `audit_log` y `backups` con endpoint propio |
| E22 | Buscador ⌘K | `components/app/command-palette.tsx:52` | `GET /v1/books/:b/search?q=` |
| E23 | Planes públicos (portada) y consola de planes/cupones | `features/landing/precios.tsx:18`, `features/planes/premium.tsx:22`, `features/admin/console-{negocio,plataforma}.tsx` | `GET /v1/plans` (público), `PUT /v1/admin/plans/:id`, `GET/PUT/DELETE /v1/admin/coupons` |
| E24 | Avisos de la plataforma, anuncios globales, comunicados | `components/app/platform-notice.tsx:14`, `features/ayuda/extras.tsx:76`, `features/admin/console-plataforma.tsx:383` | `GET /v1/platform/notice` (público), `/v1/admin/broadcasts` (existe) |
| E25 | Integraciones visibles del hogar | `features/settings/tabs/integrations.tsx:46,56`, `features/correo/correo-view.tsx:57` | `GET …/integrations` (existe) + `GET /v1/platform/integrations` (lo público de `platform_integrations_public`) |
| E26 | Telegram (estado) y push (alta y baja) | `features/settings/tabs/alerts.tsx:78`, `features/notify/push-client.ts:39,50` | Existen (`/telegram/*`, `/v1/push/subscriptions`): falta encender `notify` |
| E27 | Datos de referencia y renta | `lib/ref-data.ts:13`, `features/calculadoras/calculadoras-view.tsx:101`, `features/settings/tabs/finance.tsx:41-42`, `features/agenda/{use-dian.ts:22-26, fiscal-calendar.tsx:57-58}`, `features/renta/data.ts:39-56` | `/v1/refs/*` (existen) + `GET /v1/books/:b/tax/:año` (**falta**, F2-D lo dejó pendiente) |
| E28 | `ads.txt` | `apps/web/app/ads.txt/route.ts:6` (clave secreta) | `GET /v1/public/adsense` (público) y la web solo lo sirve |
| E29 | Foto de Google al entrar | `app/auth/callback/route.ts:51-58` | Hook `databaseHooks.user.create.after` de Better Auth (§3.1) |
| E30 | Mantenimiento | — | `platform_settings.mantenimiento` → la API responde 503 en escrituras (doc v6 §5.3) |
| E31 | Usuario QA de las E2E | `apps/web/tests/e2e/qa.ts` | `POST /v1/test/qa/{reset,plan,welcome}` solo con `MIRAI_ENV` de pruebas o local y un secreto |

### 2.3 Rutas de Next que desaparecen

`app/api/cron/notify`, `app/api/google/{connect,callback}` (la API ya tiene `/v1/google/*`), `app/api/pagos/{mercadopago,wompi}` (webhooks directos a la API), `app/api/chat` (la API tiene el NDJSON), `app/auth/{callback,confirm}` (Better Auth), `app/ads.txt` (pasa a leer el endpoint público). Se quedan: `app/api/public/version`, `app/abrir`, `app/compartir` y `app/manifest.ts` (PWA).

---

## 3. Diseño de cada reemplazo

### 3.0 Principio: la app no conoce la nube

```
              ┌──────────────────────────── contenedores Docker (iguales en cualquier nube) ───────────────────────────┐
navegador ──► │ web (Next standalone)     api (NestJS, MODE=api)      realtime (MODE=realtime)    postgrest (interno)   │
  mismo       │        │                        │  puertos ─────────────────────────────┐                             │
  origen      └────────┼────────────────────────┼───────────────────────────────────────┼─────────────────────────────┘
                       │                        ▼                                       ▼
                       │        TokenVerifier/Auth · ObjectStore · QueuePort · Mailer · ErrorReporter · Telemetry(OTLP)
                       │        adaptadores:  better-auth | gip     gcs | s3 | azure-blob     cloudtasks | pg | sqs | servicebus
                       ▼
          Postgres estándar (Cloud SQL / RDS / Azure Flexible Server) · Redis estándar (Memorystore / ElastiCache / Azure Cache)
```

Reglas (se vuelven reglas de ESLint en `packages/config`):
1. Ningún `import` de `@google-cloud/*`, `@aws-sdk/*` o `@azure/*` fuera de `apps/api/src/adapters/<nube>/**`.
2. Los secretos llegan como variables de entorno; la app nunca llama a Secret Manager/Secrets Manager/Key Vault (adaptador opcional `SECRETS_SOURCE=env|gcp|aws|azure`, apagado por defecto).
3. Logs JSON a stdout (pino). El campo `severity` que espera Cloud Logging no estorba en CloudWatch ni en Azure Monitor. Trazas por **OTLP** (`OTEL_EXPORTER_OTLP_ENDPOINT`) a un colector *sidecar* que cada nube configura (Cloud Trace, X-Ray, Application Insights).
4. Cron = HTTP protegido. Colas = puerto. Archivos = puerto. Tiempo real = socket.io + Redis.
5. Un solo `.env.example` de la API documenta **todas** las variables; la nube solo cambia cómo se llenan.

### 3.1 Identidad: auth propio con Better Auth (D1, D2)

#### 3.1.1 Comparación

| Criterio | **Better Auth en la API** ✔ | Identity Platform (GCP) | Cognito (AWS) | Entra External ID (Azure) |
|---|---|---|---|---|
| Portabilidad | Librería TS sobre Postgres: va donde va la API | Amarra a GCP | Amarra a AWS | Amarra a Azure |
| Importar hashes bcrypt de Supabase | **Sí**: `password.verify` propio con `bcryptjs` | Sí (`importUsers` BCRYPT) | **No** (obliga a "migración perezosa" con Lambda o a restablecer) | No directo |
| Conservar los UUID | **Sí** (`generateId` + mismas filas) | Sí como `uid` para importados; los nuevos tienen ids de 28 caracteres → tabla de mapeo | `sub` propio → mapeo | `oid` propio → mapeo |
| Enlace mágico sin crear cuenta | Plugin `magicLink` (`disableSignUp`) | Sí | Con flujos personalizados | Parcial |
| Google | `socialProviders.google` + vinculación por correo | Sí | Sí | Sí |
| TOTP | Plugin `twoFactor`; **los factores se pueden migrar** si Supabase guarda el secreto en claro | Sí, pero **no importa factores TOTP** (re-enrolar) | Sí, no importa | Parcial |
| Sesiones por dispositivo (listar y cerrar una) | **Sí** (tabla `sessions`, `listSessions`, `revokeSession`) | No nativo (solo `revokeRefreshTokens` de todas) | Parcial | Parcial |
| Correos en español con dominio propio | Los manda Mirai (Resend) con plantillas del repo | Plantillas limitadas en consola; el de enlace mágico casi no se edita | Limitado | Limitado |
| Turnstile y límites antes de crear la cuenta | En el mismo endpoint (`hooks.before`) | Solo reCAPTCHA Enterprise | WAF | — |
| Costo | 0 (corre en la API) | Gratis < 50 000 MAU | Por MAU | Por MAU |
| En contra | Mirai es responsable de la seguridad del auth (parches, límites, auditoría); hay que mantener la versión al día | Dos fuentes de usuarios (Firebase + `auth.users`) | Idem | Idem |

**Recomendación: Better Auth.** Es el único que cumple a la vez "nadie cambia su clave", "mismos UUID", "sesiones por dispositivo" y "puedo cambiar de nube". El riesgo de "auth propio" se acota: no se escribe criptografía (la pone la librería), se fija la versión, se prueba con una batería propia (§4, V7-A) y la API ya tiene límites, idempotencia, auditoría y Cloud Armor/WAF delante.

#### 3.1.2 Dónde corre y cómo se monta

- `apps/api/src/modules/auth/`: `auth.config.ts` (`betterAuth({...})`), `auth.controller.ts` (monta el *handler* de Better Auth en Fastify bajo `/api/auth/*`), `better-auth.verifier.ts` (implementa `TokenVerifier`: lee la sesión de la cookie o del *bearer*), `emails.ts` (plantillas en español con Resend), `password.ts` (bcrypt), `migrate-supabase.ts` (§3.1.7).
- Base: Kysely sobre la misma Postgres. `database: { db: kysely.withSchema("auth"), type: "postgres" }` — **a confirmar en el spike** que el adaptador Kysely de Better Auth respeta `withSchema`; si no, un `pg.Pool` propio con `options: "-c search_path=auth,public"`.
- `BETTER_AUTH_SECRET` (32+ bytes, Secret Manager) firma cookies y cifra los secretos TOTP. `BETTER_AUTH_URL = https://mirai.engynex.com` (el origen público, §3.1.5). `trustedOrigins` = los orígenes de la web.
- Configuración clave:
  - `advanced.database.generateId: () => crypto.randomUUID()` (UUID como hoy).
  - `emailAndPassword: { enabled: true, requireEmailVerification: true, password: { hash: bcryptHash, verify: bcryptOrScryptVerify }, sendResetPassword }`. Se guarda bcrypt (costo 12): es el formato que importan Firebase y Supabase, así una salida futura sigue sin pedir claves nuevas.
  - `emailVerification: { sendVerificationEmail, autoSignInAfterVerification: true }`.
  - `plugins: [magicLink({ disableSignUp: true, sendMagicLink }), twoFactor({ issuer: "Mirai" }), bearer(), jwt() (opcional, para clientes nativos), admin() (suspender, listar)]`.
  - `socialProviders.google` con el cliente OAuth actual; `account.accountLinking: { enabled: true, trustedProviders: ["google"] }`.
  - `user.changeEmail: { enabled: true, sendChangeEmailVerification }`.
  - `session: { expiresIn: 60 días, updateAge: 1 día, cookieCache: { enabled: true, maxAge: 300 } }` (la caché firmada evita leer la base en cada petición).
  - `rateLimit` con almacenamiento en Postgres o Redis (`secondaryStorage`) y los límites de `LIMITS`.
  - `hooks.before` en `/sign-up/email` y `/sign-in/*`: Turnstile (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` + secreto), `registro_abierto()`, `LEGAL_VERSION`.
  - `databaseHooks.user.create.before/after`: llenar `raw_user_meta_data` (`nombre`, `acepta_version`, `ref`, `avatar_url` de Google) para que `handle_new_user()` haga lo mismo de siempre.

#### 3.1.3 Tablas (esquema `auth`, conservando nombres y UUID)

| Modelo de Better Auth | Tabla | Columnas que importan para la compatibilidad |
|---|---|---|
| `user` (`modelName: "users"`) | `auth.users` (la misma que apuntan las 44 FK) | `id uuid`, `email`, `email_verified bool` + `email_confirmed_at timestamptz` (columna mantenida por trigger), `name`, `image`, `created_at`, `updated_at`, `last_sign_in_at`, `raw_user_meta_data jsonb`, `raw_app_meta_data jsonb`, `banned`, `ban_reason`, `ban_expires`, `two_factor_enabled` |
| `session` | `auth.sessions` | `id`, `user_id`, `token`, `expires_at`, `ip_address`, `user_agent`, `created_at`, `updated_at` + `aal text` (campo adicional: `aal2` tras el segundo factor) |
| `account` | `auth.accounts` (reemplaza `auth.identities`) | `id`, `user_id`, `provider_id` (`credential`, `google`), `account_id` (correo o `sub` de Google), `password` (bcrypt), tokens de OAuth |
| `verification` | `auth.verifications` | enlaces mágicos, verificación y recuperación |
| `twoFactor` | `auth.two_factors` | `secret` (cifrado con `BETTER_AUTH_SECRET`), `backup_codes` |

Los nombres de campo se ajustan con `fields` (`emailVerified → email_verified`, etc.) y los campos de compatibilidad con `additionalFields`. La migración SQL de estas tablas es de Mirai (no `npx @better-auth/cli migrate` en producción): se genera una vez, se revisa y se versiona en `db/postgres/`.

#### 3.1.4 Flujos equivalentes

| Hoy (Supabase) | Con Better Auth | Pantalla |
|---|---|---|
| `signInWithPassword` + Turnstile | `authClient.signIn.email({ email, password, fetchOptions: { headers: { "x-captcha-response": token } } })` | `/login` |
| `signInWithOtp` (sin crear) | `authClient.signIn.magicLink({ email, callbackURL })`; correo propio; `disableSignUp` | `/login` |
| `signInWithOAuth` Google | `authClient.signIn.social({ provider: "google", callbackURL })`; vuelve a `/api/auth/callback/google` | `/login`, `/registro` |
| `signUp` + metadatos + correo de confirmación | `authClient.signUp.email({ email, password, name, nombre, acepta_version, ref })`; `requireEmailVerification`; enlace a `/api/auth/verify-email?token=…&callbackURL=/bienvenida` | `/registro` |
| AAL2 / `/verificacion` | Respuesta `twoFactorRedirect: true` → `/verificacion` → `authClient.twoFactor.verifyTotp({ code })` (o código de respaldo) | `/verificacion` |
| Activar / quitar TOTP | `twoFactor.enable({ password })` → URI `otpauth://` (QR) → `verifyTotp`; `twoFactor.disable({ password })`; códigos de respaldo (nuevo: hoy no hay) | Ajustes › Seguridad |
| `resetPasswordForEmail` → `/actualizar-clave` | `authClient.requestPasswordReset({ email, redirectTo: "/actualizar-clave" })` → `resetPassword({ token, newPassword })` | `/recuperar`, `/actualizar-clave` |
| `updateUser({ password })` con sesión | `changePassword({ currentPassword, newPassword, revokeOtherSessions })`; si entró solo con Google, `setPassword` desde la API | Perfil |
| Cambio de correo "seguro" (dos enlaces) | `changeEmail({ newEmail })` → enlace al correo **actual** para aprobar y verificación del nuevo (hay que confirmar en el spike que el flujo de dos pasos está disponible; si no, se arma con `sendChangeEmailVerification` + aviso al correo viejo con "No fui yo") | Perfil |
| `cancel_my_email_change` | `DELETE /v1/account/email-change` borra la `verification` pendiente | Perfil |
| `getUserIdentities` / `linkIdentity` / `unlinkIdentity` | `listAccounts()`, `linkSocial({ provider: "google" })`, `unlinkAccount({ providerId })` (no deja quitar el último método) | Perfil › Cuentas conectadas |
| `remove_my_password` / `ensure_email_identity` | `DELETE /v1/account/methods/password` (borra la fila `credential` si hay otro método) / innecesaria (la fila `credential` existe si hay clave) | Perfil |
| `my_sessions` / `revoke_my_session` / `signOut` `others` / `global` | `listSessions()`, `revokeSession({ token })`, `revokeOtherSessions()`, `revokeSessions()` | Ajustes › Seguridad |
| `auth.admin.listUsers/getUserById/updateUserById(ban)/generateLink(recovery)/deleteUser/inviteUserByEmail` | Plugin `admin` (`listUsers`, `banUser`/`unbanUser`, `removeUser`) + `POST /v1/admin/users/:id/recovery-link` (crea la verificación y devuelve el enlace) + `POST /v1/admin/invitations` (crea la cuenta sin clave y manda el enlace) | Consola |
| Términos en `user_metadata` | `consents` (ya existe) por `/v1/me/consents` | `legal-update.tsx` |

Mensajes de error: un mapa `AUTH_ERRORS` en `packages/contracts` (códigos de Better Auth → español, tuteo), igual que hoy en `login-form.tsx`.

#### 3.1.5 Sesión en la web: mismo origen y cookie httpOnly (D2)

- El balanceador (GCP) / ALB (AWS) / Front Door (Azure) enruta por ruta en **`mirai.engynex.com`**: `/api/auth/*` y `/v1/*` → `api`; `/socket.io/*` → `realtime`; el resto → `web`. `api.mirai.engynex.com` se mantiene para webhooks, Scheduler y clientes externos.
- Better Auth pone la cookie `__Secure-mirai.session_token` (httpOnly, Secure, `SameSite=Lax`, solo el host, 60 días deslizantes) y la caché firmada de 5 min. **El navegador nunca maneja tokens.**
- El cliente de la API (`apps/web/lib/api/client.ts`) usa `baseUrl: "/v1"` y `credentials: "same-origin"`: se borran `refreshSession`/`getSession` (:23,26). CSRF: `SameSite=Lax` + revisión de `Origin` en Better Auth y en la API + encabezado obligatorio `X-Mirai-Client` en métodos que cambian datos (un formulario de otro sitio no puede ponerlo).
- **SSR y `proxy.ts`**: `proxy.ts` solo mira si existe la cookie (barato, sin secretos) para mandar a `/login`; `getAppContext()` llama a `GET /v1/me` por la URL interna reenviando el encabezado `cookie`; si responde 401 → `/login`. La web no guarda ningún secreto.
- **Gateway**: el *handshake* de socket.io en `/socket.io` lleva la cookie (mismo origen); `BetterAuthVerifier` la valida. Se retira `auth:refresh` (la cookie se renueva sola) y la revisión cada 10 min revisa que la sesión siga viva (cerrar la sesión de otro dispositivo lo desconecta).
- **Claims para la RLS**: el verificador arma `{ sub: user.id, role: "authenticated", email, session_id: session.id, aal }` y lo pone en `request.jwt.claims` (Kysely) o en el JWT interno de PostgREST (§3.3). `my_sessions()` sigue marcando "esta sesión" con `auth.jwt()->>'session_id'`.
- Durante la transición el `TokenVerifier` es una cadena: Better Auth → Supabase JWT (hasta el corte B + 30 días) → Identity Platform (si algún día se enciende).
- **Interruptor en tiempo de ejecución** `AUTH_PROVIDER=supabase|mirai` (lo lee el servidor y lo pasa al navegador en la configuración de §3.8; no es `NEXT_PUBLIC`, así volver atrás no exige recompilar).

#### 3.1.6 Base: `cuenta_titularidad v2`

Migración nueva solo para la Postgres destino (`db/postgres/0003_auth_better.sql`):
- `on_auth_user_change`: vigila `email` y `last_sign_in_at` en `auth.users` (igual que hoy).
- Trigger nuevo en `auth.accounts`: `insert/delete` con `provider_id <> 'credential'` → `metodo_conectado`/`metodo_quitado`; cambios en `password` → `contrasena` (`creada`/`cambiada`/`quitada`). Reemplaza la parte de `encrypted_password` y `on_auth_identity_change`.
- Trigger en `auth.sessions` `after insert` → `update auth.users set last_sign_in_at = now()` (dispara `inicio` como hoy) y mantiene `email_confirmed_at` desde `email_verified`.
- `my_account()`, `my_sessions()` leen `auth.accounts`/`auth.sessions`; `revoke_my_session`, `cancel_my_email_change`, `ensure_email_identity` y `remove_my_password` se retiran de SQL (lo hace la API con Better Auth) y quedan como funciones que lanzan "Usa la API" por si algo viejo las llama.
- La actualización de fotos de Google (`20261101000100_perfil.sql:35-41`) ya corrió: no se repite.

#### 3.1.7 Migración de usuarios desde Supabase

Script `scripts/migrate/auth-from-supabase.ts` (lee de una conexión de solo lectura a Supabase; escribe en la Postgres destino en una transacción; idempotente con `on conflict`):

| De Supabase | A | Regla |
|---|---|---|
| `auth.users.id` | `auth.users.id` | **Mismo UUID** (las 44 FK y todo `public` siguen sirviendo) |
| `email`, `email_confirmed_at`, `created_at`, `updated_at`, `last_sign_in_at`, `raw_user_meta_data`, `raw_app_meta_data` | mismas columnas; `email_verified = email_confirmed_at is not null`; `name = coalesce(meta.nombre, meta.full_name, split_part(email,'@',1))`; `image = meta.avatar_url` | — |
| `banned_until > now()` | `banned = true`, `ban_expires = banned_until` | Suspendidos siguen suspendidos |
| `encrypted_password` (bcrypt `$2a$10$…`) | `auth.accounts(provider_id='credential', account_id=id, password=<el mismo hash>)` | `verify` acepta `$2a$`/`$2b$` con `bcryptjs`: **nadie cambia su clave** |
| `auth.identities` con `provider='google'` | `auth.accounts(provider_id='google', account_id=identities.provider_id /* sub de Google */)` | Entrar con Google cae en la misma cuenta |
| `auth.mfa_factors` (`factor_type='totp'`, `status='verified'`) | `auth.two_factors(secret = cifrado con BETTER_AUTH_SECRET)` y `users.two_factor_enabled = true` | **Si `secret` viene en claro** (GoTrue lo guarda así salvo que se haya activado su cifrado; se confirma en el ensayo) **nadie re-enrola**. Si no se puede leer: `two_factor_enabled = false` + marca `mfa_reactivar` y al entrar se le pide activarlo de nuevo antes de usar la app |
| `auth.sessions`, `refresh_tokens` | — | **No se migran**: todos entran una vez después del corte (aviso previo) |
| `is_anonymous = true`, cuentas sin correo | — | Se reportan (hoy no debería haber: anónimos apagados) |

Verificación: mismo número de usuarios, de cuentas con clave, de identidades Google y de factores; prueba de humo con 3 cuentas reales de prueba (clave, Google, TOTP). Usuarios creados entre la importación de ensayo y el corte: el script se corre otra vez dentro de la ventana (tarda segundos).

#### 3.1.8 Correos de auth

Los manda la API por `@mirai/services` (Resend o el proveedor de la consola, con el `notification_log` de siempre), desde `no-responder@mirai.engynex.com`, con plantillas en español en `packages/services/src/mail/auth/*`: verificar correo, enlace para entrar, recuperar clave, cambio de correo (al nuevo y aviso al viejo), cuenta suspendida y nuevo inicio de sesión (opcional). Requisito: dominio verificado en Resend (SPF, DKIM y DMARC en Hostinger). Hoy Supabase manda esos correos con su SMTP: hay que revisar en Supabase › Auth › SMTP si ya usa Resend (§6, pregunta 11).

#### 3.1.9 Identity Platform como adaptador opcional

Se deja escrito (sin encender) en `apps/api/src/adapters/gcp/identity-platform.*`: `IdentityPlatformVerifier` (JWKS `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`, emisor `https://securetoken.google.com/<proyecto>`) + `GipIdentityAdmin` (Admin SDK) + tabla `auth.external_ids(provider, external_uid, user_id)` para mapear los uid de 28 caracteres a los UUID. El módulo `infra/terraform/modules/identity-platform` se conserva con `stages.identity_platform = false`. No se usa en el plan.

### 3.2 RLS sin Supabase (D3)

Migración `db/postgres/0000_compat.sql`, **solo** para la Postgres destino (Cloud SQL, RDS, Azure o Docker local), antes de la línea base:

```sql
-- Roles que usan las 124 políticas y los grant de las migraciones (mismos nombres que en Supabase).
create role anon nologin;            create role authenticated nologin;
create role service_role nologin;    -- BYPASSRLS si la plataforma lo permite (ver abajo)
create role authenticator login noinherit password :'pgrst_pwd';   -- lo usa PostgREST
grant anon, authenticated, service_role to authenticator;
-- La API (usuario IAM en Cloud SQL / contraseña en otras) también cambia de rol por transacción:
grant anon, authenticated, service_role to mirai_api;

create schema if not exists extensions;  create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;  grant usage on schema auth to anon, authenticated, service_role;

-- Idénticas a las de Supabase (leen lo que ponen PostgREST o la API con set_config(..., true)).
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
create or replace function auth.email() returns text language sql stable as $$ select auth.jwt() ->> 'email' $$;
grant execute on all functions in schema auth to anon, authenticated, service_role;
```

- **Tablas de `auth`**: las de Better Auth (§3.1.3). `auth.users` debe existir **antes** de crear las FK de `public` (orden de §3.7).
- **`service_role` y la RLS**: en Supabase tiene `BYPASSRLS`. En Cloud SQL hay que **confirmar en el ensayo** si `cloudsqlsuperuser` puede darlo (`alter role service_role bypassrls`). Plan B sin depender de eso: que `service_role` sea **dueño** de las tablas y funciones de `public` (la restauración corre con `set role service_role`); los dueños saltan la RLS porque ninguna tabla usa `force row level security` (0 usos). El plan B también sirve en RDS y Azure.
- **`SystemScope`**: siempre `set local role service_role` + `request.jwt.claims = {"role":"service_role"}` (hoy no pone nada, `pg-kysely.factory.ts:28`). Así `auth.role() = 'service_role'` funciona en las 5 comprobaciones (§1.7) igual que con la clave secreta.
- **`UserScope`**: lo de hoy (`set local role authenticated` + claims + `request.headers`), con los claims de §3.1.5.
- **`anon`**: lo usan solo los endpoints públicos (portada, invitación, portal del contador, `registro_abierto`).
- **Dueño de las funciones `security definer`**: el mismo rol dueño de las tablas (`service_role` en el plan B, `mirai_owner` si hay `BYPASSRLS`). Nunca `cloudsqlsuperuser`.
- Prueba automática (Postgres 17 en Docker): para cada una de las 50 tablas con políticas, un caso "miembro ve / no miembro no ve / viewer no escribe", con la matriz `ROLE_MATRIX` de `packages/domain` (V7-C).

### 3.3 Acceso a datos en el servidor: puente PostgREST + Kysely (D4)

**Problema.** Después de F2-H, `packages/services` (113 `.from` + 6 `.rpc`), `packages/ai` (101 + 7) y los adaptadores `supabase-js.*` de la API (161 + 45, en 21 adaptadores sin par Kysely: `account`, `admin`, `billing`, `households`, `tax/accountant`, `chat-writes`, `ai-files`, `ai`, `integrations`, `notifications/delivery`, `import/backup-storage`, idempotencia, límites…) siguen hablando con PostgREST. Reescribir ~430 consultas en Kysely antes del corte agrega semanas y riesgo de diferencias de comportamiento.

**Decisión.** Un servicio **`mirai-postgrest`** (imagen oficial `postgrest/postgrest`, versión fija) **solo con tráfico interno** (ingress interno en Cloud Run; subred privada en ECS/Container Apps), conectado a la Postgres destino con el rol `authenticator`:
- `PGRST_DB_SCHEMAS=public`, `PGRST_DB_ANON_ROLE=anon`, `PGRST_JWT_SECRET` (HS256, 32+ bytes, Secret Manager, **solo lo conocen la API y PostgREST**), `PGRST_DB_POOL=10`, `PGRST_DB_CHANNEL_ENABLED=true` (recarga del esquema con `notify pgrst` después de cada migración).
- La API firma un **JWT interno de 60 s** por petición: `UserScope` → `{ sub, role: "authenticated", email, session_id, aal }`; `SystemScope` → `{ role: "service_role" }`. PostgREST hace `set local role` y pone `request.jwt.claims` **y `request.headers`** (con `x-mirai-enlaces: 1`) igual que Supabase: misma RLS, mismas cascadas.
- `SupabaseJsFactory` → `PostgrestFactory` (`@supabase/postgrest-js`, ya instalado): mismo `.from()/.rpc()`; `packages/services` y `packages/ai` cambian solo el tipo `Db` (§1.1). `.auth.*` y `.storage.*` dejan de compilar → se mueven a Better Auth y a `ObjectStore`.
- `DB_ADAPTER=supabase|postgrest|pg` por módulo (hoy hay `supabase|pg`): `postgrest` para lo que aún no tiene Kysely, `pg` para lo que sí.
- Costo y latencia: un contenedor pequeño (0,5 vCPU, mínimo 1 en producción, ~USD 10–15/mes); un salto interno de 2–5 ms. Portable: es un contenedor más en ECS o Container Apps.
- **Después del corte**, se reescriben en Kysely los módulos con más tráfico (book-tables ya está) y PostgREST se puede retirar cuando `grep -r "postgrest" apps/api/src packages` quede vacío. No bloquea el corte.

### 3.4 Archivos: puerto `ObjectStore` (D5)

**Buckets** (los 3 de la estrategia, `infra/terraform/stack/data.tf:10-37`), con el bucket lógico como prefijo para que las rutas guardadas en la base **no cambien**:

| Lógico (Supabase) | GCS / S3 / Azure | Acceso |
|---|---|---|
| `attachments/{book_id}/…`, `logos/{book_id}/…`, `feedback/{user_id}/…` | `mirai-<amb>-private-<sufijo>` (`attachments/…`, `logos/…`, `feedback/…`) | Privado; URL firmadas de 5 min |
| `backups/{book_id}/…` | `mirai-<amb>-backups-<sufijo>` (versionado, borrado suave 14 días) | Privado |
| `avatars/…`, `ads/…`, `public-assets/…` | `mirai-<amb>-public-<sufijo>` detrás de `files.mirai.engynex.com` (CDN) | Lectura pública; escritura solo con URL firmada |

**Puerto** (`apps/api/src/core/files/object-store.ts`): `signUpload({ bucket, key, contentType, maxBytes, ttl })`, `signDownload({ bucket, key, ttl, download? })`, `get`, `put`, `list(prefix)`, `remove(keys[])`, `publicUrl(key)`. Adaptadores:
- `gcs` (por defecto en GCP): `@google-cloud/storage` con ADC; firma V4 con `signBlob` sobre la cuenta del servicio (`iam.serviceAccountTokenCreator` sobre sí misma, ya en `modules/iam`). Sin llaves.
- `s3`: `@aws-sdk/client-s3` + `s3-request-presigner`; sirve para AWS S3, **MinIO en Docker** (desarrollo y pruebas sin nube) y cualquier compatible (R2, la interoperabilidad de GCS con HMAC como último recurso).
- `azure-blob`: SAS de delegación de usuario (identidad administrada, sin llaves).

**Reglas** (`FilesModule`, las mismas de las políticas de `storage.objects` de §1.5): `attachments`/`logos` → miembro del libro (`viewer` lee, `editor` escribe); `backups` → `admin` del libro; `feedback` → el dueño de la carpeta o admin de la plataforma; `avatars` → la persona (o un integrante de la familia de su hogar, con permiso `editor`); `ads` y `public-assets` → admin de la plataforma. Límites de tamaño y tipos MIME de cada bucket (`file_size_limit`, `allowed_mime_types` de las migraciones) se exigen en la firma (`x-goog-content-length-range` / condiciones del *presigned POST* / SAS).

**Flujo de subida**: `POST /v1/files/uploads { bucket, bookId?, name, type, size }` → `{ uploadUrl, key, headers }` → `PUT` directo al bucket (CORS solo para el origen de la web, ya en Terraform) → `POST /v1/files/uploads/:key/complete` (registra la fila: `attachments`, `feedback.screenshot`, etc.). Lectura privada: `GET /v1/files/url?bucket&key` → URL de 5 min. Pública: `PUBLIC_FILES_URL + "/" + key`.

**Copia de los objetos**: script `scripts/migrate/storage-copy.ts` con la clave secreta de Supabase **que ya está en `.env.local`** (lista y descarga por la API de Storage, sube con el adaptador; no hacen falta llaves S3 de Supabase ni rclone). Idempotente (salta lo que ya existe con el mismo MD5), con reporte de conteo y MD5 por bucket. Se corre en el paso A (los archivos nuevos siguen entrando a Supabase hasta encender `files`), y una pasada final de diferencias en la ventana B. Storage Transfer Service no compensa para este volumen.

**Reescritura de URL**: `scripts/migrate/rewrite-public-urls.sql` reemplaza `https://<ref>.supabase.co/storage/v1/object/public/<bucket>/` por `https://files.mirai.engynex.com/<bucket>/` en las columnas encontradas por el barrido (§1.5). Idempotente.

**Web**: `next/image` no se usa con imágenes remotas (no hay `remotePatterns`); CSP `img-src` suma `https://files.mirai.engynex.com`.

### 3.5 Tiempo real (D9)

- En la Postgres destino, después de restaurar: `select public.mirai_live_notify_install(true);` (instala los triggers de `NOTIFY_TABLES`).
- `mirai-realtime` con `REALTIME_PG_LISTEN=1` y `DATABASE_URL` **directa** (sesión, no un *pooler* en modo transacción). Redis estándar para varias instancias (Memorystore Basic en producción; ElastiCache o Azure Cache en otras nubes; TLS con la CA cuando F2-G la acepte, estrategia §10).
- La web se compila sin Supabase Realtime: `hooks/use-live.ts` queda solo con el gateway; se borran `hooks/use-realtime.ts` y el canal de `features/automations/runner.tsx` (el *outbox* de la API ya corre las automatizaciones; interruptor `automations_server_only` en `on`).
- Gateway en el mismo origen (`/socket.io` por el balanceador), autenticado con la cookie (§3.1.5).
- Comprobación del corte: un cambio en una pestaña llega a otra en < 1 s; presencia correcta; reconexión al reiniciar una instancia.

### 3.6 pg_cron/pg_net, cron y colas (D6, D7)

1. **Paso A** (Supabase todavía): Scheduler en simulación 3 días (`scheduler_dry_run = true`) → corte del cron: `select cron.unschedule('mirai-notify');` en Supabase y quitar `crons` de `vercel.json` (runbook §5). Vuelta atrás: `select public.mirai_schedule_notify('https://mirai.engynex.com', '<CRON_SECRET>');`.
2. **Postgres destino**: no se crean `pg_cron` ni `pg_net`. La línea base redefine `mirai_schedule_notify()` como no-op que devuelve "El cron vive en el programador de la nube" y `mirai_notify_cron_active()` como `select coalesce((select cron_horario_visto > now() - interval '2 hours' from public.platform_settings where id), false)`.
3. No hay otro `net.http_*` en funciones ni triggers (verificado: único uso en `20261031001000_notify.sql:19`).
4. **Puerto `QueuePort`** (ya existe con `CloudTasksQueue` e `InlineQueue`): se agrega `PgQueue` (tabla `jobs.queue` con `for update skip locked`, reintentos con espera creciente, `dedupe_key` = el nombre de la tarea de hoy, p. ej. `notify-<hogar>-<AAAAMMDDHH>`) y un proceso `MODE=worker` que la consume. GCP sigue con Cloud Tasks; AWS y Azure pueden usar `pg` sin servicios extra, o `sqs`/`servicebus` si se prefiere.
5. **Scheduler por nube** (solo llama HTTP): GCP Cloud Scheduler con OIDC (hoy); AWS EventBridge Scheduler → tarea de ECS que hace `curl` con `CRON_SECRET` (o *API destination*); Azure Container Apps Job con `cron` y `curl`. `SchedulerGuard` acepta OIDC de Google, `Bearer CRON_SECRET` y (nuevo) un emisor OIDC configurable (`SCHEDULER_OIDC_ISSUER`/`AUDIENCE`).

### 3.7 Datos: Supabase → Postgres administrada (D10)

**Por qué volcado y no DMS.** ~90 MB: `pg_dump` + `pg_restore` tardan del orden de 1–3 minutos; la ventana la dominan las verificaciones. DMS para PostgreSQL pide `pglogical` y permisos de replicación en el origen que Supabase no garantiza, migra esquemas que no queremos (`auth` de GoTrue, `storage`) y no ahorra nada a este tamaño. Lo mismo vale para AWS DMS o Azure DMS el día que se cambie de nube.

**Qué se lleva**

| Esquema | Se lleva | Cómo |
|---|---|---|
| `public` (≈103 tablas, 107 funciones, 41 triggers, 124 políticas) | Sí | Esquema: **línea base** desde `pg_dump --schema-only --schema=public --no-owner` de producción, filtrada (sin `grant` a roles que no existen: `postgres`, `supabase_admin`, `dashboard_user`…; sin `alter default privileges for role supabase_admin`; sin referencias a `storage.*`, `cron.*`, `net.*`; sin la publicación `supabase_realtime`). Se compara con "aplicar las 56 migraciones + compatibilidad" en Docker para detectar diferencias |
| `auth` | Solo usuarios, cuentas, identidades Google y TOTP, **transformados** a Better Auth (§3.1.7) | Script |
| `storage` | No (los objetos van a GCS, §3.4) | — |
| `realtime`, `cron`, `net`, `vault`, `graphql`, `supabase_functions` | No | — |
| `extensions` | Solo `pgcrypto` | `0000_compat.sql` |

**Nueva carpeta de migraciones** `db/postgres/` (la toma `packages/db` y el trabajo `db-migrate`): `0000_compat.sql`, `0001_baseline.sql` (la línea base), `0002_cloud_overrides.sql` (cron no-op, `mirai_notify_cron_active`, publicación fuera), `0003_auth_better.sql` (§3.1.6), y desde ahí las migraciones nuevas. `supabase/migrations/` queda congelada como historia. Las tres migraciones escritas y sin aplicar (§1.7) entran en la línea base.

**Orden de la restauración** (en la ventana, desde una VM o el trabajo `db-migrate` dentro de la VPC; o desde este computador por el Cloud SQL Auth Proxy si el dueño lo autoriza):
1. `0000_compat.sql` → `0003_auth_better.sql` (crea `auth.users` y demás).
2. `pg_restore --section=pre-data` de la línea base (tablas sin FK ni triggers).
3. Script de usuarios (§3.1.7) → `auth.users`, `auth.accounts`, `auth.two_factors`.
4. `pg_dump --data-only --schema=public -Fc` de Supabase (con las escrituras ya cerradas) → `pg_restore --section=data` (los triggers todavía no existen: no se disparan `trg_audit`, `trg_touch` ni las cascadas).
5. `pg_restore --section=post-data` (índices, FK, triggers, políticas). Si una FK falla, falta un usuario o una fila: se detiene y se revisa.
6. Secuencias de identidad (`audit_log`, `admin_audit`, `notification_log`, `account_events`): `select setval(…, max(id))` y verificación.
7. `select public.mirai_live_notify_install(true);`, `analyze;`, `notify pgrst, 'reload schema';`.

**Verificación** (`scripts/migrate/verify.ts`, corre contra los dos lados y falla con cualquier diferencia):
- Conteo por tabla de `public` (todas) y de usuarios/cuentas/factores.
- Suma de control por tabla: `md5(string_agg(md5(row_to_json(t)::text), '' order by id))`, y por libro en las tablas con `book_id` (para localizar diferencias).
- Valores de secuencias, número de políticas, triggers y funciones (`pg_policies`, `pg_trigger`, `pg_proc`).
- Humo funcional: `/v1/me` de 3 cuentas (dueño, colabora, solo mira), un CRUD de categoría, un pago de fijo, la campana, el contador por token y un cambio en vivo.

**Vuelta atrás**: §5.4.

### 3.8 Web sin Vercel

- **Next.js standalone** en Cloud Run (ya probado en local, estrategia §9): declarar `output: "standalone"` en `next.config.ts` y leer `GIT_SHA` en vez de `VERCEL_GIT_COMMIT_SHA` (`next.config.ts:13`).
- **Una imagen para todos los ambientes (D16)**: los `NEXT_PUBLIC_*` que cambian por ambiente (URL del sitio, Sentry, Turnstile, Wompi, AdSense, VAPID pública, datos legales) se leen en el servidor y se inyectan con un `<script>` en el layout raíz (`window.__MIRAI__`) que lee un `lib/public-config.ts`. Así la imagen de pruebas se promueve tal cual a producción y a otra nube. Lo que queda en el build: nada específico del ambiente.
- **Balanceador + CDN**: `/_next/static/*` con `immutable` desde la CDN; `/sw.js`, `/offline.html` y `/manifest.webmanifest` sin caché (ya en `next.config.ts:23-28`; la CDN respeta las cabeceras con `USE_ORIGIN_HEADERS`, `modules/lb-https/main.tf:243`). Páginas con sesión: `Cache-Control: private` (las pone Next).
- **ISR y caché de datos**: Mirai no usa `revalidate`, `"use cache"` ni `unstable_cache` (verificado: 0 usos), así que la caché por instancia de Cloud Run no cambia nada. Si algún día se usa, un `cacheHandler` sobre Redis.
- **`next/image`**: solo con imágenes locales; el optimizador corre en el contenedor (Sharp ya viene con Next standalone). No hay `remotePatterns`.
- **Cabeceras de seguridad**: las de `lib/security/headers.ts` (HSTS lo pone la web). CSP: `connect-src 'self' https://files.mirai.engynex.com <Sentry>` (la API y el gateway ya son el mismo origen); `img-src` con `files.`; pasar de "solo reportar" a exigir tras 2 semanas sin reportes.
- **PWA**: el service worker debe quedar en la raíz con `Service-Worker-Allowed: /` (ya); verificar que la CDN no cachee `sw.js` y que `/api/public/version` no pase por caché (el aviso "Hay una versión nueva" depende de eso). `f22-pwa.spec.ts` contra el dominio nuevo.
- **Dominio y certificado**: Certificate Manager con autorización DNS (`_acme-challenge` en Hostinger, runbook §2.5) para `mirai.engynex.com`, `*.mirai.engynex.com`, `pruebas.mirai.engynex.com` y `*.pruebas.mirai.engynex.com`.
- **Variables en el build de CI**: con D16 casi ninguna; mientras tanto, `WEB_BUILD_ENV_B64` de Cloud Build o el equivalente de GitHub Actions (§3.12).
- `lib/site-url.ts:6,17`: quitar `VERCEL_PROJECT_PRODUCTION_URL`; `app/api/pagos/mercadopago/route.ts:25` desaparece (webhooks en la API); `@vercel/speed-insights` fuera.

### 3.9 IA sin Vercel (D13)

- Nuevo proveedor de plataforma `vertex` en `packages/ai/src/model.ts` (`@ai-sdk/google-vertex`, credenciales por ADC: la cuenta `mirai-<amb>-api` con `roles/aiplatform.user`; región `us-east1` o `us-central1`). Modelos por la API de modelos como hoy (`listModels`), nunca escritos a mano.
- Orden de respaldo por defecto: Vertex (Gemini) → los proveedores con llave de la consola (Groq, OpenRouter, Claude, OpenAI). `ai_gateway` queda como integración del hogar ("pega tu propia llave") y como opción de la plataforma si el dueño lo decide.
- Portabilidad: el adaptador de modelo ya es por proveedor; en AWS sería Bedrock y en Azure Azure OpenAI, con la misma interfaz (`aiText`/`aiObject`), y la consola elige.

### 3.10 Integraciones externas a reconfigurar

| Servicio | Qué cambia | Cuándo |
|---|---|---|
| **Google OAuth (login)** | Nueva URI de redirección `https://mirai.engynex.com/api/auth/callback/google` (y la de `pruebas.`); quitar después `https://<ref>.supabase.co/auth/v1/callback`. Orígenes JavaScript: los dominios de la web | Antes del ensayo en pruebas / antes del corte B |
| **Google OAuth (Gmail y Calendar)** | `https://api.mirai.engynex.com/v1/google/callback` (+ `api.pruebas.`) (estrategia §14.9). Mantener el mismo cliente: Gmail de solo lectura es un alcance restringido y cambiar de cliente obligaría a otra verificación de Google | Antes de encender `google` |
| **Mercado Pago** | URL de notificaciones (webhook) → `https://api.mirai.engynex.com/v1/webhooks/mercadopago`; el secreto de firma se conserva (si se regenera, cargar el nuevo en Secret Manager primero) | Paso A, después de probar en sandbox |
| **Wompi** | URL de eventos por ambiente (sandbox y producción) → `https://api.mirai.engynex.com/v1/webhooks/wompi`; `redirect-url` del checkout ya sale de `SITE_URL` | Paso A |
| **Meta / WhatsApp** | No hay webhook entrante (verificado). Cambian las URL de las imágenes de plantillas (bucket `public-assets` → `files.`): volver a guardar la plantilla si Meta tiene la URL vieja. Si Meta exige IP fija, Cloud NAT con IP estática | Paso A (archivos) |
| **Telegram** | Usa `getUpdates` (sondeo, `packages/services/src/notify/actions.ts:64`), sin webhook: nada que cambiar. Confirmar que el bot no tenga un webhook puesto (`getWebhookInfo`) porque rompería `getUpdates` | — |
| **Resend** | Dominio verificado (SPF, DKIM, DMARC en Hostinger) para `mirai.engynex.com`; ahora también manda los correos de auth | Antes del ensayo de auth |
| **Web push (VAPID)** | Nada: se conserva la misma pareja (cambiarla invalida todas las suscripciones). El origen no cambia (`mirai.engynex.com`) | — |
| **AdSense** | `ads.txt` lo sirve la web desde el endpoint público (§2.2, E28); el sitio sigue siendo `mirai.engynex.com`. Revisar en AdSense que `ads.txt` siga "Autorizado" 48 h después del corte DNS | Paso A |
| **Google Search Console** | Si la propiedad se verificó con un archivo HTML o una etiqueta servida por Vercel, cambiarla a **propiedad de dominio por DNS (TXT)** antes del corte; reenviar el sitemap | Antes del paso A |
| **Cloudflare Turnstile** | Agregar `pruebas.mirai.engynex.com` (y `localhost`) a los dominios del widget; el secreto pasa a la API (lo verificaba Supabase) | Antes del ensayo de auth |
| **Sentry** | Sin cambio de DSN; `release` = `GIT_SHA`; agregar el entorno de pruebas | Paso A |
| **Supabase Auth (mientras exista)** | URL de redirección de los dominios nuevos (paso A) | Paso A |

### 3.11 Terraform por capacidades y portable (D14)

#### 3.11.1 Estructura

```
infra/terraform/
  capabilities/                   # cada capacidad = un contrato (variables.tf + outputs.tf idénticos) y 3 implementaciones
    network/{contract.md,gcp,aws,azure}
    container-service/{…}         # Cloud Run v2 | ECS Fargate (+ ALB target group) | Azure Container Apps
    postgres/{…}                  # Cloud SQL PG 17 | RDS PostgreSQL 17 | Azure Database for PostgreSQL Flexible Server
    object-storage/{…}            # GCS | S3 | Blob Storage   (buckets private/backups/public, CORS, ciclo de vida)
    queue/{…}                     # Cloud Tasks | SQS (+ DLQ) | Service Bus  (o nada si QUEUE_DRIVER=pg)
    scheduler/{…}                 # Cloud Scheduler (OIDC) | EventBridge Scheduler | Container Apps Job (cron)
    secrets/{…}                   # Secret Manager | Secrets Manager | Key Vault   (contenedor + acceso; valores aparte)
    registry/{…}                  # Artifact Registry | ECR | ACR
    edge/{…}                      # LB HTTPS + Cloud Armor + CDN + Certificate Manager | CloudFront + WAF + ALB + ACM | Front Door Premium + WAF
    redis/{…}                     # Memorystore | ElastiCache | Azure Cache for Redis
    monitoring/{…}                # alertas + canales + uptime | CloudWatch alarms + SNS | Azure Monitor alerts + action group
    budget/{…}                    # Billing budget | AWS Budgets | Consumption budget
    ci-identity/{…}               # WIF para GitHub | IAM OIDC provider + rol | Entra app + federated credential
  stacks/{gcp,aws,azure}/         # compone las capacidades para un ambiente (lo que hoy es stack/)
  envs/{gcp,aws,azure}/{bootstrap,pruebas,produccion}/
  modules/                        # módulos GCP actuales: capabilities/*/gcp los envuelven (no se reescriben)
  tests/                          # terraform test por nube con proveedores simulados
```

**Contrato común** (ejemplos; cada `contract.md` lo fija y una prueba revisa que las tres implementaciones tengan las mismas variables y salidas):

| Capacidad | Entradas | Salidas |
|---|---|---|
| `container-service` | `name`, `image`, `cpu`, `memory`, `min/max_instances`, `concurrency`, `port`, `env` (map), `secret_env` (map nombre → id de secreto), `ingress` (`internal`\|`edge`), `session_affinity`, `timeout_s`, `health_path`, `vpc` | `service_id`, `internal_url`, `identity` (cuenta / rol / identidad administrada) |
| `postgres` | `version` (17), `tier` (s/m/l), `ha`, `storage_gb`, `backup_days`, `pitr_days`, `private_network`, `app_users` | `host`, `port`, `database`, `connection_secret_id`, `admin_secret_id` |
| `object-storage` | `buckets` = { private, backups, public } con `cors_origins`, `lifecycle`, `versioning`, `public_read` | `bucket_names`, `public_base_url` |
| `edge` | `domains`, `routes` (= `/api/auth/*`, `/v1/*` → api; `/socket.io/*` → realtime; `/*` → web; `files.` → bucket público), `waf` (preview/enforce, límites), `cdn_paths` | `ip_or_cname`, `dns_records` (lo que hay que crear en Hostinger) |
| `queue` | `queues` (`notify`, `automations`, `slow`) con reintentos | `queue_ids`, `enqueuer_role` |
| `scheduler` | `jobs` = [{ name, cron, url, body, auth: oidc\|secret }] | `job_ids` |

**Estado de cada nube**
- **GCP (destino, completo)**: `capabilities/*/gcp` envuelve los 17 módulos actuales; `stacks/gcp` = el `stack/` de hoy con estos cambios: `realtime` y `postgrest` como servicios; reglas de ruta del mismo origen en el balanceador; `supabase-secret-key` opcional (y luego borrado); secretos nuevos `better-auth-secret`, `postgrest-jwt-secret`, `turnstile-secret`, `postgrest-db-password` (si no se usa IAM); `aiplatform.user` para la API; `identity_platform` apagado; región como variable (D12). Las pruebas actuales (`stack/tests/stack.tftest.hcl`) se mueven y se amplían.
- **AWS (implementado y validable)**: VPC con subredes públicas/privadas y NAT; ECS Fargate (web, api, realtime con *stickiness*, postgrest, worker) detrás de un ALB; CloudFront + WAF + ACM delante; RDS PostgreSQL 17 Multi-AZ en producción; S3 (3 buckets) + CloudFront para `files.`; ElastiCache Redis; Secrets Manager (inyectado en la definición de tarea); EventBridge Scheduler; SQS opcional; ECR; CloudWatch + SNS; AWS Budgets; IAM OIDC para GitHub. App Runner se descarta porque no maneja WebSocket para el gateway.
- **Azure (implementado y validable)**: VNet; Azure Container Apps (entorno con VNet, *sticky sessions* para realtime); Front Door Premium (WAF, CDN, certificados administrados, rutas por ruta); Azure Database for PostgreSQL Flexible Server 17 con HA por zona; Blob Storage; Azure Cache for Redis; Key Vault (referencias de secretos en Container Apps); Container Apps Jobs para el cron; Service Bus opcional; ACR; Azure Monitor + Action Group; presupuesto de consumo; Entra con credencial federada para GitHub.
- "Validable" = `terraform fmt -check`, `init -backend=false`, `validate` y `terraform test` con proveedores simulados en CI. **No se aplica** AWS ni Azure (no hay cuentas); el día que se use, se completa `terraform.tfvars` y se aplica igual que GCP.

**Qué no es portable y se acepta**: Cloud Armor/WAF tienen reglas distintas por nube (el contrato solo fija "modo vista previa/exigir, límite por IP, exenciones para webhooks"); la autenticación de servicio a servicio (OIDC de Google vs IAM de AWS vs identidades administradas) la absorbe cada `container-service`; los nombres de los tamaños (`tier`) se traducen en cada implementación.

### 3.12 CI/CD portable (D15)

`.github/workflows/`:
| Flujo | Qué hace |
|---|---|
| `ci.yml` (PR y push) | `pnpm turbo run lint typecheck test`; API con Postgres 17 y MinIO como *services* de GitHub (pruebas de RLS, auth y archivos); `terraform fmt/validate/test` de las tres nubes; E2E corta contra Docker Compose (web + api + realtime + postgrest + postgres + minio + redis) |
| `images.yml` (push a `pruebas`/`main`) | Construye **una vez** `web`, `api` (la misma imagen sirve `MODE=api|realtime|worker`) y usa la oficial de PostgREST; escanea (Trivy), firma (cosign) y publica en el registro de la nube activa con etiqueta `<sha>` |
| `deploy-gcp.yml` | `google-github-actions/auth` con WIF (sin llaves) → migraciones (`db-migrate` como Cloud Run Job) → `gcloud run deploy --image <digest> --no-traffic --tag canary` → humo por `canary.` → 10 % → 50 % → 100 % con la revisión de 5xx de `infra/cloudbuild/scripts/rollout.sh` (se reusa) → vuelta atrás automática. Producción con el entorno `produccion` de GitHub (revisores obligatorios) |
| `deploy-aws.yml` / `deploy-azure.yml` | `aws-actions/configure-aws-credentials` / `azure/login` con OIDC → `ecs update-service` / `az containerapp update` con el mismo *digest* (escritos y probados en seco; se activan el día que se use esa nube) |
| `terraform.yml` | `plan` en PR (comentario con el resumen) y `apply` manual por entorno con aprobación |
| `e2e.yml` (manual) | Playwright contra la URL del ambiente (`E2E_BASE_URL`) |

Cloud Build (`infra/cloudbuild/*`) se conserva como alternativa (mismos pasos) y su disparador queda apagado (`enable_ci_trigger = false`).

---

## 4. Backlog de implementación

Cada frente es **dueño exclusivo** de sus archivos (columna "Archivos"); si necesita algo de otro, lo pide por su contrato (`packages/contracts`). Los contratos nuevos se escriben primero (V7-0) para que todos arranquen en paralelo.

### 4.1 (a) Sin credenciales de nube

Herramientas disponibles en este computador: Docker, Terraform, `gcloud` (sin sesión), Java (emuladores). No hay `psql`/`pg_dump` locales: se usan desde contenedores (`postgres:17`).

| Frente | Qué | Archivos (dueño exclusivo) | Terminado cuando |
|---|---|---|---|
| **V7-0 Contratos** | Contratos ts-rest nuevos: `auth` (lo que no monta Better Auth: consentimientos, métodos, sesiones de la consola), `books`, `files`, `feedback`, `automations`, `ads` (eventos/consola), `gami` (escritura), `tax` (renta, titular del contador), `me` (perfil, preferencias, ajustes del libro), `search`, `platform` (aviso, integraciones públicas, AdSense), `test/qa` | `packages/contracts/src/modules/{auth,books,files,feedback,automations,ads,gami,tax,me,search,platform,test}.ts`, `packages/contracts/src/api.ts` | `pnpm --filter @mirai/contracts test` en verde; OpenAPI generado sin errores |
| **V7-A Auth propio** | Better Auth en la API (§3.1.2–3.1.4), `BetterAuthVerifier` en la cadena de `TokenVerifier`, `IdentityAdmin` sobre Better Auth, correos en español, Turnstile, `GipVerifier` opcional escrito | `apps/api/src/modules/auth/**`, `apps/api/src/core/auth/{better-auth.verifier.ts,chain.verifier.ts}`, `apps/api/src/modules/account/identity-admin.ts`, `apps/api/src/adapters/gcp/identity-platform.*`, `packages/services/src/mail/auth/**` | Spike que confirma `withSchema`, cambio de correo de dos pasos y TOTP; pruebas de integración con Postgres 17 en Docker: entrar con un hash bcrypt de Supabase, enlace mágico sin crear cuenta, Google con un OIDC simulado, TOTP (activar, entrar, código de respaldo), listar y cerrar sesiones, suspender, recuperar y cambiar correo; claims correctos en `request.jwt.claims` |
| **V7-B Web de auth** | Pantallas y sesión con `better-auth/react`, detrás de `AUTH_PROVIDER` en tiempo de ejecución; `proxy.ts` nuevo; borrar `utils/supabase/*` al final | `apps/web/{components/auth/**, app/(auth)/**, app/auth/**, proxy.ts, utils/**, lib/auth/**, features/account/**, features/settings/tabs/security.tsx, features/profile/profile-view.tsx, features/legal/**, components/app/app-sidebar.tsx}` | E2E `f18-cuenta`, login/registro/recuperar/TOTP en verde contra Docker Compose con `AUTH_PROVIDER=mirai`, y sin cambios con `supabase` |
| **V7-C Postgres destino** | `db/postgres/0000_compat.sql`, línea base desde un volcado de esquema (se genera en V7-C con una copia de esquema que entregue el dueño o con las migraciones aplicadas en Docker), `0002_cloud_overrides.sql`, `0003_auth_better.sql`; `packages/db` apunta a la carpeta nueva; `kysely-codegen` | `db/postgres/**`, `packages/db/**` (scripts), `scripts/db/**` | Docker `postgres:17`: compat + línea base + overrides aplican de cero; pruebas de RLS por tabla con `ROLE_MATRIX` en verde; diferencia de esquema vs "56 migraciones aplicadas" = solo lo esperado |
| **V7-D Puente PostgREST y alcances** | `PostgrestFactory` con JWT interno, `DB_ADAPTER=postgrest`, `SystemScope` con `service_role` en Kysely, tipo `Db` neutro en los paquetes | `apps/api/src/core/db/**`, `packages/services/src/runtime.ts`, `packages/ai/src/server/ctx.ts`, `infra/docker/postgrest/**` | Las pruebas de F2-D/F2-E/F2-F corren contra Postgres + PostgREST en Docker; `grep "SupabaseClient" packages apps/api/src` = 0 |
| **V7-E Archivos** | Puerto `ObjectStore` (gcs, s3, azure-blob), `FilesModule` y `FeedbackModule`, reglas de §3.4; `AiFiles`, `BackupStorage`, purga y contador usan el puerto | `apps/api/src/core/files/**`, `apps/api/src/modules/{files,feedback}/**`, `apps/api/src/adapters/{gcp,aws,azure}/object-store.*`, `apps/api/src/modules/{ai/adapters/supabase-js.ai-files.ts, import/backup-storage.ts, households/ports.ts}` | Pruebas con MinIO (s3) y con el emulador `fake-gcs-server` (gcs): firmar, subir, leer, borrar por prefijo, límites de tamaño y tipo, reglas por rol |
| **V7-F Colas, scheduler y secretos portables** | `PgQueue` + `MODE=worker`; `SchedulerGuard` con emisor OIDC configurable; regla de ESLint de §3.0; `.env.example` completo | `apps/api/src/core/{queue,auth/scheduler.guard.ts,config}/**`, `packages/config/eslint/**`, `apps/api/.env.example` | Pruebas: tick → tareas en `pg` sin duplicados con la misma `dedupe_key`; reintentos; OIDC de un emisor de prueba |
| **V7-G Endpoints faltantes** | E1–E15 y E17–E31 de §2 (sin auth) con adaptador Kysely cuando la tabla es nueva | `apps/api/src/modules/{books,automations,ads,gami,tax,admin,notifications,me,search,platform,billing,import,chat}/**` (cada uno puede ir a un agente distinto) | Pruebas de integración por endpoint (roles, plan, errores en español) con la base en memoria o Postgres en Docker |
| **V7-H1..H4 Web 100 % por la API** | Reemplazar cada `.from`/`.rpc`/`storage` de §1.3–§1.5 por el cliente de la API. Reparto por carpetas: H1 `features/{expenses,fixed,cards,goals,loans,balance,home,subscriptions,extras,investments,patrimonio}`; H2 `features/{settings,setup,catalogs,gami,profile,planning,agenda,renta,calculadoras,reports,contador}` + `lib/ref-data.ts`; H3 `features/{admin,ads,planes,landing,opiniones,ayuda,correo,automations,chat,notify}` + `components/app/{platform-notice,command-palette}.tsx`; H4 `features/{data,import,household}`, `components/mirai/avatar-picker.tsx`, `app/(onboarding)/**`, `components/app/actions.ts`, `lib/{dal,book-data}.ts`, `hooks/use-book-data.ts`, `features/book/**` | Las carpetas listadas | En su carpeta `grep -E '\.from\(|\.rpc\(|\.storage|utils/supabase|supabaseAdmin'` = 0; E2E de esas secciones en verde con todo por la API |
| **V7-I Tiempo real final** | Solo gateway; mismo origen; borrar `use-realtime.ts` y el canal del runner | `apps/web/hooks/{use-live,use-live-gateway,use-realtime}.ts`, `apps/web/features/automations/runner.tsx`, `apps/api/src/modules/realtime/**` (cookie en el *handshake*) | Prueba de dos pestañas en Docker Compose: cambio < 1 s, presencia y reconexión |
| **V7-J Scripts de migración** | `auth-from-supabase.ts`, `storage-copy.ts`, `rewrite-public-urls.sql`, `dump-restore.sh` (por secciones), `verify.ts` (conteos y sumas), `rollback-delta.ts` (§5.4) | `scripts/migrate/**` | Ensayo completo en Docker con una base "Supabase local" sembrada con datos sintéticos (usuarios con bcrypt, Google, TOTP, archivos): verify = 0 diferencias; la vuelta atrás reimporta usuarios nuevos |
| **V7-K Terraform GCP por capacidades** | Mover el stack a `capabilities/*/gcp` + `stacks/gcp` + `envs/gcp/*` sin cambiar recursos (con bloques `moved {}`); agregar postgrest, worker, rutas del mismo origen, secretos nuevos, Vertex, región variable; Supabase opcional | `infra/terraform/{capabilities/*/gcp, stacks/gcp, envs/gcp, modules}/**` | `terraform validate` + `test`; `plan` simulado de pruebas y producción **sin destrucciones** respecto al stack actual |
| **V7-L Terraform AWS** | `capabilities/*/aws`, `stacks/aws`, `envs/aws/{bootstrap,pruebas,produccion}` | `infra/terraform/{capabilities/*/aws, stacks/aws, envs/aws}/**` | `fmt`, `validate`, `terraform test` con proveedor simulado; prueba de contrato (mismas variables y salidas que GCP) |
| **V7-M Terraform Azure** | Igual para Azure | `infra/terraform/{capabilities/*/azure, stacks/azure, envs/azure}/**` | Igual |
| **V7-N GitHub Actions** | Flujos de §3.12; Docker Compose de CI | `.github/workflows/**`, `infra/compose/**` | `act` o un PR de prueba: `ci.yml` en verde; `deploy-*.yml` en modo seco |
| **V7-O Web sin Vercel** | `output: standalone`, `GIT_SHA`, configuración pública en tiempo de ejecución (D16), CSP nueva, sin Speed Insights, `site-url` neutro, `ads.txt` desde el endpoint público | `apps/web/{next.config.ts, lib/security/**, lib/site-url.ts, lib/public-config.ts, app/layout.tsx, app/ads.txt/**}`, `infra/docker/web.Dockerfile` | La misma imagen arranca en Docker con dos configuraciones distintas y muestra cada una; `f22-pwa` y `f23-landing` en verde |
| **V7-P IA sin Vercel** | Proveedor `vertex`, orden de respaldo, registro | `packages/ai/src/{model,models}.ts`, `packages/services/src/integrations/registry.ts` | Pruebas con `MockLanguageModel`; `ai_usage` registra `vertex` |
| **V7-Q Observabilidad portable** | Configuración del colector OTLP por nube (sidecar), paneles base | `infra/otel/**` | El colector local recibe trazas de la API en Docker Compose |
| **V7-R Limpieza** | Quitar `@supabase/*`, Server Actions migradas, `lib/supabase/admin.ts`, `app/api/*` retiradas, `vercel.json`; regla de ESLint que prohíbe `@supabase` en todo el repo (salvo `scripts/migrate`) | lo que quede, al final | `grep -r "@supabase" apps packages` = 0 (fuera de `scripts/migrate`); build y E2E completos en verde |

Orden sugerido: V7-0 → (V7-A, V7-C, V7-D, V7-E, V7-F, V7-K, V7-L, V7-M, V7-N, V7-O, V7-P en paralelo) → V7-B, V7-G → V7-H1..H4, V7-I → V7-J → V7-Q → V7-R.

### 4.2 (b) Con credenciales

| Frente | Qué | Necesita | Terminado cuando |
|---|---|---|---|
| **C1 Bootstrap GCP** | `envs/gcp/bootstrap`: proyectos, APIs, estado, Artifact Registry, WIF para GitHub | Ítems 2–5 de §6 | `terraform apply` sin errores; GitHub Actions entra por WIF |
| **C2 Ambiente de pruebas en GCP** | `envs/gcp/pruebas` completo **con su propia Cloud SQL** (resuelve la base compartida, riesgo R1 de F2-H) | C1, DNS (ítem 6) | `https://pruebas.mirai.engynex.com` sirve; certificado `ACTIVE` |
| **C3 Secretos** | Cargar valores en Secret Manager desde `.env.local` y Vercel sin imprimirlos (§6) | Ítems 7–8 | `gcloud secrets versions list` con versión en todos los obligatorios |
| **C4 Paso A en pruebas y producción** | Web y API en Cloud Run con Supabase detrás; E2E; corte DNS de la web (estrategia etapa 1); cron a Scheduler; archivos a GCS (`files` en `on`); encender los interruptores de F2-H hasta `on` | C1–C3, ítems 9–14 | 2 semanas estable; la web ya no llama a Supabase salvo `auth.*` |
| **C5 Ensayos del corte B** | Dos ensayos completos en pruebas con una copia de producción (datos reales en un proyecto de pruebas con acceso restringido, o datos anonimizados si el dueño lo prefiere — pregunta 8) | C2, ítem 8 | `verify` = 0 diferencias dos veces; tiempo medido; vuelta atrás ensayada |
| **C6 Corte B en producción** | §5 | Todo lo anterior + aprobación | Criterios de §5.3 |
| **C7 Integraciones** | URI de Google, webhooks de Mercado Pago y Wompi, Turnstile, Resend, Search Console, AdSense | Ítems 9–14 | Pago sandbox de punta a punta; correo de auth entregado; Google entra |
| **C8 Apagado** | §5.5 | — | Facturas de Vercel y Supabase en 0 |

---

## 5. Plan de corte

### 5.1 Paso A — sin ventana (todo detrás de interruptores)

1. Estrategia etapas 0–2: bootstrap, pruebas con Cloud SQL propia, web y API en Cloud Run (`us-west1`), corte DNS de la web, cron a Scheduler, archivos a GCS con `storage-copy` y `rewrite-public-urls` (idempotentes), webhooks a la API.
2. Encender los interruptores de F2-H en el orden de su §4 hasta `on` para todos, y los endpoints nuevos de V7-G con la web de V7-H (también detrás de interruptores).
3. Requisito para pasar al B: en producción, durante 7 días, **cero peticiones del navegador a `*.supabase.co`** salvo `/auth/v1/*` (se mide con la CSP en "solo reportar": `connect-src` sin Supabase y revisión de los reportes) y cero Server Actions con `.from(` (registro en el servidor).

### 5.2 Paso B — una ventana

**Cuándo**: domingo 1:00–3:00 a. m. (hora Colombia), la de menos uso; duración esperada = la del ensayo × 1,5 (con 90 MB, unos 45–60 min). Registro de cuentas nuevas en pausa desde 1 h antes.

**Comunicación a usuarios**
- **7 días antes**: correo a todas las cuentas + `aviso_global` en la app: "El domingo DD de MMM entre 1 y 3 a. m. actualizamos Mirai. Ese rato no vas a poder entrar. Después tendrás que **iniciar sesión otra vez una sola vez** con tu misma contraseña o con Google. Tus datos no cambian." Si no se pueden migrar los TOTP: "…y vas a volver a activar la verificación en dos pasos."
- **24 h antes**: recordatorio en la app.
- **Durante**: página de mantenimiento (la sirve la web por `platform_settings.mantenimiento` o, si la base no responde, una página estática en el balanceador).
- **Después**: aviso "Ya volvimos" en la app y en el correo de resumen del día.

**Orden** (cada paso con su comprobación; si una falla y no se arregla en 15 min → vuelta atrás §5.4):

| # | Paso | Comprobación |
|---|---|---|
| 0 | T-60 min: congelar despliegues; registro en pausa; último ensayo de `verify` en pruebas OK | — |
| 1 | `mantenimiento = true` (la API responde 503 a escrituras; la web muestra el aviso); pausar Scheduler y colas | Ninguna escritura nueva en Supabase durante 2 min (`max(updated_at)` estable) |
| 2 | En Supabase: revocar escritura al rol `authenticated` y `service_role` de la app (o pausar el proyecto en solo lectura) | Una escritura de prueba falla |
| 3 | Volcado final (`pg_dump -Fc` de `public` + exportación de `auth`) desde una VM en la VPC (o el trabajo `db-migrate`) | Archivo con tamaño esperado; sumas de control guardadas |
| 4 | Restaurar en Cloud SQL de producción según §3.7 (compat → auth → pre-data → usuarios → data → post-data → secuencias → live_notify) | Sin errores |
| 5 | `verify.ts` Supabase vs Cloud SQL | **0 diferencias** en conteos y sumas |
| 6 | Pasada final de `storage-copy` (diferencias) | Conteo y MD5 iguales |
| 7 | Configuración: `DB_ADAPTER=pg|postgrest` (por módulo), `AUTH_PROVIDER=mirai`, gateway encendido, `mantenimiento` sigue en `true` | Revisiones nuevas sanas (`/readyz`) |
| 8 | Humo con cuentas de prueba: entrar con clave (hash importado), con Google, con TOTP; `/v1/me` de 3 roles; CRUD de categoría; pago de un fijo; campana; contador por token; cambio en vivo entre dos pestañas; subir y ver un adjunto; webhook de Wompi sandbox contra producción en modo prueba (o reenviar una notificación vieja: `apply_plan_payment` es idempotente) | Todo verde |
| 9 | E2E corta (login, Inicio, gastos, fijos, tarjetas, hogar, cuenta) contra producción con el usuario QA | Verde |
| 10 | Quitar `mantenimiento`; reanudar Scheduler y colas; abrir registro | 5xx < 0,5 % y p95 normal 30 min |
| 11 | Monitorear 2 h: errores de auth, 401 inesperados, colas, `notification_log` sin duplicados | — |

### 5.3 Terminado

30 min después de reabrir: 5xx < 0,5 %; tasa de inicios de sesión exitosos ≥ 99 % de la habitual en 72 h; ningún correo de auth rebotado; p95 de `/v1/me` ≤ el de antes; `pg_notify` → gateway < 1 s; copias y PITR de Cloud SQL activos y una restauración de prueba hecha en la semana siguiente.

### 5.4 Vuelta atrás

- **Antes de reabrir escrituras (paso 10)**: volver la configuración (`DB_ADAPTER=supabase`, `AUTH_PROVIDER=supabase`, `LIVE_SOURCE=supabase`, que son de tiempo de ejecución por D16 y §3.1.5), devolver la escritura en Supabase (paso 2 al revés), quitar el mantenimiento. Supabase no recibió nada nuevo. Las sesiones de Supabase siguen vivas (nadie tuvo que volver a entrar).
- **Después de reabrir** (hasta 72 h): `rollback-delta.ts` copia a Supabase lo que cambió desde el corte (todas las tablas tienen `updated_at` por `trg_touch`; los borrados son lógicos) y crea en Supabase Auth las cuentas nuevas con su hash bcrypt (la API de administración de GoTrue acepta `password_hash`). Se ensaya en C5. Pasadas 72 h, la vuelta atrás deja de ser razonable: se corrige hacia adelante.
- Supabase queda **intacto y en solo lectura 30 días**.

### 5.5 Qué se apaga en Vercel y Supabase, y cuándo

| Cuándo | Vercel | Supabase |
|---|---|---|
| Paso A, corte DNS + 4 semanas estable | Quitar dominios `mirai.engynex.com` del proyecto; borrar `crons`; dejar el último despliegue como respaldo | — |
| Paso A completo | Borrar variables con secretos del proyecto (`SUPABASE_SECRET_KEY`, `ENCRYPTION_KEY`, pasarelas, `CRON_SECRET`…) | Quitar el job `mirai-notify` (ya hecho en el paso A) |
| Corte B + 30 días | **Borrar el proyecto**; revocar `VERCEL_TOKEN`; si el plan es Pro, bajarlo a Hobby o cancelarlo al cierre del ciclo de facturación siguiente | Exportación final (`pg_dump` completo de `public` y `auth` + copia de Storage) cifrada en el bucket `backups` de GCP con retención de 1 año (Ley 1581: solo lo necesario; se borra después); **pausar** el proyecto |
| Corte B + 60 días | Cancelar el plan de AI Gateway si se reemplazó (D13) | **Borrar el proyecto**; revocar `SUPABASE_ACCESS_TOKEN` y la clave secreta; cancelar el plan (Pro → Free o eliminar organización) al cierre del ciclo; quitar de Google OAuth la URI `https://<ref>.supabase.co/auth/v1/callback` y de Terraform los secretos `supabase-*` |

---

## 6. Lo que necesito del dueño (en el orden en que conviene pedirlo)

Regla para todo: **nunca pegues una clave en el chat**. Lo preferido es que inicies sesión en este computador (`gcloud auth login`), que me des un rol en la consola, o que yo lea un archivo local sin imprimirlo y lo cargue directo en Secret Manager. Donde diga "yo lo hago con tu permiso", basta con que respondas "sí".

| # | Qué | Por qué | Dónde y cómo (pasos) | Forma segura de entregarlo |
|---|---|---|---|---|
| 1 | **Aprobar decisiones** D1 (Better Auth), D4 (puente PostgREST), D11 (dos pasos), D12 (región `us-east1` o `us-west1`), D13 (Vertex AI o seguir con AI Gateway), D16 (una imagen), ventana del corte B y texto del aviso a usuarios | Cambian el código que se escribe primero | Este documento, §0.1 y §5.2 | Respuesta en el chat |
| 2 | **Cuenta de facturación de GCP** (ID `XXXXXX-XXXXXX-XXXXXX`, moneda) y presupuesto mensual aprobado por ambiente | Vincular proyectos y crear alertas de presupuesto | console.cloud.google.com › **Facturación** › Administrar cuentas de facturación › copia el "ID de la cuenta de facturación". Si no hay: Facturación › Crear cuenta (tarjeta a nombre de Engynex). Luego Facturación › tu cuenta › **Administración de cuentas** › Agregar principal › tu correo de trabajo con rol **Usuario de la cuenta de facturación** (y **Administrador de costos de facturación**) | ID por chat (no es secreto) |
| 3 | **Organización de GCP** de `engynex.com` (ID) o confirmación de que no hay | Carpetas, políticas y la excepción del bucket público | console.cloud.google.com › selector de proyectos (arriba) › pestaña **Todo** › la fila con ícono de edificio = organización; su ID en **IAM y administración › Configuración**. Si no existe: admin.google.com (si engynex.com usa Google Workspace) o Cloud Identity Free (cloud.google.com/identity › Registrarse con el dominio; verificación por TXT en Hostinger) | ID por chat |
| 4 | **Iniciar sesión en este computador** con una cuenta con permisos | Que yo aplique Terraform sin llaves JSON | En la terminal: `gcloud auth login` y `gcloud auth application-default login` (abre el navegador; entras con tu cuenta). Antes, en la consola: **IAM y administración › IAM** de la organización (o de una carpeta "Mirai") › Otorgar acceso › tu cuenta con **Creador de proyectos** + **Usuario de la cuenta de facturación**; después del bootstrap, **Propietario temporal** en los 3 proyectos (lo retiro al terminar, runbook §1.5) | Sesión local (las credenciales quedan en `~/.config/gcloud`, no en el repo) |
| 5 | **GitHub**: dueño/nombre e ID numérico del repositorio; crear entornos `pruebas` y `produccion` (este con revisores obligatorios); permiso para agregar `.github/workflows` | CI/CD con OIDC sin llaves | github.com › repositorio › **Settings › Environments › New environment** › `produccion` › "Required reviewers" (tú). El ID: `gh api repos/<dueño>/<repo> --jq .id` (lo saco yo con `gh` si ya tienes sesión). Si se usa Cloud Build como alternativa: Settings › GitHub Apps › instalar **Google Cloud Build** solo en este repo | Por chat (no son secretos) |
| 6 | **DNS de `engynex.com` en Hostinger** | Certificados (`_acme-challenge`), registros A/CNAME de `pruebas.`, `api.`, `files.`, `canary.`; bajar TTL a 300 s 48 h antes de cada corte; SPF/DKIM/DMARC de Resend | Ya hay un `HOSTINGER_API_TOKEN` en `.env.local`: **dime si lo puedo usar** solo para registros bajo `mirai.engynex.com` (te muestro el plan de cambios antes de aplicar). Si prefieres a mano: hpanel.hostinger.com › **Dominios › engynex.com › DNS / Nameservers › Administrar registros DNS** › Agregar registro (tipo, nombre **sin** `.engynex.com`, valor, TTL 300) | Permiso por chat; el token se queda en `.env.local` |
| 7 | **Leer las variables de Vercel** (las pasarelas y los secretos que no están en `.env.local`: `MERCADOPAGO_*`, `WOMPI_*`, `UPSTASH_*`, Turnstile, Sentry, AdSense…) | Cargarlas en Secret Manager **idénticas** (sobre todo `ENCRYPTION_KEY` y `CRON_SECRET`) | Hay un `VERCEL_TOKEN` en `.env.local`: con tu permiso corro `vercel env pull` de cada ambiente a un archivo temporal en el scratchpad (permisos 600), cargo cada valor con `gcloud secrets versions add --data-file=-` sin imprimirlo y borro el archivo. A mano: vercel.com › proyecto › **Settings › Environment Variables** | Permiso por chat |
| 8 | **Exportar datos de Supabase** para los ensayos y el corte: permiso para usar `SUPABASE_DB_URL` (ya en `.env.local`) con `pg_dump` de solo lectura desde un contenedor, y para leer `auth.users`, `auth.identities` y `auth.mfa_factors`. Decidir si los ensayos usan **datos reales** (en el proyecto de pruebas, con acceso solo tuyo y mío, borrados al terminar) o **anonimizados** | Ensayos fieles y la importación de usuarios con sus hashes | supabase.com › proyecto › **Project Settings › Database** (confirmar que la cadena es la conexión directa o el *session pooler*, puerto 5432) y **Settings › Billing** (plan: Free/Pro; si es Pro, hay copias diarias que conviene descargar antes) | Permiso por chat; los volcados quedan cifrados en el scratchpad o en GCS, nunca en el repo |
| 9 | **SMTP actual de Supabase Auth** (¿usa Resend?) | Los correos de auth pasan a la API | supabase.com › proyecto › **Authentication › Emails › SMTP Settings**: dime el proveedor y el remitente (no la clave) | Por chat |
| 10 | **Google Cloud del cliente OAuth actual** (el de "Entrar con Google" y el de Gmail/Calendar): acceso de **Editor** al proyecto donde vive, o que agregues tú las URI | Nuevas URI de redirección | console.cloud.google.com › (proyecto del cliente) › **APIs y servicios › Credenciales** › el cliente OAuth web › **URI de redirección autorizados** › agregar `https://mirai.engynex.com/api/auth/callback/google`, `https://pruebas.mirai.engynex.com/api/auth/callback/google`, `https://api.mirai.engynex.com/v1/google/callback`, `https://api.pruebas.mirai.engynex.com/v1/google/callback`; **Orígenes de JavaScript** `https://mirai.engynex.com`, `https://pruebas.mirai.engynex.com`. En **Pantalla de consentimiento › Dominios autorizados** confirmar `engynex.com`. `GOOGLE_CLIENT_SECRET` ya está en `.env.local` | Rol IAM o lo haces tú y me avisas |
| 11 | **Resend**: dominio `mirai.engynex.com` verificado | Correos de auth propios | resend.com › **Domains** › Add domain › `mirai.engynex.com` › copia los registros (MX/TXT SPF, DKIM, DMARC) a Hostinger (o lo hago yo con el ítem 6). La clave de Resend ya está cifrada en `platform_integrations`: no hace falta entregarla | Nada secreto |
| 12 | **Cloudflare Turnstile**: agregar dominios y darme la clave secreta | La verificación pasa de Supabase a la API | dash.cloudflare.com › **Turnstile** › el sitio de Mirai › Settings › **Hostname management** › agregar `pruebas.mirai.engynex.com` y `localhost`. La **Secret key** del mismo sitio: cárgala tú con `read -rsp` + `gcloud secrets versions add mirai-produccion-turnstile-secret --data-file=-` (runbook §2.3) o pégala en `.env.local` como `TURNSTILE_SECRET_KEY` y yo la cargo sin imprimirla | Secret Manager / `.env.local` |
| 13 | **Mercado Pago**: cambiar la URL de webhooks (en el momento del paso A que te indique) | Webhooks directo a la API | mercadopago.com.co/developers › **Tus integraciones** › la aplicación de Mirai › **Webhooks › Configurar notificaciones** › modo prueba y modo productivo › URL `https://api.pruebas.mirai.engynex.com/v1/webhooks/mercadopago` / `https://api.mirai.engynex.com/v1/webhooks/mercadopago`, eventos de pagos y suscripciones. **No regeneres** la clave secreta (si la regeneras, avísame para cargar la nueva antes) | Lo haces tú cuando te avise |
| 14 | **Wompi**: URL de eventos | Igual | comercios.wompi.co › **Desarrolladores** › **URL de eventos** (sandbox y producción por separado) → `https://api.pruebas.mirai.engynex.com/v1/webhooks/wompi` y `https://api.mirai.engynex.com/v1/webhooks/wompi` | Lo haces tú cuando te avise |
| 15 | **Meta / WhatsApp**: confirmar si alguna plantilla usa una imagen guardada en Supabase y si Meta exige IP fija | Re-guardar la plantilla con la URL nueva | business.facebook.com › **Administrador de WhatsApp › Plantillas de mensajes** | Por chat |
| 16 | **Google Search Console** y **AdSense** | No perder la verificación ni el `ads.txt` | search.google.com/search-console › propiedad de Mirai › **Configuración › Verificación de la propiedad**: si es "Archivo HTML" o "Etiqueta HTML", agrega una **propiedad de dominio** (`engynex.com` o `mirai.engynex.com`) verificada por **TXT** en Hostinger. AdSense: adsense.google.com › **Sitios** › revisar `ads.txt` 48 h después del corte DNS | Por chat |
| 17 | **Vertex AI** (si apruebas D13) | Proveedor de IA sin llave | Lo habilito yo con Terraform (`aiplatform.googleapis.com`); solo confirma que se puede facturar el uso de Gemini a la cuenta del ítem 2 | Por chat |
| 18 | **Correos de alertas** y quién responde a incidentes; canal adicional (Slack/SMS) si lo quieres | Monitoreo | — | Por chat |
| 19 | **AWS y Azure** (solo si algún día se usan): nada ahora. Terraform queda validado sin cuentas | Portabilidad | — | — |

---

## 7. Riesgos y decisiones abiertas

| Riesgo | Mitigación |
|---|---|
| Auth propio: un error de seguridad es nuestro | Better Auth (no criptografía propia), versión fija y actualizaciones revisadas, batería de pruebas de V7-A, límites por IP y por cuenta, WAF delante, auditoría (`account_events`, `admin_audit`), revisión de seguridad (`/security-review`) antes del corte |
| `cloudsqlsuperuser` no puede dar `BYPASSRLS` | Plan B de §3.2 (`service_role` dueño); se decide en el primer ensayo |
| Adaptador Kysely de Better Auth sin `withSchema` o sin cambio de correo de dos pasos | Spike de V7-A antes de escribir pantallas; alternativas descritas en §3.1.2 y §3.1.4 |
| TOTP no migrable (secreto cifrado en Supabase) | Re-enrolamiento obligatorio al primer ingreso, avisado 7 días antes |
| Todos vuelven a iniciar sesión | Aviso previo; claves y Google siguen sirviendo; la PWA muestra el login sin perder datos locales |
| El navegador sigue hablando con Supabase después del corte | Requisito duro de §5.1 (7 días con cero peticiones medido con la CSP) |
| Cambio de región el mismo día del corte B (D12) | Los servicios no tienen estado; se ensaya en pruebas; alternativa: quedarse en `us-west1` |
| Base compartida pruebas = producción hasta C2 | C2 crea Cloud SQL de pruebas; hasta entonces nada de V7 se enciende en `pruebas` contra Supabase |
| PostgREST como pieza extra | Interno, imagen oficial fija, salud y alertas; se retira cuando todo sea Kysely (no bloquea) |
| Imagen web única (D16) cambia cómo se leen los `NEXT_PUBLIC_*` | V7-O con prueba de dos configuraciones; mientras tanto se puede compilar por ambiente como hoy |
| Terraform de AWS y Azure sin aplicar nunca | Pruebas de contrato y `terraform test` en CI; un ensayo real en una cuenta de prueba cuando el dueño lo pida |
| Costos | Estrategia §13 (≈ USD 465–605/mes en GCP con HA) menos Vercel y Supabase; PostgREST y worker suman ~USD 15–25; revisar con la calculadora antes de C1 |
