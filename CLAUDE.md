# CLAUDE.md — Mirai

> **IDIOMA OBLIGATORIO: responde SIEMPRE en español de Colombia (tuteo)** — mensajes al dueño del producto, avances entre pasos, resúmenes finales, preguntas y descripciones de comandos. Esto aplica a Claude Code, subagentes y cualquier agente. Solo el código (nombres de variables, APIs) puede ir en inglés.

> Punto de entrada para Claude Code y cualquier agente. Reglas de dominio en `.agents/rules/`.
> **Estado: v7 (Next.js + shadcn como front; API NestJS con login propio sobre Postgres). Todas las secciones de la v4.0 (en `legacy/`) están migradas.**
> **Monorepo:** pnpm workspaces + Turborepo. La web Next está en `apps/web` y habla SOLO con la API (`apps/api`, NestJS + Better Auth); la lógica pura en `packages/domain`; tipos de la base en `packages/db`; contratos compartidos en `packages/contracts`; el código de servidor compartido en `packages/services` y `packages/ai`. Plan: `docs/arquitectura/v6-separacion-front-back.md`.
> Diseño aprobado: `docs/superpowers/specs/2026-10-31-migracion-nextjs-design.md`. Lista de control funcional: `docs/migracion/inventario-1…5.md` (nada de la v4 se omite).

## 1. Qué es Mirai
**Mirai** (未来, "futuro") es una plataforma de **finanzas personales y familiares para Colombia** para personas **sin conocimientos financieros**.
- **Idioma:** UI, textos, comentarios de cara al usuario y respuestas al dueño del producto en **español de Colombia**, con tuteo.
- **Principio:** *extremadamente simple*. Cada sección tiene "Cómo funciona" (`HELP`), cada modal su descripción (`MDESC`), cada campo su ayuda (`fieldHelp()`).
- **Dónde vive (desde 2026-11-07):** un VPS de Hostinger (`vps.engynex.com`) con **Dokploy**: la v7 completa en Docker (`infra/servidor/docker-compose.yml`: Postgres 17, PostgREST, Redis, SeaweedFS, API NestJS con login propio, tiempo real, web, cron y copias). **Ya no usa Vercel ni Supabase** (quedan apagados como respaldo unas semanas). Guía: `infra/servidor/README.md`.
- **Ambientes:** producción = rama `main` → https://mirai.engynex.com. Push a `main` → CI en verde → `.github/workflows/desplegar-vps.yml` pide el despliegue a Dokploy (o a mano: Actions › Desplegar VPS). Para subir: `/deploy` (`.agents/workflows/deploy-vps.md`); para cambiar la base: `/migracion`. `v6` quedó como rama histórica. No hay ambiente de pruebas en línea: se prueba con `pnpm local:serve`, `pnpm e2e:local` y `node infra/servidor/prueba-local.mjs` (el mismo despliegue en este computador).

## 2. Comandos
Desde la raíz (pnpm 10 con `corepack enable`; Turborepo guarda en caché build, typecheck, lint y test por paquete):
```bash
pnpm install         # todo el workspace (apps/* y packages/*)
pnpm dev             # TODO local en Docker (base, API, tiempo real) + next dev en http://localhost:55300, cuenta demo (sin Supabase)
pnpm dev:web         # solo next dev en :3000 (necesita MIRAI_API_URL con una API corriendo; lo normal es pnpm dev)
pnpm db:migrate:vps  # esquema (db/postgres) a la base del VPS por túnel SSH; `-- --pendientes` solo lista lo que falta
pnpm build           # build de producción (turbo run build; la web corre gen-icons + next build)
pnpm typecheck       # next typegen + tsc en la web, tsc en cada paquete
pnpm lint            # ESLint (0 errores)
pnpm test            # Vitest: packages/domain (cálculos + paridad v4), packages/contracts, apps/web, apps/api (spike)
pnpm e2e:local       # LA batería Playwright (escritorio 1366 px + móvil 400 px) contra el stack LOCAL en Docker (base, API, tiempo real y web; nunca producción). infra/local/README.md
pnpm test:e2e        # Playwright solo (sin levantar Docker): necesita una base local (E2E_DB_URL, E2E_POSTGREST_URL) y la API; úsalo vía e2e:local
pnpm db:migrate      # aplica supabase/migrations/*.sql en orden (SUPABASE_DB_URL de la .env.local de la raíz; el nombre es histórico)
pnpm db:types        # regenera packages/db/src/database.types.ts desde la BD
pnpm --filter web <script>   # scripts propios de la web: pwa:assets, pwa:screenshots, legacy:extract, icons, start
pnpm --filter @mirai/domain test   # solo el dominio (o cualquier paquete por su nombre)
```
Tras tocar el esquema: `db:migrate` → `db:types` → `typecheck`. Antes de cerrar un cambio: `build` + `e2e:local` y revisar capturas en `apps/web/tests/.out/`.

## 3. Arquitectura
Monorepo (pnpm + Turborepo):
```
package.json · pnpm-workspace.yaml · turbo.json   raíz: solo scripts de Turborepo y prettier
apps/web/        el Next.js (todo lo de abajo vive aquí): solo front; datos y auth por la API
apps/api/        NestJS: Better Auth (/api/auth), /v1 (ts-rest sobre @mirai/contracts/api), tiempo real (socket.io),
                 trabajos programados (/v1/jobs/*), webhooks de pagos; lee y escribe por el PostgREST interno con RLS
packages/domain/ @mirai/domain: lógica pura (antes lib/domain + lib/household/roles, lib/plans, lib/integrations/resolve,
                 lib/automations/{engine,schema,types,limits,catalog}, el armado de lib/book-data) con sus pruebas Vitest
packages/db/     @mirai/db: database.types.ts (generado), tables.ts (Row/Insert/qk), scripts db-migrate y db-types
packages/contracts/ @mirai/contracts: zod común (Uuid, Money, IsoDate, ApiError), zod-es, LIVE_TABLES, LIMITS,
                 BOOK_TABLE_POLICY (CRUD del libro) y un stub por módulo de la API
packages/services/ · packages/ai/  código de servidor (avisos, Google, integraciones, IA) que corre en la API
packages/config/ @mirai/config: tsconfig base, ESLint de paquetes, Prettier y preset de Vitest
supabase/migrations · db/postgres · legacy/ · docs/   siguen en la raíz (supabase/migrations es la historia del esquema)
```
**Re-exportaciones:** `apps/web/lib/domain/*.ts`, `lib/plans.ts`, `lib/household/roles.ts`, `lib/integrations/resolve.ts`,
`lib/automations/{engine,schema,types,limits,catalog}.ts` y `lib/supabase/{database.types,tables}.ts` solo hacen
`export * from "@mirai/…"`: los `import "@/lib/domain/…"` de siempre siguen funcionando. **El código se edita en `packages/*`.**
Los nombres `lib/supabase/*` y `supabase/migrations` son históricos: la web ya no usa Supabase (ni `@supabase/ssr` ni clientes).

Dentro de `apps/web/`:
```
app/
  (auth)/           login (contraseña, enlace mágico, Google), registro (Ley 1581), recuperar, actualizar-clave, verificacion (MFA),
                    todo con Better Auth (lib/auth/mirai.ts)
  (onboarding)/     bienvenida (crea hogar + libro: POST /v1/households)
  (app)/            shell (sidebar, migas, ⌘K, Agregar, notificaciones) + una ruta por sección del menú
  (admin)/admin/    consola de la plataforma (solo platform_admins): layout y menú propios (lib/admin-nav.ts),
                    usuarios, hogares, planes, suscripciones, pagos, cupones, integraciones globales, anuncios,
                    comunicados, opiniones, administradores, auditoría y sistema. Se entra desde el menú de perfil › Admin
  (app)/[seccion]   respaldo para secciones sin ruta (hoy ninguna; ver lib/migration-status.ts)
  (auth)/invitacion/[token]  aceptar invitación a un hogar
  contador/[token]  portal público del contador (solo lectura, datos en vivo, notas)
  api/auth/*, v1/*  reenvío a la API en el mismo origen (cookie httpOnly) si el balanceador no lo hace
  api/pagos/*       webhooks de Mercado Pago y Wompi: los reenvía tal cual a la API (/v1/webhooks/*)
  auth/callback     regreso de Better Auth (Google, enlace mágico, cambio de correo) con `next`; auth/confirm: enlaces viejos → /login
  legal/            términos y política de datos
components/ui       shadcn (radix-nova) — no editar salvo ajustes de marca
components/app      shell: app-shell, app-sidebar, command-palette, add-menu, notifications-sheet, help-sheet, mobile-tabbar
components/mirai    piezas propias: IsoIcon, Icon (lucide por nombre), PageHeader…
components/skeletons  esqueletos de carga
features/<módulo>/  vista + `api.ts` de cada sección (llamadas a la API con browserApi()): settings, integrations,
                    notify, chat, ai, reports, renta, contador, correo, gami, ayuda, profile, household, data…
hooks/              use-book-data (useList/useSave/useSoftDelete por /v1/books/:b/t/:tabla), use-live (gateway de tiempo real)
lib/api/            client.ts (browserApi, mismo origen), server.ts (serverApi/publicServerApi desde el servidor de Next),
                    config.ts (MIRAI_API_URL), session.ts (libro y hogar activos), book-tables.ts / book-rows.ts (CRUD del libro)
lib/auth/           Better Auth en el navegador (client.ts, mirai.ts), cookie de sesión en el servidor (server.ts), proxy.ts
lib/dal.ts          getAppContext(): GET /v1/me con la cookie (usuario, hogar, libro activo de la cookie mirai-book) — solo servidor
lib/domain/         re-exporta @mirai/domain (packages/domain/src): cálculos puros portados 1:1 de la v4 (+ pruebas
                    Vitest contra el bundle de la v4): totales, préstamos, renta (art. 241), consejero, reportes, logros…
lib/ai/, lib/chat/, lib/notify/  re-exportan lo puro de @mirai/ai y @mirai/services (prompts, router, reglas aviso×canal…);
                    la IA, los avisos y las integraciones corren en la API
lib/integrations/   registro único de integraciones (registry.ts)
lib/book-data.ts    re-exporta @mirai/domain/book-data (el libro llega por GET /v1/books/:b/snapshot)
lib/content/ayuda.ts  versión, novedades, FAQ, guías y tour
lib/content/help.ts HELP / MDESC / fieldHelp (textos literales de la v4 en lib/data/legacy-*.json)
lib/nav.ts          menú efectivo de la v4 → rutas
lib/supabase/       database.types.ts y tables.ts (solo tipos: re-exportan @mirai/db; el nombre es histórico)
proxy.ts            Next 16 (antes middleware): sin la cookie de sesión de Better Auth → /login (la API la valida)
scripts/            gen-icons (también lee packages/domain), pwa-assets, extract-legacy (lee ../../legacy)…
tests/e2e           Playwright (capturas en apps/web/tests/.out)
```
En la raíz: `supabase/migrations` (SQL versionado e idempotente, fuente única del esquema) y `legacy/` (Mirai 4.0;
`pnpm --filter web legacy:extract` saca sus datos a `apps/web/lib/data`).

### Patrones (léelos antes de tocar código)
- **Un solo camino: la API.** La web no habla con la base ni con Supabase. En el navegador, `browserApi()` (`lib/api/client.ts`, ts-rest sobre `@mirai/contracts/api`) en el mismo origen (`/v1`, cookie httpOnly de Better Auth); en el servidor de Next (RSC, Server Actions, Route Handlers), `serverApi()` / `publicServerApi()` (`lib/api/server.ts`, reenvía la cookie como Bearer a `MIRAI_API_URL`). Cada sección tiene su `features/<x>/api.ts`. Algo nuevo de datos = endpoint en la API (contrato en `packages/contracts`) + función en el `api.ts` del módulo.
- **Next 16 con `cacheComponents`:** todo lo que lea cookies/sesión va dentro de `<Suspense>` con un skeleton. Usa `getAppContext()` (ya llama `connection()`).
- **Datos en cliente:** TanStack Query con claves `qk(bookId, tabla, …)`. `useList`, `useSave` (optimista) y `useSoftDelete` (borrado lógico + toast "Deshacer") van por el CRUD genérico de la API; `useBookData` por el snapshot. El tiempo real (gateway socket.io de la API, `hooks/use-live-gateway.ts`) invalida por tabla: si agregas una tabla, añádela a `LIVE_TABLES` en `packages/contracts/src/live.ts`. Si es una tabla del libro (`book_id` + `deleted_at`), la compilación exige su fila en `BOOK_TABLE_POLICY` (`packages/contracts/src/book-tables.ts`).
- **Seguridad:** RLS en todas las tablas con `is_book_member(book_id, rol)` / `is_household_member` (la API entra por el PostgREST interno con el rol de la persona). Roles `owner` > `editor` > `viewer`. La web no tiene secretos; integraciones cifradas en la API (AES-256-GCM, `ENCRYPTION_KEY`); el cliente lee `integrations_public`.
- **Borrado lógico:** `deleted_at`; las consultas filtran `deleted_at is null`. La auditoría (`audit_log`) se llena sola por triggers.
- **Formularios:** react-hook-form + zod 4 + componentes `Field*` de shadcn. Mensajes en español.
- **Escrituras con secretos** (IA, correo, cifrado, pagos): en la API (validadas con zod en el contrato). La web solo las llama.
- **Responsive:** móvil primero; `<768px` sidebar como Sheet + barra inferior + Drawer (vaul); probar a 400 px sin scroll horizontal.
- **Montos:** marca los valores con `data-money` para el modo privado. Formato COP con `Intl` (`es-CO`).
- **Planes (freemium):** el plan es del hogar (`household_plan(h)` en la BD, `ctx.plan` en `getAppContext`). Funciones Premium en `lib/plans.ts` (`FEATURES`: ia, banco, impuestos, familia). En el servidor de Next: `requirePremium()` o `ctx.plan`; la API vuelve a revisar el plan (la IA se bloquea en `@mirai/ai/run`). En la UI: `<PremiumGate>` en la página de la sección y `<PremiumUpsell>`. Anuncios solo en planes con `ads` (Gratis): sistema estilo Meta en `features/ads/ad-slot.tsx` (`AdSlot`, `StoryAd`, `AdTicker`, `AdModal`, `AfterActionAd`) y `lib/ads.ts` (elegibilidad por campaña, plan, dispositivo y frecuencia diaria; mezcla con AdSense por porcentaje). Campañas y métricas en consola › Anuncios (`ad_campaigns`, `ad_events`, `ad_user_daily`, `ad_track`, `ad_reach`). `useSave` emite `mirai:accion` al crear en `ACTION_TABLES` (anuncio después de una acción). Los administradores (hogar Premium) los ven con el interruptor "Ver anuncios en mi cuenta". Las pruebas E2E usan QA en Premium (`login(page)`); `login(page, "gratis")` para el plan gratis.
- **Reparto por quincena:** `incomes.reparto` y `fixed_expenses.reparto` (jsonb, `lib/domain/reparto.ts`): valor distinto por quincena, días de pago, en qué quincena se descuenta la nómina (`quincenasNetas`), día de la semana y mes del pago anual. `valor` (y `bruto`) guardan el **promedio por quincena** para que el total del mes no cambie en la versión publicada. Para ubicar pagos en fechas usa `incomePagos` y `fijoValor`, no `valor`. Formulario de ingreso: tipo (`TIPOS_INGRESO`) → descuentos → valor del mes → frecuencia; `planIngreso` reparte el mes en pagos y `reparto.mensual`/`tipo`/`dias` lo recuerdan. Descuentos con `mes: true` son del mes (redondeo PILA, `retModo: "proc2"` = procedimiento 2); `dedAMes` convierte los de antes. Ajustes de nómina del libro en `book_settings.nomina` (`NominaCfg`: procedimiento de retención por defecto y tabla del FSP; vacía = Ley 797 `FSP_LEY797`); pasa `fsp` en el `ref` de `dedCalc`. Para el total del mes usa `pagosMes(x)` (el diario depende de `reparto.dias`), no `FREC`.
- **Funciones 5.4:** calculadoras (`lib/domain/calculadoras.ts`), hallazgos (`lib/domain/insights.ts`, tarjeta en Inicio), lista de deseos (`wishlist`), patrimonio mes a mes (`net_worth_snapshots`, se guarda al abrir Balance), Academia (`lib/content/academia.ts`, avance en `user_preferences.extra.academia`) y referidos (código por persona, premio al crear el hogar en la bienvenida, lo maneja la API; ajustes en consola › Sistema).
- **Cálculo integral (una sola cifra en toda la app):** `lib/domain/flujo-integral.ts` (`flujoIntegral`, `estadoIntegral`, `snapshotMes`, `proyeccionMeses`) junta entradas y salidas de todos los módulos sin contar dos veces (fijo↔gasto, tarjeta en base caja, cuota↔gasto, suscripción↔cobro). Lo usan Balance, Dashboard (`lib/domain/dashboard.ts`), Inicio, Flujo de caja y el chat. Saldos de cuentas: `lib/domain/cuentas.ts` (`conSaldos`, medios de pago ligados a una cuenta). Mapa de conexiones entre módulos: `docs/sinergia/mapa.md`.
- **Reglas de cifras (revisión 2026-11-08, no las rompas; detalle, ejemplos y lista de chequeo en `.agents/rules/cifras.md`; auditoría: subagente `auditor-cifras` o flujo `auditoria-modulos`):**
  - Préstamos que te dan o haces NO son ingreso ni gasto: `flujoIntegral` los deja fuera de `tot.entra/sale/queda` (van en `credEntra/credSale`; `caja` = con préstamos). Inicio, Balance y Dashboard leen `tot` tal cual.
  - Tarjeta: el pago del mes M es la factura del corte que se paga en M (`cortePagadoEnMes`); la deuda baja en la fecha de pago (`compraEstado.k` = pagadas, `fact` = facturadas). No depende del día en que se mire.
  - Proyecciones: `proyectarMes` (historial ≥ 2 meses completos, o ritmo con ≥ 14 días y ≥ 4 registros; si no, "pronto" y no se proyecta). Hormiga, indicadores, avisos y Gastos usan `hormigas()`. "Gasto del día a día": `gastoVariable` (meses completos; si no, presupuesto; si no, "sin-datos" y no se afirma "puedes ahorrar").
  - Préstamos: `cuotasDelMes` (lo que toca este mes por plan) ≠ `cuotasMes` (compromiso mensual; pago único repartido, "solo intereses" = intereses). E.A. siempre `eaDeMensual` / `mensualDeEA`. "Te debe hoy" = `paraSaldar` (capital + intereses vencidos). Un pago de cuota por menos de su valor es parte de la cuota (`HistRow` "parcial", `CuotaRow.abonado`; API `pay` con `parcial`).
  - Gastos básicos sin aportes a metas/fondo (`link_type`); fijos en USD/EUR se convierten (`fijoMensual(f, trm)`). Meses que aguantas: `fondoEstado` en todas partes.
  - Gasto › "¿A quién le pagaste?": negocio (`provider_id`) o persona (`contact_id`, migración `db/postgres/0004_gasto_pagado_a.sql`) o nadie.
- **Escrituras enlazadas (comandos de la API):** compra y pago de tarjeta, pago de fijo y suscripción, aporte a meta, fondo, enlazar gasto↔fijo, pagos de deudas (`features/<x>/commands.ts` con `command()` de `features/book/command.ts`). Úsalas en vez de varias escrituras sueltas; por dentro la API llama las RPC (`add_card_purchase`, `pay_credit_card`…).
- **Ajustes › Finanzas, Valores por defecto y Relaciones:** `features/settings/tabs/{finance,defaults,relaciones}.tsx`; cálculos en `packages/domain/src/ajustes.ts` (repartos, `cuadrarReparto`, quincenas, uso de relaciones). Los valores por defecto (`book_settings.defaults`: `cat`, `medio`, `quien`, `fijo_cat`, `fijo_medio`, `ing_quien`, `sistema`, `frec`, `plazo`) los leen los formularios de gasto, fijo, ingreso y préstamo al crear uno nuevo. `/contactos?q=` abre la lista ya filtrada.
- **Reglas de importación:** `matchRule` (gana la palabra más larga, sin tildes) en `packages/domain/src/hormiga.ts`; uso, sugerencias y reglas desde correcciones en `reglas.ts`. Ajustes › Reglas (`features/settings/tabs/reglas.tsx`): probador, sugerencias, aplicar a gastos anteriores con Deshacer.
- **Sin conexión (offline):** el service worker (`public/sw.js`) guarda las páginas que se abren y las principales (`WARM` desde `features/pwa/offline-sync.tsx`, cada 12 h) en `mirai-pages`; sin red sirve la guardada o `offline.html` (lista las guardadas). Los datos: TanStack se guarda en IndexedDB `mirai-offline` (`lib/offline/persist.ts`, por persona, una semana). `useSave`/`useSoftDelete` (`networkMode: "always"`) sin conexión encolan la petición en `lib/offline/outbox.ts` y se envía al volver la red (o por Background Sync del service worker; candado `mirai-outbox` + Idempotency-Key). Los comandos (RPC) no se encolan. Todo se borra al cerrar sesión (`lib/offline/clear.ts`). Prueba: `tests/e2e/f14-offline.spec.ts`.
- **Apariencia nativa:** `lib/pwa/platform.ts` marca `<html>` con `ios`/`android`/`mac`/`windows`/`touch`/`standalone` y bloquea el zoom con los dedos (salvo `.react-flow`). Celular: `components/app/mobile-topbar.tsx` (título estilo iOS o Material, Atrás en detalle, buscar, campana) y barra inferior por plataforma (globals.css › Apariencia nativa). `features/pwa/native.tsx`: menú en íconos en tablet, `html.kbd` con el teclado abierto, deslizar desde el borde para volver (iPhone instalado) y Atrás cierra ventanas (app instalada táctil).
- **Sonido de los avisos:** `lib/sound.ts` (Web Audio, sin archivos): suena en cada toast (`components/mirai/toast.tsx`, menos "cargando") y en cada notificación nueva de la campana (evento `notification` INSERT del gateway). Interruptor por dispositivo en Ajustes › Alertas (`localStorage` `mirai-sonido`); el audio se desbloquea con el primer toque (`unlockSoundOnGesture` en `app/providers.tsx`).
- **Academia (e-learning):** `?leccion=<id>` abre el reproductor paso a paso (`features/academia/player.tsx`: portada, una idea por pantalla, repaso, resultado; teclado ←/→, Escuchar con `speechSynthesis`, apuntes, retomar con `localStorage`). Evaluación por nivel y certificado en `features/academia/evaluacion.tsx`. Avance en `user_preferences.extra`: `academia`, `academia_log` (racha), `academia_notas`, `academia_eval` (`features/ayuda/use-ayuda.ts`); lógica pura en `lib/content/academia.ts`.
- **Avisos:** los corre la API (`/v1/jobs/notify/tick`, servicio `cron` del compose cada hora); cada envío reclama su clave en `notification_log` (`notify_claim`) para no duplicar. WhatsApp nunca usa plantillas de ejemplo de Meta (`esPlantillaDeMeta`); sin plantilla propia aprobada va como texto libre.
- **Tablas de datos:** usa `<DataTable>` (`components/mirai/data-table.tsx`, estilo Meta) para listas con búsqueda, filtros, orden y exportar. En celular dibuja tarjetas (una sola versión del DOM).
- **Consola admin:** `features/admin/api.ts` (+ `platform-api.ts`, `ads-api.ts`, `ia-api.ts`) llama al módulo `admin` de la API (solo administradores de la plataforma, con registro en `admin_audit`). Por privacidad la consola nunca muestra montos ni movimientos de los hogares.
- **Integraciones globales:** `platform_integrations` (modo apagada/opcional/por_defecto/obligatoria + planes). En la API, `getIntegration()` combina la del hogar con la global (`@mirai/domain/integrations/resolve`); para guardar la del hogar usa `getOwnIntegration()` (nunca mezclar secretos de la plataforma).
- **Automatizaciones:** `lib/automations/` (motor puro `engine.ts`, validación zod del grafo en `schema.ts`, plantillas por defecto en `templates.ts`, límite por plan en `limits.ts` + trigger `automation_limit`); las acciones reales corren en la API (`@mirai/services/automations/server`). Editor con `@xyflow/react` en `features/automations/editor`. Eventos: triggers de Postgres encolan en `automation_events`; `AutomationRunner` (en el shell) le pide a la API procesarlos al recibir el aviso del gateway; programadas en `/v1/jobs/automations/drain` (cron del compose cada 5 min).
- **IA (corre en la API, `packages/ai`):** prompts centralizados en `@mirai/ai/prompts` (base fijo primero para la caché del proveedor). Antes de llamar a la IA intenta `@mirai/ai/router` (reglas/algoritmos) y la caché `ai_cache`. Cada llamada se registra en `ai_usage` (costo, tokens, créditos; `lib/ai/pricing.ts`, `credits.ts`); pasa `feature` a `aiText`/`aiObject`. Cupos por plan en consola › Uso de IA.
- **Integraciones:** el cliente solo configura la IA (Ajustes › Inteligencia artificial). Correo, WhatsApp, Telegram, push y datos de referencia son de la plataforma (consola › Integraciones globales); `getIntegration()` ignora la fila del hogar para ellas. Los envíos quedan en `notification_log` (consola › Envíos). Preferencias de canal y destino: Ajustes › Alertas.
- **Centro de ayuda:** panel en `components/app/help-sheet.tsx` + `features/ayuda/*`, contenido en `lib/content/centro-ayuda.ts`, `glosario.ts`, `ayuda.ts`, `academia.ts`.
- **Ventanas:** `ResponsiveDialog` acepta `split` (alto fijo; el contenido maneja su desplazamiento, p. ej. formulario + recibo fijo) y `onBack` (flecha Atrás para una vista de detalle en la misma ventana, como Facebook). Los tooltips de `components/ui/tooltip.tsx` abren con un toque en pantallas táctiles.
- **Migraciones:** aditivas (no cambiar el comportamiento de la versión publicada); lo que restrinja va detrás de un interruptor (`platform_settings`). El esquema de la base del VPS sale de `db/postgres` (`pnpm db:migrate:vps`).

## 4. Diseño
Microsoft 365 / Fluent + shadcn, limpieza tipo Meta. Paleta Engynex: navy `#1F2B4B`, lima `#9EDB4E`, verde `#3F7A1E`; tokens en `app/globals.css` (claro/oscuro). Isotipos propios (`lib/data/iso.json`, `<IsoIcon k="…"/>`). **Logos de terceros (Google, Netflix, Telegram, bancos…) solo para identificar un servicio, sin modificarlos, desde `lib/brands.ts` (`scripts/brand-logos.mjs`: @iconify-json/logos y simple-icons, CC0; si no hay, el ícono oficial que la entidad publica en su sitio, descargado una vez con `scripts/brand-official.mjs` a `public/brands/` — nunca enlazado a un tercero en tiempo real —; si tampoco, monograma). Los selectores (`Option.brand`) y el ⌘K muestran el logo. Nunca como decoración ni como logo de Mirai.**

## 5. Dominio Colombia (detalle en `.agents/rules/colombia.md`)
Valores anuales en tablas `ref_*` (con fuente): UVT 2024–2026, SMMLV 2026, festivos 2026, calendario de renta 2026 (general — Decreto 2229/2023 — y plazo especial por el sismo, Decreto 1226/2026). Verifícalos con fuentes oficiales (subagente `finanzas-colombia`) antes de cambiarlos; nunca se inventan. Todo cálculo tributario es **estimado**.

## 6. Reglas de trabajo
1. Español en UI y respuestas; términos técnicos explicados.
2. Cambios pequeños y verificables: `build` → `test:e2e` → capturas.
3. Prueba E2E por funcionalidad (`apps/web/tests/e2e/`), pruebas Vitest por cálculo (`packages/domain/src/*.test.ts`) comparadas con la v4.
4. Cada sección migrada: reemplaza su entrada en `apps/web/lib/migration-status.ts` por una ruta real en `apps/web/app/(app)/<id>/page.tsx` y cubre TODO lo de su inventario.
5. Integraciones: registro único (`lib/integrations/registry.ts`), activables/ajustables en Ajustes › Integraciones.
6. No metas secretos en el código (`scripts/revisar-secretos.mjs` lo revisa antes de cada commit: hook de git `.githooks/pre-commit` y hook de Claude Code; `pnpm secretos` a mano; falso positivo = `secretos:ok` en la línea). `.env.local` (raíz, enlazada desde `apps/web`) está en `.gitignore`; producción usa las variables del compose en Dokploy (`infra/servidor/variables.mjs`, `.env.example`). La web solo necesita `MIRAI_API_URL` y las `NEXT_PUBLIC_*`.

## 7. Gotchas
- `components/ui/command.tsx`: `CommandDialog` NO envuelve en `<Command>`; hazlo tú.
- `useList` filtra por `book_id`; las tablas por hogar (`family_members`, `integrations`) se consultan aparte.
- Google (entrar con Google): la URI de redirección es `<BETTER_AUTH_URL>/api/auth/callback/google`; Gmail y Calendar vuelven por la API (`/v1/google/callback`).
- Archivos `"use server"`: solo exportan funciones async (y tipos). Constantes compartidas van en otro archivo (p. ej. `features/correo/query.ts`).
- `MoneyAutosave`/inputs que guardan al salir comparan con `Object.is` (un `NaN` en una fila optimista causaba un bucle de render).
- Registros nuevos con `useSave`: el UUID se genera en el navegador (sin filas `tmp-…`); borrar o editar un registro que aún se guarda espera a que termine (`inflight` en `hooks/use-book-data.ts`).
- La burbuja del chat se aparta al desplazar; si una prueba hace clic cerca de la esquina inferior derecha en móvil, desplaza antes.
- Clic en opciones de `ChoiceCards`: usa `getByRole("radio", { name })` (el radio transparente cubre la tarjeta).
- Tablas del plan: `plan_subscriptions` y `plan_payments` (`subscriptions` ya es la sección Suscripciones de Netflix, Spotify…). Pagos solo los escriben los webhooks de la API (`/api/pagos/*` de la web los reenvía tal cual a `/v1/webhooks/*`; firma verificada, idempotente).
- En producción Next oculta el mensaje de los `throw` de Server Actions: para errores que el usuario debe leer, devuelve `{ ok: false, msg }`.
- Avatares: `profiles.avatar_url` y `family_members.avatar` guardan una URL (Google o bucket `avatars/{user_id}/…`) o `mirai:<clave>` (`lib/content/avatars.ts`); muéstralos siempre con `<UserAvatar>`. Con cédula (CC), `profiles.digitos` sale solo del documento (`digitosDian`).
- Aviso de hidratación con atributos raros en `<body>` (`cz-shortcut-listen`, `data-gr-*`): es una extensión del navegador (ColorZilla, Grammarly), no un error de Mirai; `<body>` ya tiene `suppressHydrationWarning`.
- `ResponsiveDialog` fija Dialog/Drawer mientras está abierta (cambiar de uno a otro remonta el formulario y borra lo escrito; las capturas `fullPage` de Playwright redimensionan la ventana).
- Si un cambio de `app/globals.css` no aparece en la compilación (clases o variables nuevas ausentes en `apps/web/.next/static/chunks/*.css`), la caché de Turbopack (`apps/web/.next/cache/turbopack`) quedó vieja: apártala y vuelve a compilar (y `pnpm build --force` para saltar la caché de Turborepo).
- El `globalSetup` de Playwright borra y recrea el usuario QA en la base local: no lances dos baterías a la vez (`pnpm e2e:local` usa los puertos 55300/55080/55081; si quedaron ocupados, cierra esos procesos).
- Toda clave foránea nueva necesita índice (`20261103003702_indices_fk_todos.sql` creó los que faltaban): sin él, borrar una cuenta o un hogar revisa tablas completas y Auth corta la petición.
- Si una prueba E2E muestra la página en blanco sin errores, revisa que no haya un `next start` viejo en el puerto 3100 (`lsof -ti:3100`): Playwright lo reutiliza y sirve una compilación que ya no existe.
- **Monorepo:** pnpm es estricto: si la web importa un paquete, debe estar en `apps/web/package.json` (no basta con que lo traiga otra dependencia). Los paquetes `@mirai/*` se usan como código TypeScript sin compilar (`exports` → `src/*.ts`, `transpilePackages` en `next.config.ts`). `packages/domain` no puede importar nada de `apps/web` (ni `@/…`): si un cálculo necesita algo de la web, pásalo como parámetro.
- `.env.local` está en la raíz; `apps/web/.env.local` es un enlace simbólico a ella (créalo con `ln -s ../../.env.local apps/web/.env.local` si falta). Nunca la copies a otro lado.
- Modelos de IA: el campo `type: "model"` del registro se llena con la API de modelos de cada proveedor (`listModels` + `lib/ai/models.ts`); no escribas nombres de modelos a mano en la UI.
- En las pruebas E2E, `admin()` de `tests/e2e/qa.ts` usa supabase-js solo como cliente del PostgREST local: sus consultas son perezosas (`void sb.rpc(...)` **no se envía**; usa `await` o `.then()`).
- Ventanas que se abren solas (anuncios): esperan a que no haya otra ventana abierta (`whenFree`), dos Radix cruzados bloquean los clics.
- Los textos del portal del contador y Ajustes › Integraciones nunca reciben secretos: solo `integrations_public` (máscaras).
- **Error React #418 (hidratación):** en la web usa `useQuery` de `@/lib/query`, no el de `@tanstack/react-query` (ESLint lo exige). Mientras un componente hidrata devuelve "pendiente" como el servidor aunque la caché ya tenga los datos (precarga del shell, API en el mismo origen); `useBookData` aplica la misma regla. Solo pasa con `next build` (en `next dev` no se ve).
- **Libro activo:** con la API se recuerda en `profiles.last_book_id` (no solo en la cookie). "Ver un ejemplo" deja el libro de ejemplo activo: `login()` de las E2E vuelve al libro principal con `setQaDefaultBook()`.
- **Login propio (Better Auth):** sin `MIRAI_API_URL` la web no arranca nada (`apiConfig()` lanza un error claro). No quedan interruptores (`apiOn`, `viaApiOr`, `AUTH_PROVIDER`, `MIRAI_API_ROLLOUT`): no los vuelvas a meter. `pnpm e2e:local --dev` usa `next dev` sin compilar (rápido para depurar; el #418 no se reproduce así).

## 8. Documentación
`AGENTS.md` (resumen para otros agentes) · `infra/servidor/README.md` (VPS con Dokploy: variables, despliegue, copias) · `infra/local/README.md` (stack local y E2E) · `docs/DEPLOY-VERCEL.md` (histórico) · `docs/arquitectura/v6-separacion-front-back.md` (v6: front Next + API NestJS) · `.agents/rules/` · `.claude/agents/` (finanzas-colombia, qa-playwright, ux-simple) · `docs/BACKLOG.md` · `docs/HISTORIAL.md` · `docs/migracion/` · `docs/superpowers/specs/`.
