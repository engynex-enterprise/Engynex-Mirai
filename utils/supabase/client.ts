import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/lib/supabase/database.types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

let browser: ReturnType<typeof createBrowserClient<Database>> | undefined

/** Cliente del navegador (una sola instancia: comparte sesión y canal de Realtime). */
export const createClient = () => (browser ??= createBrowserClient<Database>(supabaseUrl!, supabaseKey!))
