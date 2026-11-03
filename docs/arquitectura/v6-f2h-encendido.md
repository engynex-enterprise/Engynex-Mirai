# v6 F2-H: encender la API por partes y apagarla de emergencia

> Procedimiento para pasar la web (`apps/web`) a la API (`apps/api`) módulo por módulo, sin cambiar la versión publicada.
> Diseño y plan en `docs/arquitectura/v6-separacion-front-back.md` (§3, §4 y §8 › F2-H). Escrito el 2026-11-02 en la rama `v6`.
> Con todo apagado (lo normal y lo que hay hoy en producción y pruebas) la web hace **exactamente lo de siempre**:
> Supabase directo, Server Actions y Route Handlers de Next. Ni siquiera se carga el cliente de la API.

## 1. Cómo funciona

Hay **dos llaves** y las dos tienen que estar encendidas para que algo vaya por la API:

| Llave | Dónde | Valores | Efecto |
|---|---|---|---|
| **Variables de entorno** | Vercel (o `.env.local`), se leen al correr: no hace falta recompilar para cambiarlas | `MIRAI_API_URL` = origen de la API (también sirve `NEXT_PUBLIC_API_URL`). `MIRAI_API_ROLLOUT` = `off` (por defecto) \| `db` \| `all` \| `{…}` | `off` o sin URL: todo apagado y **sin leer la base**. `db`: manda `platform_settings.api_rollout`. `all`: todo encendido para todos (E2E y local; se ignora en producción de Vercel). `{…}`: un objeto literal (pruebas locales) |
| **`platform_settings.api_rollout`** (jsonb) | La base (migración `20261103003801_api_rollout.sql`, **escrita, sin aplicar**) | Por módulo: `off` \| `qa` \| `admins` \| `pct:N` \| `on`. `_users`: personas del modo `qa`. `_off: true`: apaga todo | Lo lee el servidor de Next con caché de 30 s por instancia (`apps/web/lib/api/rollout.ts`). Si la columna no existe o falla la lectura: todo apagado |

- `qa`: solo las personas de `_users` (el usuario QA de las E2E). `admins`: solo administradores de la plataforma. `pct:N`: el N % de las personas, siempre las mismas (hash estable de módulo + persona; subir el porcentaje nunca saca a quien ya estaba). `on`: todas.
- **Clave de detalle**: `módulo:detalle` gana sobre `módulo`. Hoy se usa en el CRUD del libro: `"book-tables": "on", "book-tables:expenses": "off"`.
- Rutas sin persona (webhooks de pagos, portal del contador): solo cuenta `on`.
- El servidor resuelve los interruptores en `getAppContext()` y se los pasa al navegador en `AppContext.api` (`{ url, flags }`). Los hooks usan `useViaApi(módulo)`; las funciones que no son hooks, `apiOn(módulo)` (`apps/web/lib/api/session.ts`).
- **Lecturas** con respaldo: si la API no responde (red o 5xx) se lee de Supabase o con la Server Action como siempre. **Escrituras** sin respaldo: nunca se repiten por otro camino (para no duplicarlas). Todas llevan `Idempotency-Key`; el fetcher reintenta una vez con la misma llave solo si no hubo respuesta o la API dio 503.

## 2. Interruptores

| Interruptor | Qué pasa a la API | Dónde (web) | Queda directo o en Next |
|---|---|---|---|
| `me` | `getAppContext()` → `GET /v1/me` (con el libro de la cookie). Sin hogar → `/bienvenida`. Si falla, la base | `lib/dal.ts` (la ruta de la base ahora usa `buildAppContext` de `@mirai/domain`, la misma regla de la API) | El modo `admins` no aplica a `me` (se decide antes de saber si es admin) |
| `book-tables` (`book-tables:<tabla>`) | `useList` / `useSave` / `useSoftDelete` → `GET/PUT/DELETE /v1/books/:b/t/:tabla[/:id]` y `POST …/restore` | `hooks/use-book-data.ts`, `lib/api/book-tables.ts` | Tablas fuera del CRUD genérico (`chat_*`, `automation_runs`, `monthly_summaries`) y `select` con relaciones embebidas siguen con Supabase |
| `snapshot` | `useBookData` / `prefetchBookData` (Inicio, Balance, Dashboard, Flujo, Agenda…) → `GET /v1/books/:b/snapshot?parts=` (las partes que se piden juntas van en **una** petición) | `features/book/use-book-data.ts` | Los cálculos de las vistas **se quedan en el cliente** (decisión D3): los endpoints `views/*` de F2-C son para el chat, los avisos, el contador y clientes nativos |
| `expenses` | `use_emergency_fund`, `link_expense_fixed`, `unlink_expense_fixed` → comandos | `features/expenses/commands.ts` | — |
| `fixed` | `pay_fixed_expense` ×2, `unpay_fixed_expense`, `pay_subscription` → comandos | `features/fixed/commands.ts` | Pagos con periodo `prev-…` o valor ≤ 0 siguen por la RPC (el comando no da lo mismo) |
| `cards` | `add_card_purchase` ×3, `pay_credit_card` ×2 → comandos | `features/cards/commands.ts` | Compras con `p_medio`, > 48 cuotas o descripción vacía/larga siguen por la RPC |
| `savings` | `goal_contribute`, `fund_save`, `fund_use` → comandos | `features/goals/commands.ts` | — |
| `assets` | `asset_cuadrar` → `assets.reconcile` | `features/balance/commands.ts` | — |
| `importer` | Exportar JSON y crear copia de seguridad | `features/data/api.ts` | Restaurar, URL y borrado de copias, `formatBlocks`, `exportMyData`, `deleteAccount`, importar v4 y libro de ejemplo |
| `bell` | Campana: listar, marcar uno y marcar todo | `features/notify/bell.ts` | — |
| `notify` | 9 de 10 acciones de avisos + suscripciones push | `features/notify/api.ts`, `push-client.ts` | `logroNotifs` (sin endpoint); reglas de aviso (`notification_rules`, directo desde Ajustes › Alertas) |
| `integrations` | Guardar, prender, borrar, probar y listar modelos | `features/integrations/api.ts` | — |
| `google` | Leer correos, desconectar, sincronizar Calendar, estado y **conectar** (`connect-url` de la API en vez de `/api/google/connect`) | `features/correo/api.ts` | Hay que registrar `<API>/v1/google/callback` en Google Cloud antes de encenderlo |
| `ai` | Las 10 de `features/ai/actions.ts`, resumen del mes y uso de IA | `features/{ai,reports,ia-uso}/api.ts` | — |
| `chat` | Streaming NDJSON (`POST /v1/books/:b/chat/messages`), hilos (leer, renombrar, fijar, archivar, borrar, deshacer), mensajes, sugerencias, propuestas, adjuntos, título, duplicar, detalles | `features/chat/{store,hooks,api}.ts`, `lib/api/chat.ts` | Calificar un mensaje, buscar en las conversaciones y el conteo de hilos de logros |
| `households` | Personas, invitaciones, roles, familia, pasar el hogar, renombrar | `features/household/api.ts` | `createHousehold` (bienvenida: cookies `mirai-book` y `mirai_ref`) y aceptar invitación (página sin shell) siguen en Next |
| `account` | Cuenta, cambio de correo, métodos, sesiones, transferencias, salir y borrar hogar | `features/account/api.ts` | La cookie `mirai-book` puede quedar vieja al salir/borrar el hogar activo (el servidor cae al libro predeterminado) |
| `billing` | Opciones de pago, cupón, checkout y renovación | `features/planes/api.ts` | RPC `household_subscription` (sin endpoint) |
| `admin` | 30 de las acciones de la consola + Uso de IA | `features/admin/{api,ia-api}.ts` | Integraciones globales y envío de prueba (sin endpoint), WhatsApp de la consola |
| `accountant` | Abrir el portal del contador (en el servidor, solo `on`) | `features/contador/api.ts` | Notas y archivos del portal; accesos del titular (sin endpoint) |
| `gami` | Referidos | `features/referidos/api.ts` | Logros (lectura/escritura directa) |
| `webhooks` | `/api/pagos/{mercadopago,wompi}` reenvían el cuerpo crudo, la consulta y los encabezados de la firma a `/v1/webhooks/*` (solo `on`). Si la API no responde: 502 y la pasarela reintenta (no se procesa también en Next) | `lib/api/webhook-proxy.ts` | — |
| *(tiempo real)* | Gateway socket.io de F2-G | `hooks/use-live.ts` | Es de compilación: `NEXT_PUBLIC_LIVE_SOURCE=gateway` + `NEXT_PUBLIC_REALTIME_URL`. Solo con Cloud SQL (fase 4) |

La CSP suma el origen de la API (`MIRAI_API_URL`) y del gateway (`NEXT_PUBLIC_REALTIME_URL`, `https` + `wss`) en `connect-src`. Las cabeceras se calculan **al compilar** (`next.config.ts`): si se cambia `MIRAI_API_URL`, hay que volver a desplegar para que la CSP lo incluya (hoy la CSP completa está en "solo reportar" y `connect-src` ya permite `https:`, así que nada se bloquea).

## 3. Antes de encender algo (una sola vez)

1. **Base de pruebas separada** de la de producción (`docs/DEPLOY-VERCEL.md` › "Separar la base de datos de pruebas"; riesgo R1). Mientras sea la misma, encender en `pruebas` también escribe en producción.
2. Aplicar las migraciones aditivas `20261103003800_api_idempotency.sql` y `20261103003801_api_rollout.sql` (`pnpm db:migrate`; lo decide el dueño del producto). Sin la columna, todo queda apagado.
3. API desplegada (`mirai-api-pruebas`, luego `mirai-api`) con `WEB_ORIGINS` = el origen de la web (`https://engynex-mirai-pruebas.vercel.app` / `https://mirai.engynex.com`), `IDEMPOTENCY_STORE=supabase` y `/readyz` en verde.
4. En Vercel (entorno del despliegue): `MIRAI_API_URL=https://api-pruebas.mirai.engynex.com` y `MIRAI_API_ROLLOUT=db`, y volver a desplegar (para la CSP). Con `api_rollout` vacío nada cambia todavía.

## 4. Encendido gradual (por módulo)

Orden recomendado (§4.3, de menor a mayor riesgo): `me` → `gami`, `bell`, `ai` (lecturas) → `book-tables:<catálogos>` (`categories`, `income_categories`, `entities`, `payment_methods`, `keyword_rules`, `contacts`, `providers`, `wishlist`) → `snapshot` → `ai` → `notify`, `integrations`, `google` → `book-tables` completo + `expenses`, `fixed`, `cards`, `savings`, `assets`, `importer` → `chat` → `households`, `account`, `accountant` → `billing` → `webhooks` → `admin`.

Para cada módulo:

```sql
-- 0. El usuario QA (y quien pruebe) en la lista del modo "qa" (una vez).
update public.platform_settings
   set api_rollout = jsonb_set(api_rollout, '{_users}', to_jsonb(array(select id::text from auth.users where email in ('qa.e2e@mirai.test'))))
 where id = true;

-- 1. Solo QA → correr la batería api-on contra pruebas (§6) y revisar capturas y Cloud Logging.
update public.platform_settings set api_rollout = api_rollout || '{"snapshot":"qa"}' where id = true;
-- 2. Administradores de la plataforma, 3 días.
update public.platform_settings set api_rollout = api_rollout || '{"snapshot":"admins"}' where id = true;
-- 3. Un porcentaje, subiendo: 10 → 50 (siempre las mismas personas; subir no saca a nadie).
update public.platform_settings set api_rollout = api_rollout || '{"snapshot":"pct:10"}' where id = true;
-- 4. Todos.
update public.platform_settings set api_rollout = api_rollout || '{"snapshot":"on"}' where id = true;
```

- El cambio llega en ≤ 30 s (caché del servidor) y en la siguiente navegación de cada persona (el shell vuelve a leer `getAppContext`).
- Pasar al siguiente paso cuando: E2E `api-on` en verde para ese módulo, sin aumento de errores en Sentry ni de 5xx en Cloud Logging (filtra por `httpRequest.userAgent`/`X-Mirai-Client: web@<build>` y `requestId`), y los números iguales a los de siempre (en las lecturas, comparar con la persona en `off`).
- Las Server Actions y Route Handlers **no se borran** hasta que el módulo lleve 2 semanas en `on` sin incidentes.

## 5. Apagado de emergencia

De más rápido a más lento:

1. **Todo, sin desplegar (≤ 30 s):** `update public.platform_settings set api_rollout = api_rollout || '{"_off":true}' where id = true;` Volver: `api_rollout - '_off'`.
2. **Un módulo:** `api_rollout || '{"chat":"off"}'`.
3. **Si la base no responde o no se puede escribir:** `MIRAI_API_ROLLOUT=off` (o quitar `MIRAI_API_URL`) en Vercel y volver a desplegar (Vercel aplica variables solo en despliegues nuevos; con *Instant Rollback* al despliegue anterior también sirve).
4. **Webhooks de pagos:** con `webhooks` en `off` las rutas `/api/pagos/*` vuelven a procesar en Next. Lo que la API haya aplicado ya está en `plan_payments` (`apply_plan_payment` es idempotente: una notificación repetida no se aplica dos veces).

Qué pasa con lo que estaba en curso: las lecturas vuelven solas a Supabase; una escritura que ya salió hacia la API se termina en la API (con su `Idempotency-Key`); el chat en curso termina o se corta y la persona puede volver a enviar.

## 6. Pruebas E2E en dos modos

Las mismas 44 specs (escritorio 1366 px y móvil 400 px) corren en dos modos con la variable `E2E_API` (`apps/web/playwright.config.ts`). **No se corrieron** en F2-H (la base compartida está saturada).

```bash
# api-off: lo de hoy (puerto 3100)
pnpm --filter web test:e2e

# api-on local: compila la API y la web con el origen de la API (para la CSP), luego corre todo por la API (puerto 3101).
pnpm --filter api build && MIRAI_API_URL=http://localhost:8080 pnpm --filter web build
E2E_API=on pnpm --filter web test:e2e                 # levanta la API en :8080 (WEB_ORIGINS=http://localhost:3101) y
                                                      # `next start` con MIRAI_API_ROLLOUT=all
E2E_API=on E2E_API_URL=https://api-pruebas… pnpm --filter web test:e2e   # contra una API ya desplegada

# Contra el despliegue de pruebas: el modo lo decide el despliegue (MIRAI_API_ROLLOUT=db + QA en _users y módulos en "qa").
E2E_BASE_URL=https://engynex-mirai-pruebas.vercel.app E2E_API=on pnpm --filter web test:e2e
```

- `tests/e2e/f24-api-modo.spec.ts` confirma el modo: en `api-on` Inicio pide el libro a la API (`/snapshot`) y anota lo que todavía va directo a Supabase; en `api-off` ninguna petición sale hacia la API.
- Las capturas de `api-on` se guardan aparte (`tests/.out/<nombre>-<proyecto>-api.png`) para compararlas con las de `api-off`.
- Pruebas unitarias (corren con `pnpm test`): `apps/web/lib/api/{client,rollout}.test.ts` (errores, fetcher, reintentos, unwrap, CRUD, interruptores, caché, `_off`, `pct`), `packages/contracts/src/contracts.test.ts` (modos) y `features/*/api.test.ts`, `features/book/commands.test.ts`, `features/notify/bell.test.ts` (apagado = acción/RPC con los mismos argumentos; encendido = API y errores en español).

## 7. Qué falta para apagar el backend de Next por completo (paso 12)

1. **Endpoints que no existen en la API** (la web los sigue haciendo en Next): bienvenida (`createHousehold` con cookies), aceptar invitación del lado del servidor, `switchBook`/`createBook` (cookie del libro activo; `createBook` necesita `POST /v1/books`), copias (URL, restaurar, borrar), restaurar JSON, importar v4 y libro de ejemplo, `formatBlocks`, `exportMyData`, `deleteAccount` (F2-I lo exportó como `BookDumpService`), `logroNotifs`, reglas de aviso por la API desde Ajustes, accesos del titular del contador, integraciones globales y envío de prueba de la consola, WhatsApp de la consola, automatizaciones (CRUD, `test`, `defaults` y el runner del navegador → interruptor `automations_server_only`), `household_subscription`, `ads` (eventos y AdSense), `feedback` y `files` (subidas firmadas: avatares, adjuntos, anuncios, opiniones).
2. **Lecturas y escrituras directas a Supabase** fuera del CRUD genérico (§1.6: `profiles`, `book_settings`, `user_preferences`, `notification_rules`, `gami_*`, `plans`, `coupons`, `ads`, `ad_campaigns`, `platform_settings`, `feedback`, `audit_log`, `ref_*`…): cada una necesita su endpoint o pasar por `book-tables`.
3. **Cron**: `app/api/cron/notify` y `pg_cron` → Cloud Scheduler (§4.3 paso 9, con simulación comparada).
4. **Google**: registrar el callback de la API y retirar `app/api/google/*`.
5. **Pagos**: cambiar la URL de los webhooks en Mercado Pago y Wompi a la API y retirar el proxy.
6. **Limpieza (F2-H-9)**: borrar las Server Actions migradas después de 2 semanas en `on`, quitar `lib/supabase/admin.ts`, `lib/crypto.ts` y las librerías de servidor, regla de ESLint que prohíba `server-only`, `supabaseAdmin` y `.from(` en `apps/web`, y quitar de Vercel `SUPABASE_SECRET_KEY`, `ENCRYPTION_KEY` y los demás secretos de negocio.
7. **Fase 4**: Cloud SQL + gateway de tiempo real (`NEXT_PUBLIC_LIVE_SOURCE=gateway`) + Storage en GCS; `supabase.auth.*` queda en el navegador hasta Identity Platform.
