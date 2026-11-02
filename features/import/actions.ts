"use server"

import { cookies } from "next/headers"
import { BOOK_COOKIE, getAppContext, requireRole } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import SAMPLE from "@/lib/data/sample-v4.json"
import { importV4, shiftDates, type ImportReport } from "./v4"
import { can } from "@/lib/plans"

const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 864e5)
const todayCO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())

/** "Ver un ejemplo": crea un libro aparte con los datos de la familia Navarro (fechas al día) y cambia a él. */
export async function loadSampleBook(): Promise<{ bookId: string; report: ImportReport }> {
  const ctx = await requireRole("editor")
  const sb = await supabaseServer()
  const { data: bookId, error } = await sb.rpc("create_book", { p_household: ctx.household.id, p_nombre: "Ejemplo · familia Navarro", p_tipo: "otro", p_icon: "sparkles" })
  if (error) throw new Error(error.message)
  await sb.from("books").update({ sample: true }).eq("id", bookId)
  const S = shiftDates((SAMPLE as { S: unknown }).S, daysBetween((SAMPLE as { ref: string }).ref, todayCO()))
  const report = await importV4(sb, bookId, ctx.household.id, S)
  ;(await cookies()).set(BOOK_COOKIE, bookId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 })
  return { bookId, report }
}

/** Importa un respaldo JSON de Mirai 4.0 (o el contenido de localStorage) al libro activo. */
export async function importV4Backup(json: string): Promise<ImportReport> {
  const ctx = await requireRole("editor")
  let S: unknown
  try { S = JSON.parse(json) } catch { throw new Error("El archivo no es un JSON válido") }
  const st = (S as { S?: unknown; v?: number })?.v === 3 ? S : (S as { S?: unknown })?.S
  if (!st || typeof st !== "object" || !("cfg" in (st as object))) throw new Error("No parece un respaldo de Mirai 4.0")
  const sb = await supabaseServer()
  // El respaldo sirve en todos los planes. Si la base exige el plan (platform_settings.premium_db), las partes de
  // funciones que el plan no incluye se dejan por fuera para que el resto entre completo.
  const { data: ps } = await sb.from("platform_settings").select("premium_db").maybeSingle()
  const data = { ...(st as Record<string, unknown>) }
  if ((ps as { premium_db?: boolean } | null)?.premium_db) {
    if (!can(ctx.plan, "familia")) { delete data.grupos; delete data.kids }
    if (!can(ctx.plan, "impuestos")) { delete data.renta; delete data.bienes }
  }
  return importV4(sb, ctx.book.id, ctx.household.id, data)
}

export async function currentBook() {
  return (await getAppContext()).book
}
