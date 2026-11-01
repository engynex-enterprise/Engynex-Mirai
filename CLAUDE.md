# CLAUDE.md — Mirai

> **IDIOMA OBLIGATORIO: responde SIEMPRE en español de Colombia (tuteo)** — mensajes al dueño del producto, avances entre pasos, resúmenes finales, preguntas y descripciones de comandos. Esto aplica a Claude Code, subagentes y cualquier agente. Solo el código (nombres de variables, APIs) puede ir en inglés.

> Punto de entrada para Claude Code y cualquier agente. Reglas de dominio en `.agents/rules/`.
> **Estado: v5.0 (Next.js + shadcn + Supabase). Todas las secciones de la v4.0 (en `legacy/`) están migradas.**
> Diseño aprobado: `docs/superpowers/specs/2026-10-31-migracion-nextjs-design.md`. Lista de control funcional: `docs/migracion/inventario-1…5.md` (nada de la v4 se omite).

## 1. Qué es Mirai
**Mirai** (未来, "futuro") es una plataforma de **finanzas personales y familiares para Colombia** para personas **sin conocimientos financieros**.
- **Idioma:** UI, textos, comentarios de cara al usuario y respuestas al dueño del producto en **español de Colombia**, con tuteo.
- **Principio:** *extremadamente simple*. Cada sección tiene "Cómo funciona" (`HELP`), cada modal su descripción (`MDESC`), cada campo su ayuda (`fieldHelp()`).
- **Dónde vive:** Vercel (front + back en Next.js) + Supabase (Postgres, Auth, Realtime, Storage).
- **Ambientes:** producción = rama `main` → https://mirai.engynex.com · pruebas = rama `pruebas` → https://engynex-mirai-pruebas.vercel.app. Hoy comparten la base de Supabase; cómo separarla en `docs/DEPLOY-VERCEL.md`.

## 2. Comandos
```bash
npm run dev          # http://localhost:3000 (lee .env.local)
npm run build        # build de producción (debe pasar sin errores)
npm run typecheck    # next typegen + tsc
npm run lint         # ESLint (0 errores)
npm run test         # Vitest: cálculos puros (lib/domain)
npm run test:e2e     # Playwright escritorio 1366 px + móvil 400 px (crea el usuario QA con la clave secreta)
npm run db:migrate   # aplica supabase/migrations/*.sql en orden (SUPABASE_DB_URL de .env.local; :prod lee .env.produccion.local)
npm run db:types     # regenera lib/supabase/database.types.ts desde la BD
```
Tras tocar el esquema: `db:migrate` → `db:types` → `typecheck`. Antes de cerrar un cambio: `build` + `test:e2e` y revisar capturas en `tests/.out/`.

## 3. Arquitectura
```
app/
  (auth)/           login (contraseña, enlace mágico, Google), registro (Ley 1581), recuperar, actualizar-clave, verificacion (MFA)
  (onboarding)/     bienvenida (crea hogar + libro con create_household)
  (app)/            shell (sidebar, migas, ⌘K, Agregar, notificaciones) + una ruta por sección del menú
  (admin)/admin/    consola de la plataforma (solo platform_admins): layout y menú propios (lib/admin-nav.ts),
                    usuarios, hogares, planes, suscripciones, pagos, cupones, integraciones globales, anuncios,
                    comunicados, opiniones, administradores, auditoría y sistema. Se entra desde el menú de perfil › Admin
  (app)/[seccion]   respaldo para secciones sin ruta (hoy ninguna; ver lib/migration-status.ts)
  (auth)/invitacion/[token]  aceptar invitación a un hogar
  contador/[token]  portal público del contador (solo lectura, datos en vivo, notas)
  api/cron/notify   cron de avisos y datos de referencia (Bearer CRON_SECRET)
  api/google/*      OAuth de Gmail (solo lectura) y Google Calendar
  auth/callback|confirm   PKCE / token_hash
  legal/            términos y política de datos
components/ui       shadcn (radix-nova) — no editar salvo ajustes de marca
components/app      shell: app-shell, app-sidebar, command-palette, add-menu, notifications-sheet, help-sheet, mobile-tabbar
components/mirai    piezas propias: IsoIcon, Icon (lucide por nombre), PageHeader…
components/skeletons  esqueletos de carga
features/<módulo>/  vista + acciones de cada sección (settings, integrations, notify, advisor, chat, ai, reports,
                    renta, contador, correo, gami, ayuda, profile, household, data…)
hooks/              use-book-data (useList/useSave/useSoftDelete), use-realtime (canal por libro)
lib/dal.ts          getAppContext(): usuario, hogar, libro activo (cookie mirai-book) — solo servidor
lib/domain/         cálculos puros portados 1:1 de la v4 (+ pruebas Vitest contra el bundle de la v4):
                    totales, préstamos, renta (art. 241), consejero, reportes, logros, agenda/avisos…
lib/ai/             modelo por proveedor (model.ts) y aiText/aiObject con respaldo entre proveedores (run.ts)
lib/integrations/   registro único de integraciones (registry.ts); secretos con lib/crypto.ts
lib/notify/         reglas aviso×canal, resumen (digest), correo, Telegram, push y WhatsApp
lib/book-data.ts    loadBookData(sb, bookId): el libro en la forma de lib/domain (navegador y servidor)
lib/content/ayuda.ts  versión, novedades, FAQ, guías y tour
lib/content/help.ts HELP / MDESC / fieldHelp (textos literales de la v4 en lib/data/legacy-*.json)
lib/nav.ts          menú efectivo de la v4 → rutas
lib/supabase/       database.types.ts (generado), tables.ts (tipos + qk), admin.ts (clave secreta, solo servidor)
utils/supabase/     server.ts, client.ts, middleware.ts (patrón oficial de Supabase)
proxy.ts            Next 16 (antes middleware): refresca la sesión y protege rutas
supabase/migrations SQL versionado e idempotente
legacy/             Mirai 4.0 (referencia; `npm run legacy:extract` saca sus datos a lib/data)
```

### Patrones (léelos antes de tocar código)
- **Next 16 con `cacheComponents`:** todo lo que lea cookies/sesión va dentro de `<Suspense>` con un skeleton. Usa `supabaseServer()` / `getAppContext()` (ya llaman `connection()`).
- **Datos en cliente:** TanStack Query con claves `qk(bookId, tabla, …)`. `useList`, `useSave` (optimista) y `useSoftDelete` (borrado lógico + toast "Deshacer"). Realtime invalida por tabla: si agregas una tabla, añádela a la publicación (migración) y a `LIVE_TABLES` en `hooks/use-realtime.ts`.
- **Seguridad:** RLS en todas las tablas con `is_book_member(book_id, rol)` / `is_household_member`. Roles `owner` > `editor` > `viewer`. Secretos solo en el servidor; integraciones cifradas (AES-256-GCM, `ENCRYPTION_KEY`); el cliente lee `integrations_public`.
- **Borrado lógico:** `deleted_at`; las consultas filtran `deleted_at is null`. La auditoría (`audit_log`) se llena sola por triggers.
- **Formularios:** react-hook-form + zod 4 + componentes `Field*` de shadcn. Mensajes en español.
- **Escrituras con secretos** (IA, correo, cifrado): Server Actions o Route Handlers validados con zod.
- **Responsive:** móvil primero; `<768px` sidebar como Sheet + barra inferior + Drawer (vaul); probar a 400 px sin scroll horizontal.
- **Montos:** marca los valores con `data-money` para el modo privado. Formato COP con `Intl` (`es-CO`).
- **Planes (freemium):** el plan es del hogar (`household_plan(h)` en la BD, `ctx.plan` en `getAppContext`). Funciones Premium en `lib/plans.ts` (`FEATURES`: ia, banco, impuestos, familia). En el servidor: `requirePremium()` o `ctx.plan`; la IA se bloquea en `lib/ai/run.ts`. En la UI: `<PremiumGate>` en la página de la sección y `<PremiumUpsell>`. Anuncios solo en Gratis con `<AdSlot slot>`. Las pruebas E2E usan QA en Premium (`login(page)`); `login(page, "gratis")` para el plan gratis.
- **Consola admin:** acciones en `features/admin/server.ts` (todas con `requirePlatformAdmin()` y registro en `admin_audit`). Por privacidad la consola nunca muestra montos ni movimientos de los hogares.
- **Integraciones globales:** `platform_integrations` (modo apagada/opcional/por_defecto/obligatoria + planes). `getIntegration()` combina la del hogar con la global (`lib/integrations/resolve.ts`); para guardar la del hogar usa `getOwnIntegration()` (nunca mezclar secretos de la plataforma).
- **Base compartida:** pruebas y producción usan la misma base de Supabase. Las migraciones deben ser **aditivas** (no cambiar el comportamiento de la versión publicada); lo que restrinja va detrás de un interruptor (`platform_settings`).

## 4. Diseño
Microsoft 365 / Fluent + shadcn, limpieza tipo Meta. Paleta Engynex: navy `#1F2B4B`, lima `#9EDB4E`, verde `#3F7A1E`; tokens en `app/globals.css` (claro/oscuro). Isotipos propios (`lib/data/iso.json`, `<IsoIcon k="…"/>`). **Logos de terceros (Google, Netflix, Telegram…) solo para identificar un servicio, sin modificarlos, desde `lib/brands.ts` (`scripts/brand-logos.mjs`: @iconify-json/logos y simple-icons, CC0; monograma si no hay logo libre). Nunca como decoración ni como logo de Mirai.**

## 5. Dominio Colombia (detalle en `.agents/rules/colombia.md`)
Valores anuales en tablas `ref_*` (con fuente): UVT 2024–2026, SMMLV 2026, festivos 2026, calendario de renta 2026 (general — Decreto 2229/2023 — y plazo especial por el sismo, Decreto 1226/2026). Verifícalos con fuentes oficiales (subagente `finanzas-colombia`) antes de cambiarlos; nunca se inventan. Todo cálculo tributario es **estimado**.

## 6. Reglas de trabajo
1. Español en UI y respuestas; términos técnicos explicados.
2. Cambios pequeños y verificables: `build` → `test:e2e` → capturas.
3. Prueba E2E por funcionalidad (`tests/e2e/`), pruebas Vitest por cálculo (`lib/domain/*.test.ts`) comparadas con la v4.
4. Cada sección migrada: reemplaza su entrada en `lib/migration-status.ts` por una ruta real en `app/(app)/<id>/page.tsx` y cubre TODO lo de su inventario.
5. Integraciones: registro único (`lib/integrations/registry.ts`), activables/ajustables en Ajustes › Integraciones.
6. No metas secretos en el código. `.env.local` está en `.gitignore`; producción usa variables de Vercel (`.env.example`).

## 7. Gotchas
- `components/ui/command.tsx`: `CommandDialog` NO envuelve en `<Command>`; hazlo tú.
- `useList` filtra por `book_id`; las tablas por hogar (`family_members`, `integrations`) se consultan aparte.
- Supabase Auth: configurar Site URL, Redirect URLs (`/auth/callback`, `/auth/confirm`), proveedor Google y SMTP propio en el panel.
- Cron en Vercel Hobby: 1 vez al día → avisos horarios con `pg_cron` + `pg_net` (`select mirai_schedule_notify(url, secreto)`).
- Archivos `"use server"`: solo exportan funciones async (y tipos). Constantes compartidas van en otro archivo (p. ej. `features/correo/query.ts`).
- `MoneyAutosave`/inputs que guardan al salir comparan con `Object.is` (un `NaN` en una fila optimista causaba un bucle de render).
- Registros nuevos con `useSave`: el UUID se genera en el navegador (sin filas `tmp-…`); borrar o editar un registro que aún se guarda espera a que termine (`inflight` en `hooks/use-book-data.ts`).
- La burbuja del chat se aparta al desplazar; si una prueba hace clic cerca de la esquina inferior derecha en móvil, desplaza antes.
- Clic en opciones de `ChoiceCards`: usa `getByRole("radio", { name })` (el radio transparente cubre la tarjeta).
- Tablas del plan: `plan_subscriptions` y `plan_payments` (`subscriptions` ya es la sección Suscripciones de Netflix, Spotify…). Pagos solo los escriben los webhooks (`/api/pagos/*`, firma verificada) con `applyPayment` (idempotente).
- En producción Next oculta el mensaje de los `throw` de Server Actions: para errores que el usuario debe leer, devuelve `{ ok: false, msg }`.
- Avatares: `profiles.avatar_url` y `family_members.avatar` guardan una URL (Google o bucket `avatars/{user_id}/…`) o `mirai:<clave>` (`lib/content/avatars.ts`); muéstralos siempre con `<UserAvatar>`. Con cédula (CC), `profiles.digitos` sale solo del documento (`digitosDian`).
- Aviso de hidratación con atributos raros en `<body>` (`cz-shortcut-listen`, `data-gr-*`): es una extensión del navegador (ColorZilla, Grammarly), no un error de Mirai; `<body>` ya tiene `suppressHydrationWarning`.
- `ResponsiveDialog` fija Dialog/Drawer mientras está abierta (cambiar de uno a otro remonta el formulario y borra lo escrito; las capturas `fullPage` de Playwright redimensionan la ventana).
- Si una prueba E2E muestra la página en blanco sin errores, revisa que no haya un `next start` viejo en el puerto 3100 (`lsof -ti:3100`): Playwright lo reutiliza y sirve una compilación que ya no existe.
- Modelos de IA: el campo `type: "model"` del registro se llena con la API de modelos de cada proveedor (`listModels` + `lib/ai/models.ts`); no escribas nombres de modelos a mano en la UI.
- Los textos del portal del contador y Ajustes › Integraciones nunca reciben secretos: solo `integrations_public` (máscaras).

## 8. Documentación
`AGENTS.md` (resumen para otros agentes) · `docs/DEPLOY-VERCEL.md` (variables, cron, Google, Telegram) · `.agents/rules/` · `.claude/agents/` (finanzas-colombia, qa-playwright, ux-simple) · `docs/BACKLOG.md` · `docs/HISTORIAL.md` · `docs/migracion/` · `docs/superpowers/specs/`.
