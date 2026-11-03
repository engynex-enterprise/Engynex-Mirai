# AGENTS.md — Mirai

Guía corta para agentes de código. **Lee `CLAUDE.md` para el contexto completo.**

**Idioma:** responde siempre en español de Colombia (tuteo), incluidos avances y resúmenes.

## Proyecto
Mirai: finanzas personales y familiares para Colombia, en español, para personas sin conocimientos financieros. **v5.0 (migración completa):** Next.js 16 (App Router, `cacheComponents`) + React 19 + Tailwind 4 + shadcn + Supabase (Postgres con RLS, Auth, Realtime, Storage), desplegado en Vercel. La v4 (HTML único) vive en `legacy/` como referencia.

## Estructura (monorepo pnpm + Turborepo, v6 F2-A)
- `apps/web`: la app Next.js (app/, components/, features/, hooks/, lib/, public/, tests/e2e). Vercel: Root Directory `apps/web`.
- `apps/api`: NestJS 11 + Fastify + ts-rest (fase 2). F2-B dejó el núcleo (`src/core`: config zod, JWT de Supabase, BookGuard/roles/plan, errores `{ ok:false, msg, code }`, logs de Cloud Logging, límites, idempotencia, colas), los 32 módulos como stubs (`src/modules/index.ts`) y el ejemplo completo `modules/catalogs`. Guía: `apps/api/README.md`.
- `packages/domain` (`@mirai/domain`): lógica pura y sus pruebas (antes `lib/domain`, roles, planes, motor de automatizaciones, armado del libro). `apps/web/lib/...` la re-exporta: los `import "@/lib/domain/…"` siguen sirviendo, pero **el código se edita en `packages/domain/src`**.
- `packages/db` (`@mirai/db`): tipos de la base y scripts `db:migrate` / `db:types`. `packages/crypto` (`@mirai/crypto`): cifrado AES-256-GCM de secretos (antes `lib/crypto.ts`, solo servidor). `packages/contracts` (`@mirai/contracts`): zod compartido, `LIVE_TABLES`, `LIMITS`, `BOOK_TABLE_POLICY`. `packages/services` (`@mirai/services`, F2-E): avisos, integraciones, Google, datos de referencia y automatizaciones del servidor que comparten web y API (antes `lib/notify`, `lib/google*`, `features/integrations/store…`; la web los re-exporta: **se edita en el paquete**). `packages/ai` (`@mirai/ai`, F2-F): IA y chat que comparten web y API (antes `lib/ai`, `lib/chat` y los casos de uso de `features/ai`, `features/advisor/engine`, `features/chat/{server,confirm}` y `app/api/chat`; la web los re-exporta: **se edita en el paquete**). `packages/config`: tsconfig, ESLint, Prettier, Vitest.
- En la raíz: `supabase/migrations`, `legacy/`, `docs/` y la `.env.local` (`apps/web/.env.local` es un enlace a ella).
- Plan v6: `docs/arquitectura/v6-separacion-front-back.md`.

## Comandos (desde la raíz, con pnpm)
`pnpm dev` · `pnpm build` · `pnpm typecheck` · `pnpm lint` · `pnpm test` (Vitest de todos los paquetes) · `pnpm test:e2e` (Playwright 1366 px y 400 px) · `pnpm db:migrate` · `pnpm db:types` · `pnpm --filter web pwa:assets` (y demás scripts de la web)

## Reglas no negociables
1. UI y textos en español de Colombia, tuteo, lenguaje simple. Cada sección: `PageHeader` + `HELP`; cada modal: descripción (`MDESC`); cada campo: ayuda (`fieldHelp`).
2. Todo lo que lee sesión/cookies va dentro de `<Suspense>` con skeleton.
3. Datos: TanStack Query (`useList`, `useSave`, `useSoftDelete`), borrado lógico con "Deshacer", Realtime por libro.
4. Seguridad: RLS en cada tabla nueva; secretos solo en servidor y cifrados; nunca `SUPABASE_SECRET_KEY` en el cliente.
5. Valores tributarios/laborales de Colombia en tablas `ref_*` con fuente oficial; se muestran como estimados.
6. Logos de terceros (Google, Netflix, Telegram…) solo para identificar un servicio, sin modificarlos, desde `lib/brands.ts` (`scripts/brand-logos.mjs`: @iconify-json/logos y simple-icons, CC0; monograma si no hay logo libre). Nunca como decoración ni como logo de Mirai. Responsive móvil primero, sin scroll horizontal a 400 px.
7. Cada cambio: build → pruebas → capturas. Nada de la v4 se omite (ver `docs/migracion/`).
8. Cálculos nuevos o portados: en `packages/domain/src/` con prueba Vitest; si existían en la v4, compáralos contra el bundle (`packages/domain/src/__tests__/legacy.ts`). El dominio no importa nada de `apps/web`.
9. Archivos `"use server"` solo exportan funciones async; valida la entrada con zod y revisa el rol con `requireRole`.
10. pnpm es estricto: cada paquete declara en su `package.json` lo que importa. Tablas nuevas en vivo: `packages/contracts/src/live.ts` + publicación (migración).
