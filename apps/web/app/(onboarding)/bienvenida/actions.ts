"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { BOOK_COOKIE, SESSION_EXPIRED_URL } from "@/lib/dal"
import { serverApi } from "@/lib/api/server"

const schema = z.object({
  nombre: z.string().trim().min(2, "Escribe tu nombre").max(80),
  hogar: z.string().trim().min(2, "Escribe el nombre de tu hogar").max(60),
  libro: z.string().trim().min(2).max(40),
})

export type WelcomeState = { error?: string } | undefined

/**
 * POST /v1/households (nombre del perfil, create_household y el referido de la cookie `mirai_ref`, todo en la API) con
 * la cookie de sesión. La web solo deja la cookie del libro activo.
 */
export async function createHousehold(_: WelcomeState, form: FormData): Promise<WelcomeState> {
  const parsed = schema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }
  const store = await cookies()
  const res = await serverApi().households.create({ body: { ...parsed.data, ref: store.get("mirai_ref")?.value ?? null } })
  if ((res.status as number) === 401) redirect(SESSION_EXPIRED_URL)
  if (res.status !== 200) return { error: (res.body as { msg?: string } | undefined)?.msg ?? "No pudimos crear tu hogar. Intenta de nuevo." }
  store.delete("mirai_ref")
  store.set(BOOK_COOKIE, res.body.data.bookId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 })
  redirect("/puesta")
}
