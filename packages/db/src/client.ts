// Cliente de datos neutro (v7, V7-D): lo que `packages/services`, `packages/ai` y los adaptadores de la API usan de
// la base: `.from()`, `.rpc()` y `.schema()` del constructor de PostgREST. Lo cumplen igual
//   - SupabaseClient<Database> (la web de hoy: supabaseAdmin(), supabaseServer()) y
//   - PostgrestClient<Database> (la API con DB_ADAPTER=postgrest: el PostgREST interno con un JWT de 60 s).
// No incluye `.auth` ni `.storage`: eso pasa a Better Auth (V7-A) y al puerto ObjectStore (V7-E).
import type { PostgrestClient } from "@supabase/postgrest-js"
import type { Database } from "./database.types"

export type DbClient = Pick<PostgrestClient<Database>, "from" | "rpc" | "schema">
