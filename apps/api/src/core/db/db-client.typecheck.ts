// Comprobación de tipos (no corre): el cliente neutro DbClient de @mirai/db lo cumplen tanto SupabaseClient (web de
// hoy) como PostgrestClient (DB_ADAPTER=postgrest). Si una actualización de supabase-js o postgrest-js los separa,
// `pnpm typecheck` falla aquí y no en 200 consultas de packages/services y packages/ai.
import type { PostgrestClient } from "@supabase/postgrest-js"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, DbClient } from "@mirai/db"

export type SupabaseCumple = SupabaseClient<Database> extends DbClient ? true : never
export type PostgrestCumple = PostgrestClient<Database> extends DbClient ? true : never
export const DB_CLIENT_COMPATIBLE: [SupabaseCumple, PostgrestCumple] = [true, true]
