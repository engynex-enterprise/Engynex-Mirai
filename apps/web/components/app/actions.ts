"use server"

import { cookies } from "next/headers"
import { BOOK_COOKIE, getAppContext } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { z } from "zod"
import { limitOf } from "@/lib/plans"

const NewBook = z.object({ nombre: z.string().trim().min(1, "Escribe el nombre del libro").max(60), tipo: z.enum(["personal", "negocio", "otro"]), icon: z.string().regex(/^[a-z0-9-]{1,40}$/) })

/** Cambia el libro activo (cookie + último libro del perfil, para otros dispositivos). */
export async function switchBook(bookId: string) {
  if (typeof bookId !== "string") throw new Error("Ese libro no es tuyo")
  const ctx = await getAppContext()
  if (!ctx.books.some((b) => b.id === bookId)) throw new Error("Ese libro no es tuyo")
  const store = await cookies()
  store.set(BOOK_COOKIE, bookId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 })
  const sb = await supabaseServer()
  await sb.from("profiles").update({ last_book_id: bookId }).eq("id", ctx.user.id)
}

export async function createBook(nombreIn: string, tipoIn: "personal" | "negocio" | "otro", iconIn: string) {
  const p = NewBook.safeParse({ nombre: nombreIn, tipo: tipoIn, icon: iconIn || "book" })
  if (!p.success) throw new Error(p.error.issues[0]?.message ?? "Datos inválidos")
  const { nombre, tipo, icon } = p.data
  const ctx = await getAppContext()
  const sb = await supabaseServer()
  const max = limitOf(ctx.plan, "libros")
  if (max !== undefined && ctx.books.filter((b) => b.household_id === ctx.household.id).length >= max)
    throw new Error(`Tu plan incluye ${max} libro(s) de cuentas. Cambia de plan para llevar también tu negocio o tus arriendos.`)
  const { data, error } = await sb.rpc("create_book", { p_household: ctx.household.id, p_nombre: nombre, p_tipo: tipo, p_icon: icon })
  if (error) throw new Error(/permiso/i.test(error.message) ? error.message : "No pudimos crear el libro. Intenta de nuevo.")
  await switchBook(data)
  return data
}
