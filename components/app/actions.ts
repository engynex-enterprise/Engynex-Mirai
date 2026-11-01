"use server"

import { cookies } from "next/headers"
import { BOOK_COOKIE, getAppContext } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { FREE_LIMITS } from "@/lib/plans"

/** Cambia el libro activo (cookie + último libro del perfil, para otros dispositivos). */
export async function switchBook(bookId: string) {
  const ctx = await getAppContext()
  if (!ctx.books.some((b) => b.id === bookId)) throw new Error("Ese libro no es tuyo")
  const store = await cookies()
  store.set(BOOK_COOKIE, bookId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 })
  const sb = await supabaseServer()
  await sb.from("profiles").update({ last_book_id: bookId }).eq("id", ctx.user.id)
}

export async function createBook(nombre: string, tipo: "personal" | "negocio" | "otro", icon: string) {
  const ctx = await getAppContext()
  const sb = await supabaseServer()
  if (ctx.plan !== "premium" && ctx.books.filter((b) => b.household_id === ctx.household.id).length >= FREE_LIMITS.libros)
    throw new Error(`El plan gratis incluye ${FREE_LIMITS.libros} libro de cuentas. Pásate a Premium para llevar también tu negocio o tus arriendos.`)
  const { data, error } = await sb.rpc("create_book", { p_household: ctx.household.id, p_nombre: nombre, p_tipo: tipo, p_icon: icon })
  if (error) throw new Error(error.message)
  await switchBook(data)
  return data
}
