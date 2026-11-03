// Columnas jsonb de la base (tabla.columna), sacadas de packages/db/src/database.types.ts (tipo `Json`). `pg`
// convierte un arreglo JS en un arreglo de Postgres, así que en estas columnas los objetos y arreglos viajan como texto
// JSON (en las columnas text[] el arreglo va tal cual). Si se agrega una columna jsonb, súmala aquí (lo revisa
// row-store.test.ts contra los tipos).
export const JSON_COLUMNS: ReadonlySet<string> = new Set([
  "account_events.detail", "admin_audit.detalle", "ads.media", "advisor_consultations.payload", "ai_cache.result", "audit_log.cambios",
  "automation_events.datos", "automation_runs.evento", "automation_runs.pasos", "automation_runs.pendientes", "automations.grafo",
  "book_settings.apps", "book_settings.defaults", "book_settings.ia", "book_settings.nomina", "book_settings.notif", "book_settings.pct",
  "book_settings.setup", "book_settings.smmlv", "book_settings.trm", "book_settings.uvt", "chat_messages.adjuntos", "chat_messages.meta",
  "contacts.direccion", "expenses.aporte", "feedback.contexto", "fixed_expenses.reparto", "household_invitations.last_result",
  "incomes.deducciones", "incomes.reparto", "integrations.config", "integrations.meta", "loans.prenda", "monthly_summaries.contenido",
  "notification_outbox.payload", "notification_rules.canales", "notification_rules.last_sent", "notification_rules.matriz",
  "notification_rules.notif", "notification_rules.silencio", "plan_payments.raw", "plans.limites", "platform_integrations.config",
  "platform_integrations.meta", "platform_settings.ia_precios", "profiles.cobro", "profiles.direccion", "ref_fiscal_templates.data",
  "savings_challenges.marcas", "tax_years.ded", "tax_years.docs", "tax_years.ing", "user_preferences.calendar_prefs",
  "user_preferences.chat_pos", "user_preferences.extra", "user_preferences.nav_open",
])
