import "server-only"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { connection } from "next/server"
import type { Database } from "@/lib/supabase/database.types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  return createServerClient<Database>(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Se llamó desde un Server Component: lo ignora porque proxy.ts refresca la sesión.
        }
      },
    },
  })
}

/** Atajo: cliente con las cookies de la petición actual (respeta RLS). */
export async function supabaseServer() {
  await connection() // siempre en tiempo de petición: la sesión depende de la hora y de las cookies
  return createClient(await cookies())
}
