// Ingresos y gastos fijos flexibles: un valor distinto en cada quincena, en qué quincena se descuenta la nómina,
// días de pago propios, el día de la semana del pago semanal y el mes del pago anual.
// Sin reparto guardado todo funciona igual que antes (15 y fin de mes, viernes, mismo valor).
import { iso, lastDay } from "./dates"
import { dedCalc, type DedItem, type Deducciones } from "./payroll"
import type { FixedExpenseIn, IncomeIn } from "./types"

/** Reparto guardado en `incomes.reparto`. */
export interface IncomeReparto {
  /** Quincenal: mismo valor en las dos quincenas o uno distinto en cada una. */
  modo?: "igual" | "distinto"
  /** Valor escrito para la 1ª y la 2ª quincena (bruto si se calculan descuentos). */
  b1?: number
  b2?: number
  /** Lo que llega a la cuenta en cada quincena. */
  n1?: number
  n2?: number
  /** En qué quincena se descuentan salud, pensión, retención y demás. */
  ded?: DedEn
  /** Días de pago de la 1ª (1..15) y la 2ª quincena (16..31; 31 = último día del mes). */
  d1?: number
  d2?: number
  /** Semanal: día de la semana (0 domingo … 6 sábado). */
  dow?: number
  /** Anual: mes del pago (1..12). */
  mes?: number
}

/** Reparto guardado en `fixed_expenses.reparto` (gasto quincenal con un valor distinto en cada quincena). */
export interface FixedReparto {
  modo?: "igual" | "distinto"
  q1?: number
  q2?: number
}

export type DedEn = "mitad" | "q1" | "q2"
export const DED_EN: { value: DedEn; label: string; desc: string }[] = [
  { value: "mitad", label: "Mitad y mitad", desc: "La mitad de los descuentos en cada quincena" },
  { value: "q2", label: "Todo en la 2ª quincena", desc: "La 1ª llega completa; en la 2ª te descuentan todo el mes" },
  { value: "q1", label: "Todo en la 1ª quincena", desc: "En la 1ª te descuentan todo el mes; la 2ª llega completa" },
]

export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
export const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

export const incomeReparto = (x: { reparto?: unknown }): IncomeReparto => (x.reparto && typeof x.reparto === "object" ? (x.reparto as IncomeReparto) : {})
export const fixedReparto = (f: { reparto?: unknown }): FixedReparto => (f.reparto && typeof f.reparto === "object" ? (f.reparto as FixedReparto) : {})

export interface QuincenasNetas {
  /** Lo que llega en la 1ª y la 2ª quincena. */
  n1: number
  n2: number
  /** Descuentos de cada quincena. */
  x1: number
  x2: number
  /** Descuentos del mes y su detalle (valores del mes). */
  total: number
  items: DedItem[]
}

/**
 * Lo que llega en cada quincena: con descuentos, se calculan los del mes (sobre el promedio de las dos quincenas,
 * igual que un pago quincenal) y se cargan a la mitad en cada una, todo a la 1ª o todo a la 2ª. Si una quincena no
 * alcanza a cubrir su parte, el resto pasa a la otra.
 */
export function quincenasNetas(b1: number, b2: number, D: Deducciones | null | undefined, ref: { smmlv: number; uvt: number }, ded: DedEn = "mitad"): QuincenasNetas {
  b1 = Math.max(0, +b1 || 0)
  b2 = Math.max(0, +b2 || 0)
  const r = D ? dedCalc((b1 + b2) / 2, "quincenal", D, ref) : null
  const T = r ? r.total * 2 : 0
  let x1 = ded === "q1" ? T : ded === "q2" ? 0 : T / 2
  x1 = Math.min(x1, b1)
  let x2 = T - x1
  if (x2 > b2) {
    x2 = b2
    x1 = Math.min(b1, T - x2)
  }
  return {
    n1: Math.round(b1 - x1), n2: Math.round(b2 - x2), x1: Math.round(x1), x2: Math.round(x2),
    total: Math.round(x1 + x2), items: (r?.items ?? []).map((i) => ({ ...i, v: i.v * 2 })),
  }
}

export interface Pago {
  /** 'YYYY-MM-DD' */
  fecha: string
  /** Valor en la moneda del ingreso. */
  v: number
  /** Quincena a la que corresponde (solo pagos quincenales). */
  parte?: "q1" | "q2"
}

/** Día de pago de cada quincena (por defecto 15 y fin de mes), recortado al último día del mes. */
export function diasQuincena(R: IncomeReparto, y: number, m: number): [number, number] {
  const ld = lastDay(y, m)
  const d1 = Math.min(15, Math.max(1, Math.round(R.d1 || 15)))
  const d2 = Math.min(ld, Math.max(16, Math.round(R.d2 || ld)))
  return [d1, d2]
}

/**
 * Pagos de un ingreso en el mes `m` (base 0) del año `y`. Quincenal: 2 pagos con el valor de cada quincena;
 * mensual: el día de pago; semanal: cada semana el día escogido (viernes por defecto); anual: solo si el mes
 * del pago está guardado.
 */
export function incomePagos(x: Pick<IncomeIn, "frec" | "valor" | "dia"> & { reparto?: unknown }, y: number, m: number): Pago[] {
  const R = incomeReparto(x)
  const ld = lastDay(y, m)
  const v = +x.valor || 0
  const at = (d: number) => iso(new Date(y, m, Math.min(d, ld)))
  if (x.frec === "quincenal") {
    const [d1, d2] = diasQuincena(R, y, m)
    return [{ fecha: at(d1), v: R.n1 ?? v, parte: "q1" }, { fecha: at(d2), v: R.n2 ?? v, parte: "q2" }]
  }
  if (x.frec === "mensual") return [{ fecha: at(x.dia || 30), v }]
  if (x.frec === "semanal") {
    const dow = R.dow ?? 5
    const out: Pago[] = []
    for (let d = 1; d <= ld; d++) if (new Date(y, m, d).getDay() === dow) out.push({ fecha: at(d), v })
    return out
  }
  if (x.frec === "anual" && R.mes === m + 1) return [{ fecha: at(x.dia || 1), v }]
  return []
}

/** Texto corto de cuándo llega un ingreso: "15 y 30 · $X y $Y", "Cada viernes", "Cada año el 20 de diciembre". */
export function incomeCuando(x: Pick<IncomeIn, "frec" | "dia"> & { reparto?: unknown }): string {
  const R = incomeReparto(x)
  if (x.frec === "quincenal") return `Cada quincena (${R.d1 || 15} y ${R.d2 && R.d2 < 31 ? R.d2 : "fin de mes"})`
  if (x.frec === "mensual") return `Cada mes el día ${x.dia || 30}`
  if (x.frec === "semanal") return `Cada ${DIAS_SEMANA[R.dow ?? 5].toLowerCase()}`
  if (x.frec === "anual") return R.mes ? `Cada año el ${x.dia || 1} de ${MESES_LARGOS[R.mes - 1].toLowerCase()}` : "Una vez al año"
  return x.frec
}

/** Quincena en la que cae un día del mes según el corte (por defecto 15). */
export const quincenaDeDia = (dia: number, corte = 15): "q1" | "q2" => (dia <= Math.min(Math.max(corte || 15, 1), 27) ? "q1" : "q2")

/** Valor de un periodo de un gasto fijo: quincenal con valor distinto en cada quincena; si no, `valor`. */
export function fijoValor(f: Pick<FixedExpenseIn, "frec" | "valor"> & { reparto?: unknown }, per: string): number {
  const R = fixedReparto(f)
  if (f.frec === "quincenal" && R.modo === "distinto") {
    const v = per.endsWith("Q1") ? R.q1 : per.endsWith("Q2") ? R.q2 : undefined
    if (v != null && Number.isFinite(+v)) return +v
  }
  return +f.valor
}
