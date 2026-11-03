# @mirai/domain

Lógica de negocio **pura** de Mirai (F2-A-4): sin React, sin Supabase, sin reloj global. La usan el navegador
(Inicio, Dashboard, Balance), el servidor de Next (cron, IA, reportes) y, desde la fase 2, `apps/api`.

| Ruta | Antes |
|---|---|
| `src/*.ts` (totales, préstamos, renta, consejero, reparto…) y `src/__tests__/` | `lib/domain/**` |
| `src/household/roles.ts` | `lib/household/roles.ts` |
| `src/plans.ts` | `lib/plans.ts` |
| `src/integrations/resolve.ts` | `lib/integrations/resolve.ts` |
| `src/automations/{engine,schema,types,limits,catalog}.ts` | `lib/automations/…` (`catalog` va porque el motor lo usa) |
| `src/book-data.ts` | `lib/book-data.ts` sin el cargador: `loadBookDataWith(loader)` recibe un `BookPartLoader` |

`apps/web` re-exporta cada módulo en su ruta de antes (`@/lib/domain/…`, `@/lib/plans`…), así que los `import`
existentes no cambian. Código nuevo puede importar directo: `import { formatCOP } from "@mirai/domain/money"`.

```bash
pnpm --filter @mirai/domain test        # Vitest (incluida la paridad v4)
pnpm --filter @mirai/domain typecheck
```

Única dependencia de ejecución: `zod` (esquema de automatizaciones). `@mirai/db` solo aporta tipos.
Reglas: cálculos nuevos con prueba Vitest; si existían en la v4, compáralos contra el bundle (`src/__tests__/legacy.ts`).
