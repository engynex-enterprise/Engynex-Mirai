"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { BOOK_COOKIE } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { reclamarReferido } from "@/lib/referidos"
import { serverAuthProvider } from "@/lib/auth/provider"

const schema = z.object({
  nombre: z.string().trim().min(2, "Escribe tu nombre").max(80),
  hogar: z.string().trim().min(2, "Escribe el nombre de tu hogar").max(60),
  libro: z.string().trim().min(2).max(40),
})

export type WelcomeState = { error?: string } | undefined

export async function createHousehold(_: WelcomeState, form: FormData): Promise<WelcomeState> {
  const parsed = schema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }
  if (serverAuthProvider() === "mirai") return createHouseholdMirai(parsed.data)
  // Modo heredado: Supabase directo (perfil + RPC create_household + referido).
  const sb = await supabaseServer()
  const { data: claims } = await sb.auth.getClaims()
  if (!claims?.claims.sub) redirect("/login")
  await sb.from("profiles").update({ nombre: parsed.data.nombre }).eq("id", claims.claims.sub)
  const { data: bookId, error } = await sb.rpc("create_household", { p_nombre: parsed.data.hogar, p_libro: parsed.data.libro })
  if (error) return { error: "No pudimos crear tu hogar. Intenta de nuevo." }
  // Referidos: el código llega en los datos del registro o en la cookie que deja /registro?ref=…
  const store = await cookies()
  await reclamarReferido(claims.claims.sub, (claims.claims.user_metadata as { ref?: string } | undefined)?.ref ?? store.get("mirai_ref")?.value).catch(() => null)
  store.delete("mirai_ref")
  ;(await cookies()).set(BOOK_COOKIE, bookId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 })
  redirect("/puesta")
}

/**
 * v7 (V7-H4), AUTH_PROVIDER=mirai: POST /v1/households (nombre del perfil, create_household y el referido de la cookie
 * `mirai_ref`, todo en la API) con la cookie de Better Auth. La web solo deja la cookie del libro activo.
 */
async function createHouseholdMirai(data: z.infer<typeof schema>): Promise<WelcomeState> {
  const [{ miraiApiConfig, SESSION_EXPIRED_URL }, { serverApi }] = await Promise.all([import("@/lib/dal"), import("@/lib/api/server")])
  const store = await cookies()
  const res = await serverApi(miraiApiConfig()).households.create({ body: { ...data, ref: store.get("mirai_ref")?.value ?? null } })
  if ((res.status as number) === 401) redirect(SESSION_EXPIRED_URL)
  if (res.status !== 200) return { error: (res.body as { msg?: string } | undefined)?.msg ?? "No pudimos crear tu hogar. Intenta de nuevo." }
  store.delete("mirai_ref")
  store.set(BOOK_COOKIE, res.body.data.bookId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 })
  redirect("/puesta")
}
