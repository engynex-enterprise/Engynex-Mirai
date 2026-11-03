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

## Postgres destino (v7: Cloud SQL, RDS, Azure o Docker)

- `db/postgres/` (raíz): `0000_compat.sql` (roles `anon`, `authenticated`, `service_role`, `authenticator`, `mirai_app`;
  `auth.uid()/role()/jwt()`), `0003_auth_better.sql` (Better Auth, copia de V7-A), `0001_baseline.sql` y `0001_seed.sql`
  (generados), `0002_cloud_overrides.sql` (cron, tiempo real, storage, triggers de `auth.users`, permisos de `mirai_app`).
- `scripts/db-destino.mjs <historia|destino|baseline|diff|preparar|cierre> --url …` (guía: `infra/local/README.md`).
- `DATABASE_URL=… pnpm db:migrate`: aplica el esquema destino (no las migraciones de Supabase). Contraseñas de los
  roles con login desde `MIRAI_AUTHENTICATOR_PASSWORD` y `MIRAI_APP_PASSWORD` (Terraform de AWS/Azure las deja en el
  secreto del trabajo de migración; nunca van en el SQL). Sin la variable, en una base remota la contraseña no cambia.
- Cambios nuevos al esquema destino: `db/postgres/0004_*.sql` en adelante (los aplica `destino` en orden).
