// Tipos de entrada mínimos de la lógica de dominio de Mirai.
// Se derivan de las filas de Supabase (`Row<'tabla'>`) y piden solo los campos que usan los cálculos.
// Convenciones:
// - Montos `number`, fechas 'YYYY-MM-DD', meses 'YYYY-MM'.
// - Las listas que reciben las funciones ya vienen filtradas por quien llama: sin filas borradas
//   (`deleted_at` nulo) y, si aplica, solo ingresos `activo` y suscripciones `activa`.
// - Ninguna función lee el reloj: "hoy" siempre llega como parámetro (`today`).
import type { Row } from "@mirai/db/tables"

/** Fecha de entrada: 'YYYY-MM-DD' o un `Date` (se usa su día local). */
export type DateInput = string | Date

/** Monedas con tasa de cambio manual (TRM). COP no necesita tasa. */
export type Trm = Record<string, number>

export type Grupo = "n" | "g" | "a"

/**
 * Interruptores de cada tipo de aviso (`book_settings.notif` y, por persona, `notification_rules.notif`).
 * Un tipo sin dato está encendido (`avisoOn` en lib/domain/agenda.ts).
 */
export interface NotifFlags {
  pagos?: boolean
  cobros?: boolean
  hormiga?: boolean
  presupuesto?: boolean
  inversiones?: boolean
  metas?: boolean
  /** Fecha de corte y uso del cupo de las tarjetas de crédito. */
  tarjetas?: boolean
  /** Empeños y garantías con fecha límite. */
  empenos?: boolean
  /** Mesadas por entregar. */
  mesadas?: boolean
  /** Saldos de los gastos compartidos. */
  compartidos?: boolean
}

/** Ajustes del libro (`book_settings`) que usan los cálculos. */
export interface SettingsIn {
  umbral: number
  limite: number
  trm: Trm
  pct?: { n: number; g: number; a: number }
  emerg_meta: number
  anticipo: number
  corte_q: number
  alerta_pres: number
  notif?: NotifFlags
  /** Sobrescrituras por año: { "2026": 52374 } */
  uvt?: Record<string, number>
  smmlv?: Record<string, number>
  /** Ajustes de nómina: procedimiento de retención por defecto y tabla del FSP (lib/domain/payroll.ts). */
  nomina?: { retModo?: "auto" | "proc2"; retPct?: number; fsp?: [number, number][] }
  /** Título de tu meta financiera principal (book_settings.meta). */
  meta?: string
  /** El resto de tu meta: tipo, monto, fecha, meta de ahorro enlazada y pasos (MetaCfg de ./meta). */
  meta_cfg?: unknown
}

export type CategoryIn = Pick<Row<"categories">, "id" | "nombre" | "icon" | "tope"> & { grupo: Grupo | string }
export type IncomeCategoryIn = Pick<Row<"income_categories">, "id" | "nombre">

export type IncomeIn = Pick<Row<"incomes">, "id" | "concepto" | "valor" | "frec" | "dia"> & {
  /** Reparto por quincena, día de la semana o mes del pago (lib/domain/reparto.ts). */
  reparto?: unknown
  member_id?: string | null
  category_id?: string | null
  currency?: string | null
  /** Valor por pago antes de descuentos (nómina); null si se escribió lo que llega a la cuenta. */
  bruto?: number | null
}

export type ExtraIncomeIn = Pick<Row<"extra_incomes">, "fecha" | "descripcion" | "valor"> & { id?: string }

export type ExpenseIn = Pick<Row<"expenses">, "id" | "fecha" | "descripcion" | "valor"> & {
  category_id?: string | null
  member_id?: string | null
  fixed_expense_id?: string | null
  periodo?: string | null
  /** Marca de gasto hormiga. Solo cuenta si `hormiga_src` no es nulo (decisión manual, de IA o de regla). */
  hormiga?: boolean | null
  hormiga_src?: string | null
}

export type FixedPaymentIn = Pick<Row<"fixed_expense_payments">, "periodo" | "fecha" | "valor"> & {
  id?: string
  /** true: deja el periodo pagado; false: abono (falta el resto); null/undefined: pagos de antes (ver `pagoPeriodo`). */
  cierra?: boolean | null
  deleted_at?: string | null
}

export type FixedExpenseIn = Pick<Row<"fixed_expenses">, "id" | "nombre" | "valor" | "frec" | "dia"> & {
  /** Valor distinto en cada quincena (lib/domain/reparto.ts). */
  reparto?: unknown
  category_id?: string | null
  dia2?: number | null
  mes?: number | null
  fecha_unica?: string | null
  inicio?: string | null
  desde?: string | null
  variable?: boolean
  link_type?: string | null
  link_id?: string | null
  /** Moneda del valor ('COP', 'USD', 'EUR'); se convierte con la TRM del libro. */
  currency?: string | null
  /** Hasta cuándo se paga ('YYYY-MM-DD'); vacío = indefinido. */
  hasta?: string | null
  /** Días de anticipo del aviso propios de este gasto; vacío = el del libro. */
  aviso?: number | null
  /** Persona a la que se le paga (Contactos). */
  contact_id?: string | null
  /** Número de cuenta, contrato o referencia. */
  referencia?: string | null
  /** Pagos registrados (tabla `fixed_expense_payments`). */
  payments: FixedPaymentIn[]
}

export type SubscriptionIn = Pick<Row<"subscriptions">, "id" | "nombre" | "valor" | "ciclo"> & {
  proximo: string
  currency?: string | null
  comparte?: number | null
}

export type LoanPaymentIn = Pick<Row<"loan_payments">, "fecha" | "tipo" | "valor"> & {
  id?: string
  modo?: string | null
}

/** Empeño / garantía (`loans.prenda`). */
export interface Prenda {
  obj?: string
  valor?: number
  limite?: string | null
  ref?: string
}

export type LoanIn = Pick<Row<"loans">, "monto" | "sistema" | "tasa" | "frec" | "plazo" | "inicio"> & {
  id?: string
  kind?: "cobrar" | "pagar" | string
  contact_id?: string | null
  entity_id?: string | null
  concepto?: string
  extra?: number | null
  prenda?: Prenda | null
  /** Pagos registrados (tabla `loan_payments`). */
  payments: LoanPaymentIn[]
}

export type CardPurchaseIn = Pick<Row<"card_purchases">, "fecha" | "valor" | "cuotas"> & {
  id?: string
  pagada?: boolean
}

export type CreditCardIn = Pick<Row<"credit_cards">, "id" | "nombre" | "corte" | "pago" | "tasa"> & {
  cupo?: number
  purchases: CardPurchaseIn[]
}

export type AssetIn = Pick<Row<"assets">, "cod" | "valor"> & { id?: string; currency?: string | null }
export type LiabilityIn = Pick<Row<"liabilities">, "valor"> & { id?: string; currency?: string | null }

export type InvestmentIn = Pick<Row<"investments">, "tipo" | "nombre" | "capital" | "tasa" | "inicio"> & {
  id: string
  dias?: number | null
  ret?: number | null
  currency?: string | null
  actual?: number | null
}

export type GoalIn = Pick<Row<"goals">, "id" | "nombre" | "objetivo" | "ahorrado"> & { fecha: string | null }

export type CalendarEventIn = Pick<Row<"calendar_events">, "id" | "titulo" | "fecha" | "tipo" | "monto"> & {
  /** false = de una sola vez (no se repite cada año). Sin dato = anual, como en la v4. */
  anual?: boolean | null
  template_key?: string | null
  nota?: string | null
}

export type ContactIn = Pick<Row<"contacts">, "id" | "nombre">
export type EntityIn = Pick<Row<"entities">, "id" | "nombre">
export type KeywordRuleIn = Pick<Row<"keyword_rules">, "keyword"> & { category_id: string | null }

/** Todo lo de un libro que necesitan los cálculos agregados (totales, quincena, agenda, flujo…). */
export interface BookData {
  settings: SettingsIn
  categories: CategoryIn[]
  incomes: IncomeIn[]
  extraIncomes: ExtraIncomeIn[]
  expenses: ExpenseIn[]
  fixedExpenses: FixedExpenseIn[]
  subscriptions: SubscriptionIn[]
  /** Préstamos de ambos tipos (`kind` 'cobrar' = me deben, 'pagar' = le debo). */
  loans: LoanIn[]
  creditCards: CreditCardIn[]
  assets: AssetIn[]
  liabilities: LiabilityIn[]
  investments: InvestmentIn[]
  goals: GoalIn[]
  calendarEvents: CalendarEventIn[]
  contacts: ContactIn[]
  entities: EntityIn[]
}
