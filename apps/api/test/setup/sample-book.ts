// Libro de ejemplo de la v4 (apps/web/lib/data/sample-v4.json, familia Navarro) en la forma de las partes del libro
// (filas de Supabase, como las devuelve loadBookPart) para las pruebas de paridad de F2-C. Sin base: los dobles de los
// repositorios devuelven estas filas.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { bookOf } from "@mirai/domain/__tests__/adapt"
import type { BookParts } from "@mirai/domain/book-data"
import type { ExtrasRows } from "@mirai/domain/integral-extras"
import type { RentaCalcRows } from "../../src/modules/insights/insights.repository"

const sample = JSON.parse(readFileSync(join(__dirname, "../../../web/lib/data/sample-v4.json"), "utf8")) as { ref: string; S: Record<string, unknown> }

/** "Hoy" del libro de ejemplo (sus fechas son relativas a este día). */
export const SAMPLE_HOY = sample.ref

const MEMBERS = [
  { id: "baqdku8l", nombre: "Alberto", rol: "Titular", es_titular: true, sort: 0 },
  { id: "7q20mgwd", nombre: "Cónyuge", rol: "Cónyuge", es_titular: false, sort: 1 },
  { id: "0jvlxoct", nombre: "Hija", rol: "Hija", es_titular: false, sort: 2 },
]

/** Las partes del libro (BOOK_PARTS) del ejemplo, con hijos embebidos y algunas filas borradas que deben ignorarse. */
export function sampleParts(bookId: string): BookParts {
  const b = bookOf(sample.S)
  const row = <T extends object>(x: T) => ({ ...x, book_id: bookId, deleted_at: null })
  return {
    book_settings: [{ ...b.settings, book_id: bookId, nomina: {}, gami: true }],
    categories: b.categories.map(row),
    incomes: b.incomes.map((i) => row({ ...i, activo: true })),
    extra_incomes: b.extraIncomes.map(row),
    expenses: b.expenses.map(row),
    fixed_expenses: b.fixedExpenses.map(({ payments, ...f }) => row({ ...f, fixed_expense_payments: [...payments.map((p, i) => ({ id: `fp-${f.id}-${i}`, ...p, deleted_at: null })), { id: `fp-${f.id}-x`, periodo: "2000-01", fecha: "2000-01-01", valor: 1, deleted_at: "2026-01-01" }] })),
    subscriptions: b.subscriptions.map((s) => row({ ...s, activa: true })),
    loans: b.loans.map(({ payments, ...l }) => row({ ...l, loan_payments: payments.map((p) => ({ ...p, deleted_at: null })) })),
    credit_cards: b.creditCards.map(({ purchases, ...c }) => row({ ...c, card_purchases: purchases.map((p) => ({ ...p, deleted_at: null })), card_payments: [] })),
    assets: b.assets.map(row),
    liabilities: b.liabilities.map(row),
    investments: b.investments.map(row),
    goals: b.goals.map(row),
    calendar_events: b.calendarEvents.map((c) => row({ ...c, anual: true, template_key: /renta/i.test(c.titulo) ? "renta" : null })),
    contacts: b.contacts.map(row),
    entities: b.entities.map(row),
    payment_methods: [],
    goal_movements: [],
    emergency_funds: [{ book_id: bookId, activo: true, saldo: 1_500_000, asset_id: null }],
  } as unknown as BookParts
}

/** Extras del flujo integral del ejemplo: una casa y un carro (predial y vehicular), una mesada y el fondo. */
export const sampleExtras = (): Omit<ExtrasRows, "renta"> => ({
  taxAssets: [
    { tipo: "inmueble", avaluo: "280000000", predial: null, imp_veh: null, soat: null, pct: "100" },
    { tipo: "vehiculo", avaluo: "52000000", predial: null, imp_veh: "780000", soat: "650000", pct: "100" },
  ],
  incCats: [],
  allowances: [{ id: "al-1", member_id: "0jvlxoct", mesada: "40000", frec: "semanal" }],
  movs: [{ allowance_id: "al-1", fecha: "2026-10-24", valor: "40000" }],
  fondo: [{ fecha: "2026-10-05", valor: "200000", tipo: "aporte", expense_id: null }],
  members: MEMBERS.map(({ id, nombre }) => ({ id, nombre })),
})

/** Lo que necesita calcRenta (la renta del calendario sin valor se estima con la Declaración). */
export const sampleRenta = (): RentaCalcRows => ({
  members: MEMBERS,
  incomeCategories: [],
  bienes: [{ id: "ta-1", tipo: "inmueble", nombre: "Casa", costo: "180000000", avaluo: "280000000", valor31: "280000000", pct: "100", predial: null, imp_veh: null, soat: null }],
  years: [],
  // Sin valores de ref_*: los cálculos usan las constantes oficiales del código (nunca se inventan valores aquí).
  ref: { uvt: {}, smmlv: {} },
})
