// Columnas de cada tabla del CRUD genérico (§2.5) para la lectura de F2-C: `GET /v1/books/:bookId/t/:table` solo acepta
// en `select`, `order` y `eq.<campo>` columnas de esta lista blanca (nunca SQL ni nombres que lleguen del cliente sin
// revisar). Generada desde packages/db/src/database.types.ts; la prueba de tipos de abajo hace que una columna nueva o
// borrada en la base rompa la compilación hasta actualizar la lista (`pnpm db:types` y luego esta lista).
import type { Row } from "@mirai/db/tables"
import type { PolicyTable } from "./book-tables"

export const BOOK_TABLE_COLUMNS = {
  categories: ["book_id", "created_at", "created_by", "deleted_at", "grupo", "icon", "id", "nombre", "sort", "tope", "updated_at"],
  income_categories: ["book_id", "created_at", "created_by", "deleted_at", "icon", "id", "nombre", "sort", "updated_at"],
  entities: ["book_id", "created_at", "created_by", "deleted_at", "id", "logo_path", "nit", "nombre", "tipo", "updated_at"],
  payment_methods: ["asset_id", "book_id", "created_at", "created_by", "deleted_at", "icon", "id", "nombre", "sort", "updated_at"],
  keyword_rules: ["book_id", "category_id", "created_at", "created_by", "deleted_at", "id", "keyword", "updated_at"],
  providers: ["activo", "book_id", "brand", "category_id", "correo", "created_at", "created_by", "deleted_at", "icon", "id", "nit", "nombre", "notas", "payment_method_id", "referencia", "sitio_web", "telefono", "tipo", "updated_at"],
  contacts: ["avatar_path", "book_id", "ciudad", "created_at", "created_by", "deleted_at", "direccion", "doc", "doc_tipo", "email", "id", "nombre", "notas", "relacion", "telefono", "tipo", "updated_at"],
  expenses: ["aporte", "book_id", "cat_src", "category_id", "created_at", "created_by", "currency", "deducible", "deleted_at", "descripcion", "external_id", "fecha", "fixed_expense_id", "fondo_valor", "hormiga", "hormiga_razon", "hormiga_src", "id", "member_id", "member_ids", "nota", "origen", "payment_method_id", "periodo", "provider_id", "sub_proximo", "subscription_id", "updated_at", "valor"],
  incomes: ["activo", "book_id", "bruto", "category_id", "concepto", "created_at", "created_by", "currency", "deducciones", "deleted_at", "dia", "frec", "id", "member_id", "payment_method_id", "reparto", "updated_at", "valor"],
  extra_incomes: ["book_id", "category_id", "created_at", "created_by", "currency", "deleted_at", "descripcion", "external_id", "fecha", "id", "member_id", "payment_method_id", "updated_at", "valor"],
  fixed_expenses: ["book_id", "category_id", "created_at", "created_by", "currency", "deleted_at", "desde", "dia", "dia2", "fecha_unica", "frec", "id", "inicio", "link_id", "link_type", "logo_path", "member_id", "member_ids", "mes", "nombre", "payment_method_id", "proveedor", "provider_id", "reparto", "updated_at", "valor", "variable", "vmax", "vmin"],
  fixed_expense_payments: ["book_id", "created_at", "created_by", "deleted_at", "expense_id", "fecha", "fixed_expense_id", "id", "payment_method_id", "periodo", "updated_at", "valor"],
  subscriptions: ["activa", "book_id", "category_id", "ciclo", "comparte", "created_at", "created_by", "currency", "deleted_at", "id", "logo_path", "nombre", "payment_method_id", "provider_id", "proximo", "updated_at", "valor"],
  credit_cards: ["book_id", "corte", "created_at", "created_by", "cupo", "deleted_at", "entity_id", "id", "nombre", "pago", "tasa", "updated_at"],
  card_purchases: ["book_id", "card_id", "category_id", "created_at", "created_by", "cuotas", "deleted_at", "descripcion", "expense_id", "fecha", "id", "pagada", "updated_at", "valor"],
  card_payments: ["book_id", "card_id", "compras", "created_at", "created_by", "deleted_at", "fecha", "id", "nota", "payment_method_id", "tipo", "updated_at", "valor"],
  loans: ["acreedor", "book_id", "cerrado_at", "concepto", "contact_id", "created_at", "created_by", "cuota_fija", "currency", "deleted_at", "entity_id", "extra", "fiado", "frec", "id", "inicio", "kind", "monto", "nota", "plazo", "prenda", "primera", "provider_id", "sistema", "tasa", "tasa_ea", "tipo", "updated_at", "vence"],
  loan_payments: ["book_id", "created_at", "created_by", "deleted_at", "expense_id", "fecha", "id", "loan_id", "modo", "nota", "payment_method_id", "tipo", "updated_at", "valor"],
  goals: ["ahorrado", "asset_id", "book_id", "created_at", "created_by", "deleted_at", "fecha", "icon", "id", "nombre", "objetivo", "updated_at"],
  goal_movements: ["book_id", "created_at", "created_by", "deleted_at", "fecha", "goal_id", "id", "nota", "payment_method_id", "tipo", "updated_at", "valor"],
  fund_movements: ["book_id", "created_at", "created_by", "deleted_at", "expense_id", "fecha", "id", "nota", "tipo", "updated_at", "valor"],
  savings_challenges: ["base", "book_id", "category_id", "created_at", "created_by", "deleted_at", "dias", "id", "inicio", "k", "marcas", "n", "tipo", "updated_at"],
  wishlist: ["book_id", "created_at", "created_by", "deleted_at", "esperar_hasta", "estado", "id", "nombre", "nota", "precio", "prioridad", "updated_at", "url"],
  allowances: ["book_id", "created_at", "created_by", "deleted_at", "frec", "id", "member_id", "mesada", "meta_nombre", "meta_valor", "updated_at"],
  allowance_movements: ["allowance_id", "book_id", "created_at", "created_by", "deleted_at", "descripcion", "fecha", "id", "updated_at", "valor"],
  shared_groups: ["book_id", "created_at", "created_by", "deleted_at", "id", "nombre", "personas", "updated_at"],
  shared_group_expenses: ["book_id", "created_at", "created_by", "deleted_at", "descripcion", "entre", "expense_id", "fecha", "group_id", "id", "paga", "updated_at", "valor"],
  assets: ["book_id", "cod", "created_at", "created_by", "currency", "deleted_at", "id", "nombre", "saldo_at", "saldo_base", "saldo_fecha", "updated_at", "valor"],
  liabilities: ["book_id", "cod", "created_at", "created_by", "currency", "deleted_at", "id", "nombre", "updated_at", "valor"],
  investments: ["actual", "book_id", "cantidad", "capital", "created_at", "created_by", "currency", "deleted_at", "dias", "entity_id", "id", "inicio", "nombre", "ret", "symbol", "tasa", "tipo", "updated_at"],
  net_worth_snapshots: ["activos", "book_id", "created_at", "deleted_at", "deudas", "id", "mes", "patrimonio", "updated_at"],
  calendar_events: ["anual", "book_id", "cat", "created_at", "created_by", "deleted_at", "fecha", "fuente", "id", "monto", "nota", "template_key", "tipo", "titulo", "updated_at"],
  tax_years: ["book_id", "consig", "consumos", "created_at", "created_by", "ded", "deleted_at", "docs", "id", "ing", "member_id", "updated_at", "year"],
  tax_assets: ["asset_id", "avaluo", "book_id", "costo", "created_at", "created_by", "deleted_at", "entidad", "fecha_adq", "id", "ident", "imp_veh", "member_id", "nombre", "pct", "predial", "soat", "tipo", "updated_at", "valor31"],
  accountant_notes: ["autor", "book_id", "created_at", "created_by", "deleted_at", "id", "share_id", "texto", "updated_at"],
  attachments: ["book_id", "created_at", "created_by", "deleted_at", "doc_key", "id", "mime", "nombre", "path", "ref_id", "ref_table", "size", "updated_at", "visible_contador", "year"],
  advisor_consultations: ["book_id", "contact_id", "created_at", "created_by", "deleted_at", "descripcion", "fecha", "id", "payload", "tipo", "updated_at", "valor", "veredicto"],
  chat_threads: ["archivado", "book_id", "created_at", "created_by", "deleted_at", "fijado", "id", "titulo", "titulo_auto", "ultimo", "updated_at", "user_id"],
  chat_messages: ["adjuntos", "book_id", "content", "created_at", "created_by", "deleted_at", "feedback", "id", "meta", "role", "thread_id", "updated_at"],
  automations: ["activo", "book_id", "created_at", "created_by", "deleted_at", "descripcion", "disparador", "ejecuciones", "grafo", "icon", "id", "nombre", "plantilla", "ultima_ejecucion", "ultimo_estado", "updated_at"],
  automation_runs: ["automation_id", "book_id", "clave", "created_at", "deleted_at", "disparador", "error", "estado", "evento", "id", "pasos", "pendientes", "reanudar_at", "updated_at"],
  monthly_summaries: ["book_id", "contenido", "created_at", "created_by", "deleted_at", "id", "mes", "updated_at"],
} as const satisfies { [T in PolicyTable]: readonly (keyof Row<T> & string)[] }

type Faltan = { [T in PolicyTable]: Exclude<keyof Row<T> & string, (typeof BOOK_TABLE_COLUMNS)[T][number]> }[PolicyTable]
/** Si esto no compila, a BOOK_TABLE_COLUMNS le falta una columna de la base (el error dice cuál). */
export const BOOK_TABLE_COLUMNS_COMPLETE: [Faltan] extends [never] ? true : Faltan = true

/** ¿La columna existe en la tabla? (lista blanca para select, order y eq). */
export const isBookColumn = (table: PolicyTable, col: string): boolean => (BOOK_TABLE_COLUMNS[table] as readonly string[]).includes(col)
