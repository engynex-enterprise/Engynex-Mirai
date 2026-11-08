---
description: Implementa una funcionalidad nueva siguiendo el flujo de Mirai (v7)
argument-hint: "<descripción de la funcionalidad>"
---
Funcionalidad pedida: $ARGUMENTS

1. Resume en 2-3 líneas qué entendiste y qué módulos vas a tocar (`apps/web/features/<x>`, API, `packages/domain`).
2. Si hay reglas tributarias o laborales de Colombia, consulta al subagente `finanzas-colombia` antes de implementar.
3. Si toca montos o cálculos, sigue `.agents/rules/cifras.md`: el cálculo va en `packages/domain` con prueba Vitest en pesos.
4. Si cambia la base: `/migracion`. Datos nuevos = endpoint en la API (contrato en `packages/contracts`) + función en `features/<x>/api.ts`.
5. UI con los patrones de `CLAUDE.md` (shadcn, `ResponsiveDialog`, `DataTable`, `data-money`, `<Suspense>` con skeleton),
   con `HELP`, `MDESC` y ayudas por campo; móvil primero, sin scroll horizontal a 400 px.
6. Prueba E2E en `apps/web/tests/e2e/` y `pnpm e2e:local -- <archivo>`. Pide al subagente `ux-simple` que revise los textos y a
   `qa-playwright` las capturas (1366 y 400 px).
7. Agrega la novedad en `apps/web/lib/content/ayuda.ts` si la persona la va a notar.
8. Responde en español, breve, sin jerga.
