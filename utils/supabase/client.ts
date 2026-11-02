import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/lib/supabase/database.types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

let browser: ReturnType<typeof createBrowserClient<Database>> | undefined

/**
 * Cliente del navegador (una sola instancia: comparte sesión y canal de Realtime).
 * `x-mirai-enlaces`: este código entiende los movimientos enlazados (gasto ↔ compra con tarjeta ↔ gasto de grupo,
 * gasto de un fijo); la base solo aplica esas cascadas a quien lo envía (o con platform_settings.sync_enlaces).
 */
export const createClient = () => (browser ??= createBrowserClient<Database>(supabaseUrl!, supabaseKey!, { global: { headers: { "x-mirai-enlaces": "1" } } }))
