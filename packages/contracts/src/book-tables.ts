// Política del CRUD genérico del libro (§2.5, decisión D5). Una fila por tabla del libro con la forma estándar
// (`id`, `book_id`, `deleted_at`): la API la usa para `GET/PUT/DELETE /v1/books/:bookId/t/:table[/:id]` y el front para
// saber qué puede editar cada rol. `satisfies Record<BookTable, …>` hace que una tabla nueva rompa la compilación
// hasta que alguien decida su política.
//
// Propuesta inicial de F2-A: F2-C (lectura) y F2-D (escritura) la revisan contra la RLS de supabase/migrations y le
// agregan el esquema zod de cada tabla (`schema`, p. ej. `ExpenseUpsert`).
//
// Revisión de F2-D contra la RLS (2026-11-02), sin cambios en la tabla:
// - `write: "editor"` = políticas "crear/editar/borrar <t>" con is_book_member(book_id, 'editor') (20261031000200,
//   20261101000900, 20261103000300, 20261103000700, 20261103003100 y 20261103003200).
// - `own: true` (expenses, incomes, extra_incomes) = políticas "propios …" con created_by = auth.uid() y 'registra'
//   (20261103000900_hogar_roles.sql). La API pone `created_by` y nunca lo deja cambiar.
// - `feature` = políticas restrictivas "plan crear/editar <t>" (20261103003400, detrás de platform_settings.premium_db):
//   borrar (deleted_at) no exige el plan; crear, editar y restaurar sí.
// - accountant_notes: la RLS exige además autor = 'titular' y un acceso del mismo libro (el esquema fija el autor).
// - `system`: chat_threads/chat_messages (de cada persona, módulo chat), automation_runs (solo update de editor) y
//   monthly_summaries (la RLS deja a editor, pero solo los escribe el servidor): la API es más estricta que la base.
// El esquema zod de cada tabla está en ./book-table-schemas.ts (BOOK_TABLE_SCHEMAS).
import type { BookTable } from "@mirai/db/tables"
import type { AccessRole } from "@mirai/domain/household/roles"
import type { PremiumFeature } from "@mirai/domain/plans"

export type BookTablePolicy = {
  /** Rol mínimo para escribir, o "system" si solo escriben la base, el cron o un módulo (sin CRUD genérico). */
  write: AccessRole | "system"
  /** "Registra sus gastos" puede escribir sus propias filas (OWN_ROW_TABLES y canEditRow de @mirai/domain). */
  own: boolean
  /** Función Premium que exige (lib/plans: FEATURES), o null si es gratis. */
  feature: PremiumFeature | null
  /** Está en LIVE_TABLES (se sincroniza en vivo). */
  live: boolean
  /** Va en la copia de seguridad del libro (BOOK_TABLES, orden de inserción). */
  backup: boolean
  /** Se expone por el CRUD genérico (`/t/:table`). Si es false, solo por los comandos de su módulo. */
  generic: boolean
  /** Módulo de la API dueño de las reglas propias (§2.6). "book-tables" = solo CRUD genérico. */
  module: "book-tables" | "catalogs" | "expenses" | "incomes" | "fixed" | "cards" | "loans" | "savings" | "assets" | "tax" | "chat" | "automations" | "files" | "insights"
}

const p = (module: BookTablePolicy["module"], o: Partial<Omit<BookTablePolicy, "module">> = {}): BookTablePolicy => ({
  write: "editor", own: false, feature: null, live: true, backup: true, generic: true, module, ...o,
})

export const BOOK_TABLE_POLICY = {
  // Catálogos del libro
  categories: p("catalogs"),
  income_categories: p("catalogs"),
  entities: p("catalogs"),
  payment_methods: p("catalogs"),
  keyword_rules: p("catalogs"),
  providers: p("catalogs"),
  contacts: p("catalogs"),
  // Movimientos (los de "Registra sus gastos" solo editan los propios)
  expenses: p("expenses", { write: "registra", own: true }),
  incomes: p("incomes", { write: "registra", own: true }),
  extra_incomes: p("incomes", { write: "registra", own: true }),
  // Gastos fijos y suscripciones
  fixed_expenses: p("fixed"),
  fixed_expense_payments: p("fixed"),
  subscriptions: p("fixed"),
  // Tarjetas y préstamos
  credit_cards: p("cards"),
  card_purchases: p("cards"),
  card_payments: p("cards", { backup: false }),
  loans: p("loans"),
  loan_payments: p("loans"),
  // Ahorro: metas, fondo, retos, deseos, mesadas y gastos compartidos (estos dos, Premium "familia")
  goals: p("savings"),
  goal_movements: p("savings", { backup: false }),
  fund_movements: p("savings"),
  savings_challenges: p("savings"),
  wishlist: p("savings", { backup: false }),
  allowances: p("savings", { feature: "familia" }),
  allowance_movements: p("savings", { feature: "familia" }),
  shared_groups: p("savings", { feature: "familia" }),
  shared_group_expenses: p("savings", { feature: "familia" }),
  // Patrimonio
  assets: p("assets"),
  liabilities: p("assets"),
  investments: p("assets"),
  net_worth_snapshots: p("assets", { backup: false }),
  // Agenda
  calendar_events: p("book-tables"),
  // Impuestos y contador (Premium "impuestos")
  tax_years: p("tax", { feature: "impuestos" }),
  tax_assets: p("tax", { feature: "impuestos" }),
  accountant_notes: p("tax", { feature: "impuestos", backup: false }),
  // Archivos adjuntos (las URL firmadas van por el módulo files)
  attachments: p("files", { backup: false }),
  // Consejero, chat, automatizaciones y resúmenes
  advisor_consultations: p("chat"),
  chat_threads: p("chat", { write: "system", live: false, backup: false, generic: false }),
  chat_messages: p("chat", { write: "system", live: false, backup: false, generic: false }),
  automations: p("automations", { backup: false }),
  automation_runs: p("automations", { write: "system", backup: false, generic: false }),
  monthly_summaries: p("insights", { write: "system", live: false, generic: false }),
} as const satisfies Record<BookTable, BookTablePolicy>

export type PolicyTable = keyof typeof BOOK_TABLE_POLICY

/**
 * Tablas del libro en orden de inserción (padres antes que hijos) para la copia de seguridad y la restauración
 * (features/data/backup.ts). Coinciden con `backup: true` de la política.
 */
export const BOOK_TABLES = [
  "categories", "income_categories", "entities", "payment_methods", "contacts", "providers",
  "keyword_rules", "incomes", "extra_incomes", "fixed_expenses", "subscriptions", "credit_cards", "loans",
  "assets", "liabilities", "investments", "goals", "emergency_funds", "calendar_events", "shared_groups",
  "allowances", "savings_challenges", "tax_years", "advisor_consultations", "monthly_summaries",
  "expenses", "fixed_expense_payments", "card_purchases", "loan_payments", "fund_movements",
  "shared_group_expenses", "allowance_movements", "tax_assets",
] as const

/** ¿Se puede escribir por el CRUD genérico? (la API lo revisa antes de tocar la base; la RLS sigue activa). */
export const isGenericTable = (t: string): t is PolicyTable => t in BOOK_TABLE_POLICY && BOOK_TABLE_POLICY[t as PolicyTable].generic
