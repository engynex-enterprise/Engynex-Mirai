# Cambiar el esquema de la base (migración)

La fuente del esquema de la v7 es `db/postgres/`. Las migraciones nuevas son `db/postgres/NNNN_nombre.sql`
(siguiente número libre, desde `0004`). `supabase/migrations/` es historia: no se toca.
Ejemplos: `0004_gasto_pagado_a.sql` (columna + FK + índice), `0005_abonos_fijos.sql` (columna + cambio de RPC),
`0006_abonos_indice.sql` (cambiar un índice único).

## 1. El SQL
- **Idempotente:** `add column if not exists`, `create index if not exists`, `drop function if exists`, restricciones
  dentro de `do $$ … if not exists (select 1 from pg_constraint …) $$`. Se puede correr dos veces sin error.
- **Aditiva:** el código publicado debe seguir funcionando. Columnas nuevas con `default` o nulas; argumentos nuevos de
  funciones con `default`. Lo que restrinja va detrás de un interruptor (`platform_settings`).
- **Toda llave foránea con índice** (sin él, borrar una cuenta revisa tablas completas).
- **Tabla nueva:** `enable row level security` + políticas con `is_book_member(book_id, 'viewer'|'editor')` o
  `is_household_member`; `book_id`, `deleted_at`, `created_at`, `updated_at`, `created_by`; trigger de auditoría como
  las demás; `grant` a `authenticated` y `service_role`. Si va en vivo, la publicación/trigger de tiempo real.
- **Función (RPC):** si cambias la firma, `drop function` de la vieja y `create` la nueva; `security` y `grant` igual
  que la original (cópialos de `db/postgres/0001_baseline.sql`).
- `comment on column …` en español simple y al final `notify pgrst, 'reload schema';`.

## 2. Tipos y contratos (en el mismo cambio)
1. `packages/db/src/database.types.ts`: `pnpm db:types` si tienes `SUPABASE_DB_URL` apuntando a una base con el
   cambio; si no, edítalo a mano (Row, Insert, Update y `Args` de la función) con el mismo orden alfabético.
2. Tabla del libro (`book_id` + `deleted_at`):
   - `packages/contracts/src/book-table-columns.ts` — la columna en la lista blanca (orden alfabético).
   - `packages/contracts/src/book-table-schemas.ts` — el zod de escritura (enum si tiene `check`).
   - `packages/contracts/src/book-tables.ts` — fila en `BOOK_TABLE_POLICY` si la tabla es nueva (la compilación la exige).
3. En vivo: `packages/contracts/src/live.ts` (`LIVE_TABLES`).
4. Contrato del módulo de la API (`packages/contracts/src/modules/*.ts`) si cambia un comando.
5. La API (`apps/api/src/modules/*`) y su prueba de integración si llama la RPC.

## 3. Probar en local
```bash
node infra/local/stack.mjs up   # aplica las pendientes al arrancar (también lo hace pnpm e2e:local)
pnpm typecheck && pnpm test
pnpm e2e:local       # o solo la prueba de la funcionalidad
```
Para aplicarla sin reiniciar el stack:
`node packages/db/scripts/db-destino.mjs pendientes --url postgres://postgres:mirai-local@localhost:55432/mirai`
Para confirmar que es idempotente (debe pasar dos veces sin error):
`docker exec -i mirai-local-db-1 psql -U postgres -d mirai -v ON_ERROR_STOP=1 < db/postgres/NNNN_nombre.sql`

## 4. Producción
Con el despliegue (`.agents/workflows/deploy-vps.md`): `pnpm db:migrate:vps -- --pendientes` y `pnpm db:migrate:vps`
**antes** del push.
