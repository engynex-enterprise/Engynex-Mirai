# AGENTS.md — Mirai

Guía corta para agentes de código. **Lee `CLAUDE.md` para el contexto completo.**

**Idioma:** responde siempre en español de Colombia (tuteo), incluidos avances y resúmenes.

## Proyecto
Mirai: finanzas personales y familiares para Colombia, en español, para personas sin conocimientos financieros. **v7:** web Next.js 16 (App Router, `cacheComponents`) + React 19 + Tailwind 4 + shadcn que habla SOLO con la API NestJS (Better Auth, PostgREST interno sobre Postgres 17 con RLS, tiempo real socket.io, archivos S3). Producción en un VPS con Dokploy (`infra/servidor/`); ya no usa Vercel ni Supabase. La v4 (HTML único) vive en `legacy/` como referencia.

## Estructura (monorepo pnpm + Turborepo)
- `apps/web`: la app Next.js (app/, components/, features/, hooks/, lib/, public/, tests/e2e). Solo front: sin secretos ni acceso a la base.
- `apps/api`: NestJS 11 + Fastify + ts-rest + Better Auth (`src/core`: config zod, sesión, BookGuard/roles/plan, errores `{ ok:false, msg, code }`, logs, límites, idempotencia, colas; un módulo por sección en `src/modules`). Guía: `apps/api/README.md`.
- `packages/domain` (`@mirai/domain`): lógica pura y sus pruebas (antes `lib/domain`, roles, planes, motor de automatizaciones, armado del libro). `apps/web/lib/...` la re-exporta: los `import "@/lib/domain/…"` siguen sirviendo, pero **el código se edita en `packages/domain/src`**.
- `packages/db` (`@mirai/db`): tipos de la base y scripts `db:migrate` / `db:types`. `packages/crypto` (`@mirai/crypto`): cifrado AES-256-GCM de secretos (antes `lib/crypto.ts`, solo servidor). `packages/contracts` (`@mirai/contracts`): zod compartido, `LIVE_TABLES`, `LIMITS`, `BOOK_TABLE_POLICY`. `packages/services` (`@mirai/services`): avisos, integraciones, Google, datos de referencia y automatizaciones del servidor (corren en la API; la web solo importa lo puro: reglas, plantillas, tipos). `packages/ai` (`@mirai/ai`): IA y chat (corren en la API; la web importa lo puro de `lib/ai`, `lib/chat` y los tipos). `packages/config`: tsconfig, ESLint, Prettier, Vitest.
- En la raíz: `supabase/migrations` (historia del esquema; el nombre es histórico), `db/postgres` (esquema de la base del VPS), `legacy/`, `docs/` y la `.env.local` (`apps/web/.env.local` es un enlace a ella).
- `apps/web/lib/api/`: cliente tipado de la API (ts-rest). En el navegador `browserApi()` (mismo origen, cookie httpOnly); en el servidor de Next `serverApi()` / `publicServerApi()`. Cada sección llama a la API desde `features/<x>/api.ts` / `commands.ts`. **Un solo camino**: no hay interruptores ni respaldo en Supabase (no vuelvas a meter `apiOn`, `viaApiOr` ni `AUTH_PROVIDER`).
- Plan v6: `docs/arquitectura/v6-separacion-front-back.md`.

## Comandos (desde la raíz, con pnpm)
`pnpm dev` (todo local en Docker) · `pnpm build` · `pnpm typecheck` · `pnpm lint` · `pnpm test` (Vitest de todos los paquetes) · **`pnpm e2e:local`** (la batería Playwright 1366 px y 400 px contra Docker local; `infra/local/README.md`) · `pnpm local:test` (RLS, PostgREST y tiempo real contra Docker) · `pnpm migrate:ensayo` · `pnpm db:migrate` · `pnpm db:types` · `pnpm --filter web pwa:assets` (y demás scripts de la web)

## Reglas no negociables
1. UI y textos en español de Colombia, tuteo, lenguaje simple. Cada sección: `PageHeader` + `HELP`; cada modal: descripción (`MDESC`); cada campo: ayuda (`fieldHelp`).
2. Todo lo que lee sesión/cookies va dentro de `<Suspense>` con skeleton.
3. Datos: siempre por la API. TanStack Query (`useList`, `useSave`, `useSoftDelete`), borrado lógico con "Deshacer", tiempo real por libro (gateway de la API).
4. Seguridad: RLS en cada tabla nueva; secretos solo en la API y cifrados; la web no guarda secretos.
5. Valores tributarios/laborales de Colombia en tablas `ref_*` con fuente oficial; se muestran como estimados.
6. Logos de terceros (Google, Netflix, Telegram…) solo para identificar un servicio, sin modificarlos, desde `lib/brands.ts` (`scripts/brand-logos.mjs`: @iconify-json/logos y simple-icons, CC0; monograma si no hay logo libre). Nunca como decoración ni como logo de Mirai. Responsive móvil primero, sin scroll horizontal a 400 px.
7. Cada cambio: build → pruebas → capturas. Nada de la v4 se omite (ver `docs/migracion/`).
8. Cálculos nuevos o portados: en `packages/domain/src/` con prueba Vitest; si existían en la v4, compáralos contra el bundle (`packages/domain/src/__tests__/legacy.ts`). El dominio no importa nada de `apps/web`.
9. Archivos `"use server"` solo exportan funciones async y llaman a la API (`serverApi()`); la validación y los permisos viven en la API (contrato zod en `packages/contracts`).
10. pnpm es estricto: cada paquete declara en su `package.json` lo que importa. Tablas nuevas en vivo: `packages/contracts/src/live.ts` + publicación (migración).
11. Cifras: toda cifra sale de `packages/domain` y da lo mismo en todas las pantallas; préstamos fuera de "te sobra", tarjeta por corte, no se proyecta sin datos (`proyectarMes`), abonos con `pagoPeriodo`. Detalle y lista de chequeo: `.agents/rules/cifras.md`.
12. Antes de cada commit corre la revisión de secretos (`pnpm secretos`; el hook de git `.githooks/pre-commit` la hace solo). Subir a producción: `.agents/workflows/deploy-vps.md`; migraciones: `.agents/workflows/migracion.md`.
