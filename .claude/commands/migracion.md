---
description: Crea una migración de la base (db/postgres) y actualiza tipos, contratos y pruebas en el mismo cambio
argument-hint: "<qué cambia en la base, ej. 'columna nota en card_payments'>"
---
Cambio pedido en la base: $ARGUMENTS

Sigue `.agents/workflows/migracion.md`:
1. Busca el siguiente número libre en `db/postgres/` (desde `0004`) y escribe `NNNN_<nombre_en_español>.sql`:
   idempotente, aditivo, con índice para cada llave foránea, RLS si es tabla nueva, `comment on` y `notify pgrst`.
   Lee una migración parecida (`0004_*`, `0005_*`) y la definición actual en `db/postgres/0001_baseline.sql` antes de escribir.
2. Actualiza en el mismo cambio: `packages/db/src/database.types.ts`, `book-table-columns.ts`, `book-table-schemas.ts`,
   `BOOK_TABLE_POLICY` (tabla nueva), `LIVE_TABLES` (en vivo), el contrato del módulo y la API si usa la RPC.
3. Aplícala en local (`node infra/local/stack.mjs up`, que también corre `pnpm e2e:local`, o `node packages/db/scripts/db-destino.mjs pendientes --url postgres://postgres:mirai-local@localhost:55432/mirai`)
   y corre `pnpm typecheck` y `pnpm test`. Confirma que es idempotente corriéndola otra vez directo:
   `docker exec -i mirai-local-db-1 psql -U postgres -d mirai -v ON_ERROR_STOP=1 < db/postgres/NNNN_….sql`.
4. No la apliques a producción aquí: eso lo hace `/deploy` antes del push.

Responde en español: archivo creado, qué hace para la persona, qué tocaste y cómo quedó en local.
