# AGENTS.md — Mirai

Guía corta para agentes de código. **Lee `CLAUDE.md` para el contexto completo.**

**Idioma:** responde siempre en español de Colombia (tuteo), incluidos avances y resúmenes.

## Proyecto
Mirai: finanzas personales y familiares para Colombia, en español, para personas sin conocimientos financieros. **v5.0 (migración completa):** Next.js 16 (App Router, `cacheComponents`) + React 19 + Tailwind 4 + shadcn + Supabase (Postgres con RLS, Auth, Realtime, Storage), desplegado en Vercel. La v4 (HTML único) vive en `legacy/` como referencia.

## Comandos
`npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` · `npm run test` (Vitest) · `npm run test:e2e` (Playwright 1366 px y 400 px) · `npm run db:migrate` · `npm run db:types`

## Reglas no negociables
1. UI y textos en español de Colombia, tuteo, lenguaje simple. Cada sección: `PageHeader` + `HELP`; cada modal: descripción (`MDESC`); cada campo: ayuda (`fieldHelp`).
2. Todo lo que lee sesión/cookies va dentro de `<Suspense>` con skeleton.
3. Datos: TanStack Query (`useList`, `useSave`, `useSoftDelete`), borrado lógico con "Deshacer", Realtime por libro.
4. Seguridad: RLS en cada tabla nueva; secretos solo en servidor y cifrados; nunca `SUPABASE_SECRET_KEY` en el cliente.
5. Valores tributarios/laborales de Colombia en tablas `ref_*` con fuente oficial; se muestran como estimados.
6. Logos de terceros (Google, Netflix, Telegram…) solo para identificar un servicio, sin modificarlos, desde `lib/brands.ts` (`scripts/brand-logos.mjs`: @iconify-json/logos y simple-icons, CC0; monograma si no hay logo libre). Nunca como decoración ni como logo de Mirai. Responsive móvil primero, sin scroll horizontal a 400 px.
7. Cada cambio: build → pruebas → capturas. Nada de la v4 se omite (ver `docs/migracion/`).
8. Cálculos nuevos o portados: en `lib/domain/` con prueba Vitest; si existían en la v4, compáralos contra el bundle (`lib/domain/__tests__/legacy.ts`).
9. Archivos `"use server"` solo exportan funciones async; valida la entrada con zod y revisa el rol con `requireRole`.
