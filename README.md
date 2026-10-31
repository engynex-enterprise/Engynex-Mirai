# Mirai · Tu futuro financiero

Plataforma de finanzas personales y familiares para Colombia: ingresos, gastos, gastos fijos, préstamos, metas, inversiones, calendario de pagos, DIAN (renta) y más, explicada para personas sin conocimientos financieros.

**v5 (en migración):** Next.js 16 + React 19 + Tailwind 4 + shadcn + Supabase (Postgres con RLS, Auth, Realtime, Storage), desplegada en Vercel. La v4 (HTML único) está en `legacy/`.

## Empezar
```bash
npm install
cp .env.example .env.local   # completa las variables (Supabase, Google, ENCRYPTION_KEY…)
npm run db:migrate           # crea las tablas en Supabase
npm run dev                  # http://localhost:3000
```

## Comandos
`npm run build` · `npm run typecheck` · `npm run lint` · `npm run test` · `npm run test:e2e` · `npm run db:types`

## Despliegue
Vercel detecta Next.js en la raíz. Carga las variables de `.env.example` en *Settings › Environment Variables*. En Supabase configura *Auth › URL Configuration* (Site URL y Redirect URLs `/auth/callback` y `/auth/confirm`) y el proveedor Google.

## Documentación
`CLAUDE.md` / `AGENTS.md` (para agentes) · `docs/superpowers/specs/` (diseño) · `docs/migracion/` (inventario funcional de la v4) · `.agents/rules/` (reglas de dominio y UX).
