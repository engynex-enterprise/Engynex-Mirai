"use server"

import { cookies } from "next/headers"
import { BOOK_COOKIE, getAppContext } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { z } from "zod"
import { limitOf } from "@/lib/plans"
import { serverAuthProvider } from "@/lib/auth/provider"
import { viaApi } from "@/lib/api/via"
import type { AppContext } from "@/lib/dal"

const NewBook = z.object({ nombre: z.string().trim().min(1, "Escribe el nombre del libro").max(60), tipo: z.enum(["personal", "negocio", "otro"]), icon: z.string().regex(/^[a-z0-9-]{1,40}$/) })

/**
 * v7 (V7-H4): ¿esta acción va por la API? Con AUTH_PROVIDER=mirai siempre (no hay sesión de Supabase); con Supabase,
 * solo con el interruptor `households` (apagado por defecto: lo de siempre).
 */
const viaApiFor = (ctx: AppContext) => serverAuthProvider() === "mirai" || viaApi(ctx.api, "households")
const api = async (ctx: AppContext) => (await import("@/lib/api/server")).serverApi(ctx.api)

/** Cambia el libro activo (cookie + último libro del perfil, para otros dispositivos). */
export async function switchBook(bookId: string) {
  if (typeof bookId !== "string") throw new Error("Ese libro no es tuyo")
  const ctx = await getAppContext()
  // Un libro recién creado (crear libro, ejemplo, aceptar invitación) todavía no está en el contexto de esta petición.
  if (!ctx.books.some((b) => b.id === bookId) && !viaApiFor(ctx)) throw new Error("Ese libro no es tuyo")
  if (viaApiFor(ctx)) {
    // PUT /v1/me/active-book: 404 si el libro no es de la persona (la API lo revisa con sus membresías al día).
    const res = await (await api(ctx)).me.setActiveBook({ body: { bookId } })
    if (res.status !== 200) throw new Error("Ese libro no es tuyo")
  }
  const store = await cookies()
  store.set(BOOK_COOKIE, bookId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 })
  if (viaApiFor(ctx)) return
  // Modo heredado: Supabase directo.
  const sb = await supabaseServer()
  await sb.from("profiles").update({ last_book_id: bookId }).eq("id", ctx.user.id)
}

export async function createBook(nombreIn: string, tipoIn: "personal" | "negocio" | "otro", iconIn: string) {
  const p = NewBook.safeParse({ nombre: nombreIn, tipo: tipoIn, icon: iconIn || "book" })
  if (!p.success) throw new Error(p.error.issues[0]?.message ?? "Datos inválidos")
  const { nombre, tipo, icon } = p.data
  const ctx = await getAppContext()
  const max = limitOf(ctx.plan, "libros")
  if (max !== undefined && ctx.books.filter((b) => b.household_id === ctx.household.id).length >= max)
    throw new Error(`Tu plan incluye ${max} libro(s) de cuentas. Cambia de plan para llevar también tu negocio o tus arriendos.`)
  if (viaApiFor(ctx)) {
    // POST /v1/books (límite del plan y permiso en la API; queda como último libro del perfil).
    const { unwrapData } = await import("@/lib/api/server")
    let bookId: string
    try {
      bookId = unwrapData(await (await api(ctx)).books.create({ body: { householdId: ctx.household.id, nombre, tipo, icon } })).bookId
    } catch (e) {
      throw new Error(e instanceof Error && e.message ? e.message : "No pudimos crear el libro. Intenta de nuevo.")
    }
    await switchBook(bookId)
    return bookId
  }
  // Modo heredado: RPC create_book con Supabase directo.
  const sb = await supabaseServer()
  const { data, error } = await sb.rpc("create_book", { p_household: ctx.household.id, p_nombre: nombre, p_tipo: tipo, p_icon: icon })
  if (error) throw new Error(/permiso/i.test(error.message) ? error.message : "No pudimos crear el libro. Intenta de nuevo.")
  await switchBook(data)
  return data
}
