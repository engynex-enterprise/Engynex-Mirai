# @mirai/db

Tipos de la base y scripts de esquema (F2-A-3).

- `src/database.types.ts`: generado por la CLI de Supabase. **No se edita a mano**: `pnpm db:types`.
- `src/tables.ts`: `Row<'tabla'>`, `Insert`, `Update`, `BookTable`, `qk()` y `DERIVED_KEYS`.
- `scripts/db-migrate.mjs`: aplica `supabase/migrations/*.sql` (en la **raíz** del repo, fuente única del esquema) en orden e idempotente, con `SUPABASE_DB_URL` de la `.env.local` de la raíz (`--prod` lee `.env.produccion.local`).

```bash
pnpm db:migrate        # desde la raíz (Turborepo → @mirai/db)
pnpm db:types          # regenera src/database.types.ts
pnpm typecheck
```

`apps/web/lib/supabase/{database.types,tables}.ts` re-exportan este paquete, así que `@/lib/supabase/tables` sigue funcionando.
Más adelante (fase 4) aquí van los tipos de Kysely (`kysely-codegen`).
