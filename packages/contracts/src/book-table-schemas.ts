// Esquemas zod de escritura del CRUD genérico del libro (§2.5, F2-D-1): una fila por tabla con `generic: true` y
// `write` distinto de "system" en BOOK_TABLE_POLICY. Generados desde packages/db/src/database.types.ts (Insert de cada
// tabla) y revisados a mano: enumeraciones de los `check` de supabase/migrations, fechas AAAA-MM-DD, enteros y largos.
//
// Reglas:
// - Nunca entran las columnas del sistema (`id`, `book_id`, `created_by`, `created_at`, `updated_at`, `deleted_at`):
//   el `id` va en la ruta, el libro sale de la ruta y `created_by` lo pone la API (z.strictObject rechaza el resto).
// - Tampoco las que solo escriben las RPC o los triggers de enlaces (gasto ↔ fijo ↔ suscripción ↔ fondo ↔ tarjeta ↔
//   préstamo): para eso están los comandos de cada módulo (`link-fixed`, `pay`, `charge`, `use-fund`…).
// - Crear exige los campos obligatorios de la tabla; editar acepta cualquier subconjunto (`writeSchema(t, "update")`).
// - La prueba de tipos del final hace que una columna borrada o renombrada en la base rompa la compilación.
import { z } from "zod"
import type { Insert } from "@mirai/db/tables"
import { ENTITY_TIPOS } from "@mirai/domain/registros"
import { IsoDate, Money, Uuid } from "./common"
import type { PolicyTable } from "./book-tables"

const Txt = (max: number) => z.string({ error: "Escribe un texto" }).max(max, `Máximo ${max} caracteres`)
const Int = z.number({ error: "Escribe un número" }).int("Usa un número entero").min(-1e9).max(1e9)
/** JSON de la base (jsonb). */
const Json = z.json()

export const BOOK_TABLE_SCHEMAS = {
  categories: z.strictObject({
    grupo: z.enum(["n", "g", "a"]).optional(),
    icon: Txt(500).optional(),
    nombre: Txt(200),
    sort: Int.optional(),
    tope: Money.optional(),
  }),
  income_categories: z.strictObject({
    icon: Txt(500).optional(),
    nombre: Txt(200),
    sort: Int.optional(),
  }),
  entities: z.strictObject({
    logo_path: Txt(500).nullable().optional(),
    nit: Txt(500).optional(),
    nombre: Txt(200),
    tipo: z.enum(ENTITY_TIPOS).optional(),
  }),
  payment_methods: z.strictObject({
    asset_id: Uuid.nullable().optional(),
    icon: Txt(500).optional(),
    nombre: Txt(200),
    sort: Int.optional(),
  }),
  keyword_rules: z.strictObject({
    category_id: Uuid.nullable().optional(),
    keyword: Txt(500),
  }),
  providers: z.strictObject({
    activo: z.boolean().optional(),
    brand: Txt(500).nullable().optional(),
    category_id: Uuid.nullable().optional(),
    correo: Txt(500).optional(),
    icon: Txt(500).nullable().optional(),
    nit: Txt(500).optional(),
    nombre: Txt(200),
    notas: Txt(4000).optional(),
    payment_method_id: Uuid.nullable().optional(),
    referencia: Txt(500).optional(),
    sitio_web: Txt(500).optional(),
    telefono: Txt(500).optional(),
    tipo: Txt(500).optional(),
  }),
  contacts: z.strictObject({
    avatar_path: Txt(500).nullable().optional(),
    ciudad: Txt(500).optional(),
    direccion: Json.optional(),
    doc: Txt(500).optional(),
    doc_tipo: z.enum(["CC", "CE", "PA", "TI", "NIT", "PPT"]).optional(),
    email: Txt(500).optional(),
    nombre: Txt(200),
    notas: Txt(4000).optional(),
    relacion: Txt(500).optional(),
    telefono: Txt(500).optional(),
    tipo: z.enum(["persona", "empresa"]).optional(),
  }),
  expenses: z.strictObject({
    cat_src: z.enum(["regla", "historial", "palabras", "palabra", "ia", "manual"]).nullable().optional(),
    category_id: Uuid.nullable().optional(),
    currency: Txt(500).optional(),
    /** expenses_deducible_check (20261103003600_deducibles.sql) = DEDUCIBLES de @mirai/domain/renta. */
    deducible: z.enum(["salud", "vivienda", "educacion", "dependiente"]).nullable().optional(),
    descripcion: Txt(4000).optional(),
    external_id: Uuid.nullable().optional(),
    fecha: IsoDate.optional(),
    hormiga: z.boolean().optional(),
    hormiga_razon: Txt(500).nullable().optional(),
    hormiga_src: z.enum(["ia", "manual", "regla"]).nullable().optional(),
    member_id: Uuid.nullable().optional(),
    member_ids: z.array(Uuid).max(200).nullable().optional(),
    nota: Txt(4000).optional(),
    origen: z.enum(["manual", "importar", "correo", "ocr", "voz", "tarjeta", "compartido", "aporte", "prestamo"]).optional(),
    payment_method_id: Uuid.nullable().optional(),
    provider_id: Uuid.nullable().optional(),
    valor: Money.optional(),
  }),
  incomes: z.strictObject({
    activo: z.boolean().optional(),
    bruto: Money.nullable().optional(),
    category_id: Uuid.nullable().optional(),
    concepto: Txt(200),
    currency: Txt(500).optional(),
    deducciones: Json.nullable().optional(),
    dia: Int.optional(),
    frec: z.enum(["mensual", "quincenal", "semanal", "diario", "anual"]).optional(),
    member_id: Uuid.nullable().optional(),
    payment_method_id: Uuid.nullable().optional(),
    reparto: Json.nullable().optional(),
    valor: Money.optional(),
  }),
  extra_incomes: z.strictObject({
    category_id: Uuid.nullable().optional(),
    currency: Txt(500).optional(),
    descripcion: Txt(4000).optional(),
    external_id: Uuid.nullable().optional(),
    fecha: IsoDate.optional(),
    member_id: Uuid.nullable().optional(),
    payment_method_id: Uuid.nullable().optional(),
    valor: Money.optional(),
  }),
  fixed_expenses: z.strictObject({
    category_id: Uuid.nullable().optional(),
    currency: Txt(500).optional(),
    desde: Txt(500).optional(),
    dia: Int.optional(),
    dia2: Int.nullable().optional(),
    fecha_unica: IsoDate.nullable().optional(),
    frec: Txt(500).optional(),
    inicio: IsoDate.nullable().optional(),
    link_id: Uuid.nullable().optional(),
    link_type: z.enum(["meta", "fondo"]).nullable().optional(),
    logo_path: Txt(500).nullable().optional(),
    member_id: Uuid.nullable().optional(),
    member_ids: z.array(Uuid).max(200).nullable().optional(),
    mes: Int.nullable().optional(),
    nombre: Txt(200),
    payment_method_id: Uuid.nullable().optional(),
    proveedor: Txt(500).optional(),
    provider_id: Uuid.nullable().optional(),
    reparto: Json.nullable().optional(),
    valor: Money.optional(),
    variable: z.boolean().optional(),
    vmax: Money.nullable().optional(),
    vmin: Money.nullable().optional(),
  }),
  fixed_expense_payments: z.strictObject({
    fecha: IsoDate.optional(),
    fixed_expense_id: Uuid,
    payment_method_id: Uuid.nullable().optional(),
    periodo: Txt(500),
    valor: Money.optional(),
  }),
  subscriptions: z.strictObject({
    activa: z.boolean().optional(),
    category_id: Uuid.nullable().optional(),
    ciclo: z.enum(["mensual", "anual"]).optional(),
    comparte: Int.optional(),
    currency: Txt(500).optional(),
    logo_path: Txt(500).nullable().optional(),
    nombre: Txt(200),
    payment_method_id: Uuid.nullable().optional(),
    provider_id: Uuid.nullable().optional(),
    proximo: IsoDate.nullable().optional(),
    valor: Money.optional(),
  }),
  credit_cards: z.strictObject({
    corte: Int.optional(),
    cupo: Money.optional(),
    entity_id: Uuid.nullable().optional(),
    nombre: Txt(200),
    pago: Int.optional(),
    tasa: Money.optional(),
  }),
  card_purchases: z.strictObject({
    card_id: Uuid,
    category_id: Uuid.nullable().optional(),
    cuotas: Int.optional(),
    descripcion: Txt(4000).optional(),
    fecha: IsoDate.optional(),
    pagada: z.boolean().optional(),
    valor: Money.optional(),
  }),
  card_payments: z.strictObject({
    card_id: Uuid,
    fecha: IsoDate.optional(),
    nota: Txt(4000).optional(),
    payment_method_id: Uuid.nullable().optional(),
    tipo: z.enum(["minimo", "total", "otro"]).optional(),
    valor: Money,
  }),
  loans: z.strictObject({
    acreedor: Txt(500).nullable().optional(),
    cerrado_at: Txt(500).nullable().optional(),
    concepto: Txt(200).optional(),
    contact_id: Uuid.nullable().optional(),
    cuota_fija: Money.nullable().optional(),
    currency: Txt(500).optional(),
    entity_id: Uuid.nullable().optional(),
    extra: Money.optional(),
    fiado: z.boolean().optional(),
    frec: z.enum(["mensual", "quincenal", "semanal", "diario", "diariohab", "unico"]).optional(),
    inicio: IsoDate.optional(),
    kind: z.enum(["cobrar", "pagar"]),
    monto: Money.optional(),
    nota: Txt(4000).optional(),
    plazo: Int.optional(),
    prenda: Json.nullable().optional(),
    primera: IsoDate.nullable().optional(),
    provider_id: Uuid.nullable().optional(),
    sistema: z.enum(["frances", "aleman", "simple", "sin", "americano", "diario", "cuota"]).optional(),
    tasa: Money.optional(),
    tasa_ea: Money.nullable().optional(),
    tipo: Txt(500).nullable().optional(),
    vence: IsoDate.nullable().optional(),
  }),
  loan_payments: z.strictObject({
    fecha: IsoDate.optional(),
    loan_id: Uuid,
    modo: z.enum(["cuota", "plazo"]).nullable().optional(),
    nota: Txt(4000).optional(),
    payment_method_id: Uuid.nullable().optional(),
    tipo: z.enum(["cuota", "abono"]).optional(),
    valor: Money.optional(),
  }),
  goals: z.strictObject({
    ahorrado: Money.optional(),
    asset_id: Uuid.nullable().optional(),
    fecha: IsoDate.nullable().optional(),
    icon: Txt(500).optional(),
    nombre: Txt(200),
    objetivo: Money.optional(),
  }),
  goal_movements: z.strictObject({
    fecha: IsoDate.optional(),
    goal_id: Uuid,
    nota: Txt(4000).optional(),
    payment_method_id: Uuid.nullable().optional(),
    tipo: z.enum(["abono", "retiro"]).optional(),
    valor: Money,
  }),
  fund_movements: z.strictObject({
    fecha: IsoDate.optional(),
    nota: Txt(4000).optional(),
    tipo: z.enum(["guardar", "usar"]),
    valor: Money.optional(),
  }),
  savings_challenges: z.strictObject({
    base: Money.optional(),
    category_id: Uuid.nullable().optional(),
    dias: Int.nullable().optional(),
    inicio: IsoDate.optional(),
    k: Txt(500),
    marcas: Json.optional(),
    n: Int.nullable().optional(),
    tipo: Txt(500),
  }),
  wishlist: z.strictObject({
    esperar_hasta: IsoDate.optional(),
    estado: z.enum(["esperando", "comprado", "descartado"]).optional(),
    nombre: Txt(200),
    nota: Txt(4000).optional(),
    precio: Money.optional(),
    prioridad: Int.optional(),
    url: Txt(500).nullable().optional(),
  }),
  allowances: z.strictObject({
    frec: Txt(500).optional(),
    member_id: Uuid,
    mesada: Money.optional(),
    meta_nombre: Txt(500).optional(),
    meta_valor: Money.optional(),
  }),
  allowance_movements: z.strictObject({
    allowance_id: Uuid,
    descripcion: Txt(4000).optional(),
    fecha: IsoDate.optional(),
    valor: Money.optional(),
  }),
  shared_groups: z.strictObject({
    nombre: Txt(200),
    personas: z.array(Txt(200)).max(200).optional(),
  }),
  shared_group_expenses: z.strictObject({
    descripcion: Txt(4000).optional(),
    entre: z.array(Txt(200)).max(200).optional(),
    expense_id: Uuid.nullable().optional(),
    fecha: IsoDate.optional(),
    group_id: Uuid,
    paga: Txt(500),
    valor: Money.optional(),
  }),
  assets: z.strictObject({
    cod: Txt(500).optional(),
    currency: Txt(500).optional(),
    nombre: Txt(200),
    saldo_at: Txt(500).nullable().optional(),
    saldo_base: Money.nullable().optional(),
    saldo_fecha: IsoDate.nullable().optional(),
    valor: Money.optional(),
  }),
  liabilities: z.strictObject({
    cod: Txt(500).optional(),
    currency: Txt(500).optional(),
    nombre: Txt(200),
    valor: Money.optional(),
  }),
  investments: z.strictObject({
    actual: Money.nullable().optional(),
    cantidad: Money.nullable().optional(),
    capital: Money.optional(),
    currency: Txt(500).optional(),
    dias: Int.nullable().optional(),
    entity_id: Uuid.nullable().optional(),
    inicio: IsoDate.optional(),
    nombre: Txt(200),
    ret: Money.optional(),
    symbol: Txt(500).nullable().optional(),
    tasa: Money.optional(),
    tipo: Txt(500).optional(),
  }),
  net_worth_snapshots: z.strictObject({
    activos: Money.optional(),
    deudas: Money.optional(),
    mes: Txt(500),
    patrimonio: Money.optional(),
  }),
  calendar_events: z.strictObject({
    anual: z.boolean().optional(),
    cat: Txt(500).nullable().optional(),
    fecha: IsoDate,
    fuente: Txt(500).nullable().optional(),
    monto: Money.optional(),
    nota: Txt(4000).optional(),
    template_key: Txt(500).nullable().optional(),
    tipo: z.enum(["ingreso", "egreso"]).optional(),
    titulo: Txt(200),
  }),
  tax_years: z.strictObject({
    consig: Money.optional(),
    consumos: Money.optional(),
    ded: Json.optional(),
    docs: Json.optional(),
    ing: Json.optional(),
    member_id: Uuid,
    year: Int,
  }),
  tax_assets: z.strictObject({
    asset_id: Uuid.nullable().optional(),
    avaluo: Money.optional(),
    costo: Money.optional(),
    entidad: Txt(500).optional(),
    fecha_adq: IsoDate.nullable().optional(),
    ident: Txt(500).optional(),
    imp_veh: Money.nullable().optional(),
    member_id: Uuid.nullable().optional(),
    nombre: Txt(200),
    pct: Money.optional(),
    predial: Money.nullable().optional(),
    soat: Money.nullable().optional(),
    tipo: Txt(500).optional(),
    valor31: Money.optional(),
  }),
  accountant_notes: z.strictObject({
    /** El titular escribe con su sesión; las notas del contador entran por el portal (F2-I). */
    autor: z.enum(["titular"]).default("titular"),
    share_id: Uuid,
    texto: Txt(4000),
  }),
  attachments: z.strictObject({
    doc_key: Txt(500).nullable().optional(),
    mime: Txt(500).optional(),
    nombre: Txt(200),
    path: Txt(500),
    ref_id: Uuid.nullable().optional(),
    ref_table: Txt(500).nullable().optional(),
    size: Int.optional(),
    visible_contador: z.boolean().optional(),
    year: Int.nullable().optional(),
  }),
  advisor_consultations: z.strictObject({
    contact_id: Uuid.nullable().optional(),
    descripcion: Txt(4000).optional(),
    fecha: IsoDate.optional(),
    payload: Json.optional(),
    tipo: Txt(500),
    valor: Money.optional(),
    veredicto: z.enum(["si", "cuidado", "no"]),
  }),
  automations: z.strictObject({
    activo: z.boolean().optional(),
    descripcion: Txt(4000).optional(),
    disparador: Txt(500).optional(),
    grafo: Json.optional(),
    icon: Txt(500).optional(),
    nombre: Txt(200),
    plantilla: Txt(500).nullable().optional(),
  }),
} as const

/** Tablas con esquema de escritura (las demás no se escriben por el CRUD genérico). */
export type WritableTable = keyof typeof BOOK_TABLE_SCHEMAS
export const isWritableTable = (t: string): t is WritableTable => Object.hasOwn(BOOK_TABLE_SCHEMAS, t)

/** Columnas que nunca llegan del cliente (las pone la API o la base). */
export const SYSTEM_COLUMNS = ["id", "book_id", "created_at", "created_by", "updated_at", "deleted_at"] as const

/** Esquema para crear (campos obligatorios) o editar (cualquier subconjunto, al menos un campo). */
export function writeSchema(t: WritableTable, mode: "insert" | "update"): z.ZodType<Record<string, unknown>> {
  const s = BOOK_TABLE_SCHEMAS[t] as unknown as z.ZodObject
  return (mode === "insert" ? s : s.partial().refine((v) => Object.keys(v).length > 0, "No enviaste ningún cambio.")) as unknown as z.ZodType<Record<string, unknown>>
}

/**
 * Referencias a otras filas del libro: si llegan, la API revisa que sean del MISMO libro (y que no estén borradas)
 * antes de escribir, para que un id de otro libro no se cuele por un trigger. Columna → tabla.
 */
export const BOOK_REFS: Record<string, PolicyTable | "emergency_funds"> = {
  category_id: "categories",
  payment_method_id: "payment_methods",
  provider_id: "providers",
  entity_id: "entities",
  contact_id: "contacts",
  card_id: "credit_cards",
  loan_id: "loans",
  goal_id: "goals",
  group_id: "shared_groups",
  allowance_id: "allowances",
  fixed_expense_id: "fixed_expenses",
  asset_id: "assets",
  expense_id: "expenses",
}
/** Tabla a la que apunta `col` en `table` (la categoría de un ingreso es de income_categories). */
export function refTable(table: WritableTable, col: string): string | undefined {
  if (col === "category_id" && (table === "incomes" || table === "extra_incomes")) return "income_categories"
  return BOOK_REFS[col]
}

// ── Prueba de tipos: toda columna de los esquemas existe en Insert<tabla> ──────────────────────────────────────────
type KeysOk = { [T in WritableTable]: Exclude<keyof z.infer<(typeof BOOK_TABLE_SCHEMAS)[T]>, keyof Insert<T>> extends never ? true : T }
const keysOk: KeysOk[WritableTable] = true
void keysOk
