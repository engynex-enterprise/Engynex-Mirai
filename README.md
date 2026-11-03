# Mirai · Tu futuro financiero

Plataforma de finanzas personales y familiares para Colombia: ingresos, gastos, gastos fijos, préstamos, metas, inversiones, calendario de pagos, DIAN (renta) y más, explicada para personas sin conocimientos financieros.

**v5:** Next.js 16 + React 19 + Tailwind 4 + shadcn + Supabase (Postgres con RLS, Auth, Realtime, Storage), desplegada en Vercel. La v4 (HTML único) está en `legacy/`.

## Estructura
Monorepo **pnpm + Turborepo**: `apps/web` (Next.js), `apps/api` (NestJS, en construcción), `packages/domain` (cálculos),
`packages/db` (tipos de la base y migraciones), `packages/contracts` (contratos zod) y `packages/config`. Las migraciones
SQL siguen en `supabase/migrations` y la v4 en `legacy/`.

## Empezar
```bash
corepack enable                          # pnpm en la versión del repo (packageManager)
pnpm install
cp .env.example .env.local               # en la raíz; completa las variables (Supabase, Google, ENCRYPTION_KEY…)
ln -s ../../.env.local apps/web/.env.local   # Next y Playwright la leen desde apps/web
pnpm db:migrate                          # crea las tablas en Supabase
pnpm dev                                 # http://localhost:3000
```

## Comandos
`pnpm build` · `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm test:e2e` · `pnpm db:types`

## Despliegue
Vercel con Root Directory `apps/web` y `turbo run build` (detalle en `docs/DEPLOY-VERCEL.md` › Monorepo). Carga las variables de `.env.example` en *Settings › Environment Variables*. En Supabase configura *Auth › URL Configuration* (Site URL y Redirect URLs `/auth/callback` y `/auth/confirm`) y el proveedor Google.

## Documentación
`CLAUDE.md` / `AGENTS.md` (para agentes) · `docs/superpowers/specs/` (diseño) · `docs/migracion/` (inventario funcional de la v4) · `.agents/rules/` (reglas de dominio y UX).
