# AGENTS.md — Mirai

Guía corta para agentes de código. **Lee `CLAUDE.md` para el contexto completo.**

## Proyecto
Mirai: finanzas personales y familiares para Colombia, en español, para personas sin conocimientos financieros. **v5 en migración:** Next.js 16 (App Router, `cacheComponents`) + React 19 + Tailwind 4 + shadcn + Supabase (Postgres con RLS, Auth, Realtime, Storage), desplegado en Vercel. La v4 (HTML único) vive en `legacy/` como referencia.

## Comandos
`npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` · `npm run test` (Vitest) · `npm run test:e2e` (Playwright 1366 px y 400 px) · `npm run db:migrate` · `npm run db:types`

## Reglas no negociables
1. UI y textos en español de Colombia, tuteo, lenguaje simple. Cada sección: `PageHeader` + `HELP`; cada modal: descripción (`MDESC`); cada campo: ayuda (`fieldHelp`).
2. Todo lo que lee sesión/cookies va dentro de `<Suspense>` con skeleton.
3. Datos: TanStack Query (`useList`, `useSave`, `useSoftDelete`), borrado lógico con "Deshacer", Realtime por libro.
4. Seguridad: RLS en cada tabla nueva; secretos solo en servidor y cifrados; nunca `SUPABASE_SECRET_KEY` en el cliente.
5. Valores tributarios/laborales de Colombia en tablas `ref_*` con fuente oficial; se muestran como estimados.
6. Sin logos de marcas de terceros. Responsive móvil primero, sin scroll horizontal a 400 px.
7. Cada cambio: build → pruebas → capturas. Nada de la v4 se omite (ver `docs/migracion/`).
