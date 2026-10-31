"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { BOOK_COOKIE } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"

const schema = z.object({
  nombre: z.string().trim().min(2, "Escribe tu nombre").max(80),
  hogar: z.string().trim().min(2, "Escribe el nombre de tu hogar").max(60),
  libro: z.string().trim().min(2).max(40),
})

export type WelcomeState = { error?: string } | undefined

export async function createHousehold(_: WelcomeState, form: FormData): Promise<WelcomeState> {
  const parsed = schema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }
  const sb = await supabaseServer()
  const { data: claims } = await sb.auth.getClaims()
  if (!claims?.claims.sub) redirect("/login")
  await sb.from("profiles").update({ nombre: parsed.data.nombre }).eq("id", claims.claims.sub)
  const { data: bookId, error } = await sb.rpc("create_household", { p_nombre: parsed.data.hogar, p_libro: parsed.data.libro })
  if (error) return { error: "No pudimos crear tu hogar. Intenta de nuevo." }
  ;(await cookies()).set(BOOK_COOKIE, bookId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 })
  redirect("/puesta")
}
