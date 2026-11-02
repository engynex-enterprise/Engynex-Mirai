import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"

/** Tablas del libro en orden de inserción (padres antes que hijos). */
export const BOOK_TABLES = [
  "categories", "income_categories", "entities", "payment_methods", "contacts", "providers",
  "keyword_rules", "incomes", "extra_incomes", "fixed_expenses", "subscriptions", "credit_cards", "loans",
  "assets", "liabilities", "investments", "goals", "emergency_funds", "calendar_events", "shared_groups",
  "allowances", "savings_challenges", "tax_years", "advisor_consultations", "monthly_summaries",
  "expenses", "fixed_expense_payments", "card_purchases", "loan_payments", "fund_movements",
  "shared_group_expenses", "allowance_movements", "tax_assets",
] as const

export type BookDump = { app: "mirai"; v: 5; book_id: string; household_id: string; nombre: string; fecha: string; settings: Record<string, unknown>; data: Record<string, Record<string, unknown>[]> }

/** Copia completa del libro (incluye registros en la papelera para poder recuperarlos). */
export async function dumpBook(bookId: string): Promise<BookDump> {
  const db = supabaseAdmin()
  const { data: book } = await db.from("books").select("id,household_id,nombre").eq("id", bookId).single()
  const { data: settings } = await db.from("book_settings").select("*").eq("book_id", bookId).single()
  const data: BookDump["data"] = {}
  for (const t of BOOK_TABLES) {
    const all: Record<string, unknown>[] = []
    for (let from = 0; ; from += 1000) {
      const { data: rows, error } = await db.from(t as never).select("*").eq("book_id" as never, bookId as never).range(from, from + 999)
      if (error) throw new Error(`${t}: ${error.message}`)
      all.push(...((rows ?? []) as Record<string, unknown>[]))
      if (!rows || rows.length < 1000) break
    }
    data[t] = all
  }
  return { app: "mirai", v: 5, book_id: bookId, household_id: book!.household_id, nombre: book!.nombre, fecha: new Date().toISOString(), settings: settings as Record<string, unknown>, data }
}

/** Guarda un respaldo en Storage (bucket privado "backups") y lo registra. */
export async function saveBackup(bookId: string, tipo: "auto" | "manual" | "antes_restaurar" | "importado", userId?: string) {
  const db = supabaseAdmin()
  const dump = await dumpBook(bookId)
  const body = JSON.stringify(dump)
  const path = `${bookId}/${dump.fecha.replace(/[:.]/g, "-")}-${tipo}.json`
  const { error } = await db.storage.from("backups").upload(path, body, { contentType: "application/json", upsert: true })
  if (error) throw new Error(error.message)
  await db.from("backups").insert({ book_id: bookId, tipo, path, size: body.length, created_by: userId ?? null })
  return path
}

/** Reemplaza el contenido del libro por el del respaldo (hace antes un respaldo "antes de restaurar"). */
export async function restoreDump(bookId: string, dump: BookDump, userId: string) {
  if (dump?.app !== "mirai" || dump.v !== 5) throw new Error("No es un respaldo de Mirai 5. Para respaldos de la versión anterior usa Importar.")
  const db = supabaseAdmin()
  const { data: book } = await db.from("books").select("household_id").eq("id", bookId).single()
  if (book?.household_id !== dump.household_id) throw new Error("Este respaldo es de otro hogar. Para traer datos de otro hogar usa Importar.")
  await saveBackup(bookId, "antes_restaurar", userId)
  for (const t of [...BOOK_TABLES].reverse()) {
    const { error } = await db.from(t as never).delete().eq("book_id" as never, bookId as never)
    if (error) throw new Error(`${t}: ${error.message}`)
  }
  for (const t of BOOK_TABLES) {
    const rows = (dump.data[t] ?? []).map((r) => ({ ...r, book_id: bookId }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from(t as never).insert(rows.slice(i, i + 500) as never)
      if (error) throw new Error(`${t}: ${error.message}`)
    }
  }
  const { book_id: _b, updated_at: _u, ...settings } = dump.settings ?? {}
  if (Object.keys(settings).length) await db.from("book_settings").update(settings as never).eq("book_id", bookId)
}
