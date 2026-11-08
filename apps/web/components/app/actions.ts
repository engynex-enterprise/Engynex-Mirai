"use server"

import { cookies } from "next/headers"
import { BOOK_COOKIE, getAppContext } from "@/lib/dal"
import { z } from "zod"
import { limitOf } from "@/lib/plans"
import { serverApi, unwrapData } from "@/lib/api/server"

const NewBook = z.object({ nombre: z.string().trim().min(1, "Escribe el nombre del libro").max(60), tipo: z.enum(["personal", "negocio", "otro"]), icon: z.string().regex(/^[a-z0-9-]{1,40}$/) })

/** Cambia el libro activo (cookie + último libro del perfil, para otros dispositivos). */
export async function switchBook(bookId: string) {
  if (typeof bookId !== "string") throw new Error("Ese libro no es tuyo")
  // PUT /v1/me/active-book: 404 si el libro no es de la persona (la API lo revisa con sus membresías al día, así que
  // sirve también para un libro recién creado que todavía no está en el contexto de esta petición).
  const res = await serverApi().me.setActiveBook({ body: { bookId } })
  if (res.status !== 200) throw new Error("Ese libro no es tuyo")
  const store = await cookies()
  store.set(BOOK_COOKIE, bookId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 })
}

export async function createBook(nombreIn: string, tipoIn: "personal" | "negocio" | "otro", iconIn: string) {
  const p = NewBook.safeParse({ nombre: nombreIn, tipo: tipoIn, icon: iconIn || "book" })
  if (!p.success) throw new Error(p.error.issues[0]?.message ?? "Datos inválidos")
  const { nombre, tipo, icon } = p.data
  const ctx = await getAppContext()
  const max = limitOf(ctx.plan, "libros")
  if (max !== undefined && ctx.books.filter((b) => b.household_id === ctx.household.id).length >= max)
    throw new Error(`Tu plan incluye ${max} libro(s) de cuentas. Cambia de plan para llevar también tu negocio o tus arriendos.`)
  // POST /v1/books (límite del plan y permiso en la API; queda como último libro del perfil).
  let bookId: string
  try {
    bookId = unwrapData(await serverApi().books.create({ body: { householdId: ctx.household.id, nombre, tipo, icon } })).bookId
  } catch (e) {
    throw new Error(e instanceof Error && e.message ? e.message : "No pudimos crear el libro. Intenta de nuevo.")
  }
  await switchBook(bookId)
  return bookId
}
