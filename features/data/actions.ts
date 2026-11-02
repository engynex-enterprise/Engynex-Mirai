"use server"

import { z } from "zod"
import { cookies } from "next/headers"
import { BOOK_COOKIE, getAppContext, requireRole } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { dumpBook, restoreDump, saveBackup, type BookDump } from "./backup"

/** Descargar respaldo del libro activo (JSON). */
export async function exportBookJson() {
  const ctx = await requireRole("viewer")
  return JSON.stringify(await dumpBook(ctx.book.id), null, 1)
}

export async function createBackup() {
  const ctx = await requireRole("editor")
  await saveBackup(ctx.book.id, "manual", ctx.user.id)
}

export async function backupUrl(id: string) {
  const ctx = await requireRole("viewer")
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
  if (data) await db.storage.from("backups").remove([data.path])
  await db.from("backups").delete().eq("id", id)
}

const BLOCKS: Record<string, string[]> = {
  gastos: ["expenses", "card_purchases"], ingresos: ["incomes", "extra_incomes"], fijos: ["fixed_expenses", "subscriptions"],
  prestamos: ["loans"], contactos: ["contacts"], inversiones: ["investments"], balance: ["assets", "liabilities", "credit_cards"],
  metas: ["goals", "savings_challenges"], consejos: ["advisor_consultations"], calendario: ["calendar_events"],
}

/** "Formatear" por bloques: envía a la papelera (borrado lógico) lo elegido. Requiere escribir BORRAR. */
export async function formatBlocks(blocks: string[], confirm: string) {
  if (confirm.trim().toUpperCase() !== "BORRAR") throw new Error("Escribe BORRAR para confirmar")
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
  const books = []
  for (const b of ctx.books) books.push(await dumpBook(b.id))
  return JSON.stringify({ exportado: new Date().toISOString(), cuenta: { email: ctx.user.email }, perfil: profile.data, preferencias: prefs.data, consentimientos: consents.data, hogares: memberships.data, avisos: rules.data, dispositivos_push: push.data, telegram: tg.data, libros: books }, null, 1)
}

const DelSchema = z.object({ confirm: z.string() })
/** Ley 1581 (supresión): elimina la cuenta y los hogares en los que es la única persona. */
export async function deleteAccount(input: { confirm: string }) {
  const { confirm } = DelSchema.parse(input)
  const ctx = await getAppContext()
  if (confirm.trim().toLowerCase() !== ctx.user.email.toLowerCase()) throw new Error("Escribe tu correo exactamente para confirmar")
  const db = supabaseAdmin()
  const { data: mine } = await db.from("household_members").select("household_id").eq("user_id", ctx.user.id)
  for (const m of mine ?? []) {
    const { data: others } = await db.from("household_members").select("user_id,role").eq("household_id", m.household_id).neq("user_id", ctx.user.id)
    if (!others?.length) {
      const { data: bs } = await db.from("books").select("id").eq("household_id", m.household_id)
      for (const b of bs ?? []) {
        for (const bucket of ["attachments", "backups", "logos"]) {
          const { data: files } = await db.storage.from(bucket).list(b.id, { limit: 1000 })
          if (files?.length) await db.storage.from(bucket).remove(files.map((f) => `${b.id}/${f.name}`))
        }
      }
      await db.from("households").delete().eq("id", m.household_id)
    } else if (!others.some((o) => o.role === "owner")) {
      // Si se va el único dueño, el miembro más antiguo queda como dueño.
      await db.from("household_members").update({ role: "owner" }).eq("household_id", m.household_id).eq("user_id", others[0].user_id)
    }
  }
  const { error } = await db.auth.admin.deleteUser(ctx.user.id)
  if (error) throw new Error(error.message)
  ;(await cookies()).delete(BOOK_COOKIE)
}
