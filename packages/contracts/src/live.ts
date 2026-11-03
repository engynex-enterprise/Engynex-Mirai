// Tablas que se sincronizan en vivo (§2.8). Fuente única para el cliente (hooks/use-realtime.ts), el futuro gateway
// de WebSocket y la migración que genere el trigger mirai_live_notify.
// Supabase Realtime: cada tabla debe estar también en la publicación supabase_realtime (migración).

/** Tablas del libro (filtro por `book_id`). */
export const LIVE_TABLES = [
  "book_settings", "categories", "income_categories", "entities", "payment_methods", "keyword_rules",
  "incomes", "extra_incomes", "fixed_expenses", "expenses", "fixed_expense_payments", "subscriptions",
  "credit_cards", "card_purchases", "card_payments", "contacts", "loans", "loan_payments", "assets", "liabilities",
  "investments", "goals", "emergency_funds", "fund_movements", "calendar_events", "shared_groups",
  "shared_group_expenses", "allowances", "allowance_movements", "savings_challenges", "tax_years",
  "tax_assets", "attachments", "accountant_notes", "advisor_consultations", "gami_badges", "wishlist", "net_worth_snapshots",
  "automations", "automation_runs", "providers", "goal_movements",
] as const
export type LiveTable = (typeof LIVE_TABLES)[number]

/**
 * Tablas del hogar (filtro por `household_id`): integrantes de la familia y personas con acceso. Al cambiar se
 * refresca todo lo del hogar (["h", hogar]) y lo que las usa en el libro (dependientes de la renta, por miembro…).
 */
export const HOUSEHOLD_TABLES = ["family_members", "household_members"] as const
export type HouseholdTable = (typeof HOUSEHOLD_TABLES)[number]

/** Cambio que emite el gateway (o Postgres Changes, traducido) para invalidar la caché del cliente. */
export type LiveChange = { table: LiveTable | HouseholdTable; bookId?: string; householdId?: string; id?: string; op: "INSERT" | "UPDATE" | "DELETE" }

export const isLiveTable = (t: string): t is LiveTable => (LIVE_TABLES as readonly string[]).includes(t)
