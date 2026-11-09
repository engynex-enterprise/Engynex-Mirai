// Arma el libro en la forma de los cálculos (BookData + medios, abonos y fondo). Puro: no sabe de dónde salen las
// filas. Quien carga (Supabase en apps/web/lib/book-data.ts, la API más adelante) pasa un `BookPartLoader`.
import type { BookData, SettingsIn } from "./types"
import { conSaldos, type FondoIn, type GoalMovIn, type MedioIn } from "./cuentas"

const alive = <T extends { deleted_at?: string | null }>(rows: T[] | null | undefined) => (rows ?? []).filter((r) => !r.deleted_at)
const num = (v: unknown) => Number(v ?? 0)

/**
 * El libro armado. Además de `BookData` trae los medios de pago (con la cuenta a la que están ligados), los abonos a
 * metas y el fondo de emergencia: con eso las cuentas con saldo automático llegan ya con el saldo de hoy en `valor`
 * (cuentas.ts) y el flujo integral cuenta los abonos como ahorro.
 */
export type LoadedBook = BookData & { raw: { settings: Record<string, unknown> }; paymentMethods: MedioIn[]; goalMovements: GoalMovIn[]; fund: FondoIn | null }

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
  credit_cards: { select: "*, card_purchases(*), card_payments(*)", deps: ["card_purchases", "card_payments"] },
  assets: { select: "*", deps: [] },
  liabilities: { select: "*", deps: [] },
  investments: { select: "*", deps: [] },
  goals: { select: "*", deps: [] },
  calendar_events: { select: "*", deps: [] },
  contacts: { select: "*", deps: [] },
  entities: { select: "*", deps: [] },
  payment_methods: { select: "*", deps: [] },
  goal_movements: { select: "*", deps: [] },
  emergency_funds: { select: "*", deps: [] },
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

/** Partes de una sola fila por libro y sin borrado lógico (el cargador no filtra `deleted_at` en ellas). */
export const SINGLE_ROW_PARTS: readonly string[] = ["book_settings", "emergency_funds"]

/**
 * Puerto del cargador: devuelve las filas vivas de UNA parte del libro (con los hijos embebidos de `BOOK_PARTS[part].select`).
 * `book_settings` debe fallar si no hay fila; `book_settings` y `emergency_funds` devuelven un arreglo de una fila (o vacío).
 */
export type BookPartLoader = (part: BookPart) => Promise<PartRows>

const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())

/**
 * Arma el libro en la forma de lib/domain a partir de sus partes (sirve en navegador y servidor). `today` es para el
 * saldo de las cuentas que lo llevan solas (por defecto, hoy en Colombia).
 */
export function assembleBook(p: BookParts, today: string = hoyBogota()): LoadedBook {
  const s = p.book_settings[0]
  const st: SettingsIn = {
    umbral: num(s.umbral), limite: num(s.limite), trm: s.trm as Record<string, number>, pct: s.pct as SettingsIn["pct"],
    emerg_meta: s.emerg_meta, anticipo: s.anticipo, corte_q: s.corte_q, alerta_pres: s.alerta_pres,
    notif: s.notif as SettingsIn["notif"], uvt: s.uvt as Record<string, number>, smmlv: s.smmlv as Record<string, number>, nomina: (s.nomina ?? {}) as SettingsIn["nomina"],
    meta: String(s.meta ?? ""), meta_cfg: s.meta_cfg ?? null,
  }
  const f = (p.emergency_funds ?? [])[0]
  return conSaldos({
    raw: { settings: s as Record<string, unknown> },
    settings: st,
    categories: p.categories,
    incomes: p.incomes.filter((i) => i.activo !== false),
    extraIncomes: p.extra_incomes,
    expenses: p.expenses,
    fixedExpenses: p.fixed_expenses.map((f) => ({ ...f, payments: alive(f.fixed_expense_payments) })),
    subscriptions: p.subscriptions.filter((x) => x.activa !== false && x.proximo),
    loans: p.loans.map((l) => ({ ...l, extra: num(l.extra), payments: alive(l.loan_payments) })),
    creditCards: p.credit_cards.map((c) => ({ ...c, cupo: num(c.cupo), purchases: alive(c.card_purchases), ...(c.card_payments ? { pagos: alive(c.card_payments) } : {}) })),
    assets: p.assets,
    liabilities: p.liabilities,
    investments: p.investments,
    goals: p.goals,
    calendarEvents: p.calendar_events,
    contacts: p.contacts,
    entities: p.entities,
    paymentMethods: p.payment_methods ?? [],
    goalMovements: (p.goal_movements ?? []).map((m) => ({ ...m, valor: num(m.valor) })),
    fund: f ? { activo: !!f.activo, saldo: num(f.saldo), asset_id: f.asset_id ?? null } : null,
  }, today)
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Carga todo el libro con el cargador dado (una consulta por parte, en paralelo) y lo arma. */
export async function loadBookDataWith(load: BookPartLoader): Promise<LoadedBook> {
  const rows = await Promise.all(BOOK_PART_NAMES.map((p) => load(p)))
  return assembleBook(Object.fromEntries(BOOK_PART_NAMES.map((p, i) => [p, rows[i]])) as BookParts)
}
