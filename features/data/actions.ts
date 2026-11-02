"use server"

import { z } from "zod"
import { cookies } from "next/headers"
import { BOOK_COOKIE, getAppContext, requireCan, requireRole } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { dumpBook, restoreDump, saveBackup, type BookDump } from "./backup"
import { purgeHouseholdFiles, purgeUserFiles } from "./purge"

// Respaldos y exportaciones del libro completo: solo Dueño y Administra (permiso "ajustes", Ley 1581).

/** Descargar respaldo del libro activo (JSON). */
export async function exportBookJson() {
  const ctx = await requireCan("ajustes")
  return JSON.stringify(await dumpBook(ctx.book.id), null, 1)
}

export async function createBackup() {
  const ctx = await requireCan("ajustes")
  await saveBackup(ctx.book.id, "manual", ctx.user.id)
}

export async function backupUrl(id: string) {
  const ctx = await requireCan("ajustes")
  if (!z.uuid().safeParse(id).success) throw new Error("Respaldo no encontrado")
  const db = supabaseAdmin()
  const { data } = await db.from("backups").select("path").eq("id", id).eq("book_id", ctx.book.id).single()
  if (!data) throw new Error("Respaldo no encontrado")
  const { data: s } = await db.storage.from("backups").createSignedUrl(data.path, 120, { download: true })
  return s?.signedUrl ?? null
}

export async function restoreBackup(id: string) {
  const ctx = await requireRole("admin")
  const db = supabaseAdmin()
  const { data } = await db.from("backups").select("path").eq("id", id).eq("book_id", ctx.book.id).single()
  if (!data) throw new Error("Respaldo no encontrado")
  const { data: file, error } = await db.storage.from("backups").download(data.path)
  if (error || !file) throw new Error("No se pudo leer el respaldo")
  await restoreDump(ctx.book.id, JSON.parse(await file.text()) as BookDump, ctx.user.id)
}

export async function restoreFromJson(json: string) {
  const ctx = await requireRole("admin")
  let dump: BookDump
  try { dump = JSON.parse(json) } catch { throw new Error("El archivo no es un JSON válido") }
  await restoreDump(ctx.book.id, dump, ctx.user.id)
}

export async function deleteBackup(id: string) {
  const ctx = await requireRole("admin")
  const db = supabaseAdmin()
  const { data } = await db.from("backups").select("path").eq("id", id).eq("book_id", ctx.book.id).single()
  if (!data) return
  await db.storage.from("backups").remove([data.path])
  await db.from("backups").delete().eq("id", id).eq("book_id", ctx.book.id)
}

const BLOCKS: Record<string, string[]> = {
  gastos: ["expenses", "card_purchases"], ingresos: ["incomes", "extra_incomes"], fijos: ["fixed_expenses", "subscriptions"],
  prestamos: ["loans"], contactos: ["contacts"], inversiones: ["investments"], balance: ["assets", "liabilities", "credit_cards"],
  metas: ["goals", "savings_challenges"], consejos: ["advisor_consultations"], calendario: ["calendar_events"],
}

/** "Formatear" por bloques: envía a la papelera (borrado lógico) lo elegido. Requiere escribir BORRAR. */
export async function formatBlocks(blocks: string[], confirm: string) {
  if (!Array.isArray(blocks) || typeof confirm !== "string" || confirm.trim().toUpperCase() !== "BORRAR") throw new Error("Escribe BORRAR para confirmar")
  const ctx = await requireRole("admin")
  await saveBackup(ctx.book.id, "antes_restaurar", ctx.user.id)
  const db = supabaseAdmin()
  const now = new Date().toISOString()
  for (const b of blocks) for (const t of BLOCKS[b] ?? []) await db.from(t as never).update({ deleted_at: now } as never).eq("book_id" as never, ctx.book.id as never).is("deleted_at" as never, null)
}

/** Ley 1581 (derecho de acceso): todos los datos personales del usuario. */
export async function exportMyData() {
  const ctx = await getAppContext()
  const db = supabaseAdmin()
  const [profile, prefs, consents, memberships, rules, push, tg] = await Promise.all([
    db.from("profiles").select("*").eq("id", ctx.user.id).single(),
    db.from("user_preferences").select("*").eq("user_id", ctx.user.id).maybeSingle(),
    db.from("consents").select("*").eq("user_id", ctx.user.id),
    db.from("household_members").select("household_id,role,created_at").eq("user_id", ctx.user.id),
    db.from("notification_rules").select("*").eq("user_id", ctx.user.id),
    db.from("push_subscriptions").select("user_agent,created_at").eq("user_id", ctx.user.id),
    db.from("telegram_links").select("linked_at").eq("user_id", ctx.user.id).maybeSingle(),
  ])
  // Libros completos solo de los hogares donde es Dueño o Administra; en los demás, los movimientos que registró.
  const full = new Set(ctx.households.filter((h) => h.access === "owner" || h.access === "admin").map((h) => h.id))
  const books: unknown[] = []
  for (const b of ctx.books) {
    if (full.has(b.household_id)) { books.push(await dumpBook(b.id)); continue }
    const [g, i, e] = await Promise.all([
      db.from("expenses").select("*").eq("book_id", b.id).eq("created_by", ctx.user.id),
      db.from("incomes").select("*").eq("book_id", b.id).eq("created_by", ctx.user.id),
      db.from("extra_incomes").select("*").eq("book_id", b.id).eq("created_by", ctx.user.id),
    ])
    books.push({ book_id: b.id, nombre: b.nombre, solo_mis_registros: true, data: { expenses: g.data ?? [], incomes: i.data ?? [], extra_incomes: e.data ?? [] } })
  }
  return JSON.stringify({ exportado: new Date().toISOString(), cuenta: { email: ctx.user.email }, perfil: profile.data, preferencias: prefs.data, consentimientos: consents.data, hogares: memberships.data, avisos: rules.data, dispositivos_push: push.data, telegram: tg.data, libros: books }, null, 1)
}

const DelSchema = z.object({ confirm: z.string() })
/**
 * Ley 1581 (supresión): elimina la cuenta y los hogares en los que es la única persona. Si es dueño de un hogar con
 * más personas con cuenta, primero debe pasárselo a alguien o borrarlo (Ajustes › Tu cuenta): así nadie se queda con
 * un hogar sin dueño ni con un dueño que no escogió. Devuelve { ok, msg } (en producción Next oculta los throw).
 */
export async function deleteAccount(input: { confirm: string }): Promise<{ ok: boolean; msg: string; hogares?: string[] }> {
  const p = DelSchema.safeParse(input)
  if (!p.success) return { ok: false, msg: "Escribe tu correo exactamente para confirmar" }
  const ctx = await getAppContext()
  if (p.data.confirm.trim().toLowerCase() !== ctx.user.email.toLowerCase()) return { ok: false, msg: "Escribe tu correo exactamente para confirmar" }
  const db = supabaseAdmin()
  const { data: mine } = await db.from("household_members").select("household_id,role,access_role").eq("user_id", ctx.user.id)
  const ids = (mine ?? []).map((m) => m.household_id)
  const { data: all } = ids.length ? await db.from("household_members").select("household_id,user_id").in("household_id", ids) : { data: [] }
  const others = (h: string) => (all ?? []).filter((m) => m.household_id === h && m.user_id !== ctx.user.id)
  const bloquean = (mine ?? []).filter((m) => (m.access_role ?? m.role) === "owner" && others(m.household_id).length > 0).map((m) => ctx.households.find((h) => h.id === m.household_id)?.nombre ?? "Hogar")
  if (bloquean.length) return { ok: false, hogares: bloquean, msg: `Eres el dueño de ${bloquean.map((n) => `“${n}”`).join(", ")} y hay más personas. Pásale el hogar a alguien o bórralo en Ajustes › Tu cuenta antes de eliminar tu cuenta.` }
  for (const m of mine ?? []) {
    if (others(m.household_id).length) continue
    await purgeHouseholdFiles(m.household_id)
    await db.from("households").delete().eq("id", m.household_id)
  }
  await purgeUserFiles(ctx.user.id).catch(() => 0)
  const { error } = await db.auth.admin.deleteUser(ctx.user.id)
  if (error) return { ok: false, msg: "No pudimos eliminar tu cuenta. Intenta de nuevo o escríbenos." }
  ;(await cookies()).delete(BOOK_COOKIE)
  return { ok: true, msg: "Eliminamos tu cuenta." }
}
