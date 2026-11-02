// Primas y cesantías (equivalente a V.primas y EXTRA_ACT.priCal de f_extra.js de la v4).
// Estimado para contrato laboral: prima = ½ salario por semestre, cesantías = 1 salario al año,
// intereses de cesantías = 12 % de las cesantías.
import { iso, toDay } from "./dates"
import { conv } from "./money"
import { pagosMes } from "./reparto"
import type { DateInput, IncomeCategoryIn, IncomeIn, Trm } from "./types"

/** Salario mensual tomado de los ingresos: el mayor ingreso cuya categoría o concepto diga "salari…". */
export function salarioDesdeIngresos(incomes: IncomeIn[], incomeCategories: IncomeCategoryIn[], trm: Trm): number {
  const catName = (id: string | null | undefined) => (id ? incomeCategories.find((c) => c.id === id)?.nombre ?? "" : "")
  return incomes
    .filter((i) => /salari/i.test(catName(i.category_id) + i.concepto))
    .reduce((a, i) => Math.max(a, conv(i.valor, i.currency, trm) * pagosMes(i)), 0)
}

export interface PrimaFecha {
  n: string
  /** 'YYYY-MM-DD' */
  fecha: string
  v: number
}

export interface Primas {
  prima: number
  cesantias: number
  interesesCesantias: number
  /** Próximos pagos, del más cercano al más lejano. */
  prox: PrimaFecha[]
}

/** Valores y fechas: prima 30 jun y 20 dic; intereses de cesantías 31 ene; cesantías al fondo 14 feb. */
export function primas(salario: number, today: DateInput): Primas {
  const t = toDay(today)
  const prima = salario / 2
  const ces = salario
  const intc = ces * 0.12
  const y = t.getFullYear()
  const prox: [string, Date, number][] = [
    ["Prima de junio", new Date(y + (t.getMonth() > 5 ? 1 : 0), 5, 30), prima],
    ["Prima de diciembre", new Date(y + (t.getMonth() === 11 && t.getDate() > 20 ? 1 : 0), 11, 20), prima],
    ["Intereses de cesantías", new Date(y + 1, 0, 31), intc],
    ["Cesantías al fondo", new Date(y + 1, 1, 14), ces],
  ]
  prox.sort((a, b) => a[1].getTime() - b[1].getTime())
  return { prima, cesantias: ces, interesesCesantias: intc, prox: prox.map(([n, d, v]) => ({ n, fecha: iso(d), v })) }
}

export type RepartoPct = { deudas: number; ahorro: number; metas: number; gusto: number }

export const REPARTO_DEF: RepartoPct = { deudas: 40, ahorro: 30, metas: 20, gusto: 10 }

/** Reparto de la prima: monto_i = prima × pct_i / Σpct. */
export function repartoPrima(prima: number, pct: RepartoPct = REPARTO_DEF): RepartoPct {
  const tot = pct.deudas + pct.ahorro + pct.metas + pct.gusto || 1
  return {
    deudas: (prima * pct.deudas) / tot,
    ahorro: (prima * pct.ahorro) / tot,
    metas: (prima * pct.metas) / tot,
    gusto: (prima * pct.gusto) / tot,
  }
}

/**
 * Montos que "Poner en el calendario" escribe en las fechas del calendario fiscal, según el título:
 * prima → ½ salario; intereses de cesantías → 12 %; cesantías → 1 salario. `null` si no aplica.
 */
export function montoCalendarioPrima(titulo: string, salario: number): number | null {
  if (/prima/i.test(titulo)) return Math.round(salario / 2)
  if (/intereses.*cesant/i.test(titulo)) return Math.round(salario * 0.12)
  if (/cesant/i.test(titulo)) return Math.round(salario)
  return null
}
