import type { SupabaseClient } from "@supabase/supabase-js"
import type { BookData, SettingsIn } from "@/lib/domain"
import type { Database } from "@/lib/supabase/database.types"

const alive = <T extends { deleted_at?: string | null }>(rows: T[] | null | undefined) => (rows ?? []).filter((r) => !r.deleted_at)
const num = (v: unknown) => Number(v ?? 0)

export type LoadedBook = BookData & { raw: { settings: Record<string, unknown> } }

/**
 * Partes del libro: cada una es UNA consulta y se guarda en caché por separado (features/book/use-book-data.ts).
 * Así, cambiar un gasto vuelve a pedir solo los gastos y no las 16 tablas del libro.
 * `deps`: tablas cuyo cambio obliga a recargar la parte (los hijos que viajan embebidos en el padre).
 */
export const BOOK_PARTS = {
  book_settings: { select: "*", deps: [] },
  categories: { select: "*", deps: [] },
  incomes: { select: "*", deps: [] },
  extra_incomes: { select: "*", deps: [] },
  expenses: { select: "*", deps: [] },
  fixed_expenses: { select: "*, fixed_expense_payments(*)", deps: ["fixed_expense_payments"] },
  subscriptions: { select: "*", deps: [] },
  loans: { select: "*, loan_payments(*)", deps: ["loan_payments"] },
  credit_cards: { select: "*, card_purchases(*)", deps: ["card_purchases"] },
  assets: { select: "*", deps: [] },
  liabilities: { select: "*", deps: [] },
  investments: { select: "*", deps: [] },
  goals: { select: "*", deps: [] },
  calendar_events: { select: "*", deps: [] },
  contacts: { select: "*", deps: [] },
  entities: { select: "*", deps: [] },
} as const satisfies Record<string, { select: string; deps: readonly string[] }>

export type BookPart = keyof typeof BOOK_PARTS
export const BOOK_PART_NAMES = Object.keys(BOOK_PARTS) as BookPart[]

/** Partes que hay que recargar cuando cambia una tabla (la propia y los padres que la embeben). */
export function partsForTable(table: string): BookPart[] {
  return BOOK_PART_NAMES.filter((p) => p === table || (BOOK_PARTS[p].deps as readonly string[]).includes(table))
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PartRows = any[]
export type BookParts = Record<BookPart, PartRows>

/** Una parte del libro (filas vivas). book_settings devuelve un arreglo de una fila. */
export async function loadBookPart(sb: SupabaseClient<Database>, bookId: string, part: BookPart, signal?: AbortSignal): Promise<PartRows> {
  let q = sb.from(part as never).select(BOOK_PARTS[part].select).eq("book_id" as never, bookId as never)
  if (part !== "book_settings") q = q.is("deleted_at" as never, null)
  if (signal) q = q.abortSignal(signal)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  if (part === "book_settings" && !data?.length) throw new Error("No encontramos los ajustes de este libro")
  return (data ?? []) as any[]
}

/** Arma el libro en la forma de lib/domain a partir de sus partes. Función pura (sirve en navegador y servidor). */
export function assembleBook(p: BookParts): LoadedBook {
  const s = p.book_settings[0]
  const st: SettingsIn = {
    umbral: num(s.umbral), limite: num(s.limite), trm: s.trm as Record<string, number>, pct: s.pct as SettingsIn["pct"],
    emerg_meta: s.emerg_meta, anticipo: s.anticipo, corte_q: s.corte_q, alerta_pres: s.alerta_pres,
    notif: s.notif as SettingsIn["notif"], uvt: s.uvt as Record<string, number>, smmlv: s.smmlv as Record<string, number>, nomina: (s.nomina ?? {}) as SettingsIn["nomina"],
  }
  return {
    raw: { settings: s as Record<string, unknown> },
    settings: st,
    categories: p.categories,
    incomes: p.incomes.filter((i) => i.activo !== false),
    extraIncomes: p.extra_incomes,
    expenses: p.expenses,
    fixedExpenses: p.fixed_expenses.map((f) => ({ ...f, payments: alive(f.fixed_expense_payments) })),
    subscriptions: p.subscriptions.filter((x) => x.activa !== false && x.proximo),
    loans: p.loans.map((l) => ({ ...l, extra: num(l.extra), payments: alive(l.loan_payments) })),
    creditCards: p.credit_cards.map((c) => ({ ...c, cupo: num(c.cupo), purchases: alive(c.card_purchases) })),
    assets: p.assets,
    liabilities: p.liabilities,
    investments: p.investments,
    goals: p.goals,
    calendarEvents: p.calendar_events,
    contacts: p.contacts,
    entities: p.entities,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Carga todo el libro en la forma que esperan los cálculos de lib/domain (16 consultas en paralelo). Navegador y servidor (cron, IA, reportes). */
export async function loadBookData(sb: SupabaseClient<Database>, bookId: string): Promise<LoadedBook> {
  const rows = await Promise.all(BOOK_PART_NAMES.map((p) => loadBookPart(sb, bookId, p)))
  return assembleBook(Object.fromEntries(BOOK_PART_NAMES.map((p, i) => [p, rows[i]])) as BookParts)
}
