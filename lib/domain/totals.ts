// Cálculos generales del libro: ingresos, gastos, liquidez, patrimonio y gastos hormiga
// (equivalente a b_core.js y `gastosBasicos` de d_app.js de la v4).
import { addMonths, lastDay, MES, mkey, toDay } from "./dates"
import { tarjetasDeuda } from "./cards"
import { fijoMensual } from "./fixed"
import { isHormiga } from "./hormiga"
import { inv } from "./investments"
import { FMES, loanEngine } from "./loans"
import { conv } from "./money"
import { pagosMes } from "./reparto"
import { subsMes } from "./subscriptions"
import type {
  AssetIn, BookData, CategoryIn, DateInput, ExpenseIn, FixedExpenseIn, IncomeIn, InvestmentIn, LoanIn, Trm,
} from "./types"

/** Veces que se recibe un ingreso al mes según su frecuencia. */
export const FREC: Record<string, number> = { mensual: 1, quincenal: 2, semanal: 52 / 12, anual: 1 / 12, diario: 30 }

/** Ingreso mensual equivalente de todos los ingresos (en COP). */
export const ingresoMensual = (incomes: IncomeIn[], trm: Trm): number =>
  incomes.reduce((a, x) => a + conv(x.valor, x.currency, trm) * pagosMes(x), 0)

/** Dinero disponible: cuentas y efectivo (PUC 11xx) + inversiones de tipo ahorro. */
export function liquidez(assets: AssetIn[], investments: InvestmentIn[], trm: Trm, today: DateInput): number {
  return (
    assets.filter((a) => /^11/.test(a.cod)).reduce((s, a) => s + conv(a.valor, a.currency, trm), 0) +
    investments.filter((x) => x.tipo === "ahorro").reduce((a, x) => a + inv(x, today).valor, 0)
  )
}

/** Cuotas que se pagan (o cobran) al mes en préstamos activos de un tipo. */
export function cuotasMes(loans: LoanIn[], kind: "cobrar" | "pagar", today: DateInput): number {
  return loans
    .filter((L) => L.kind === kind)
    .reduce((a, L) => {
      const e = loanEngine(L, today)
      if (e.done || !e.next) return a
      return a + e.next.valor * (FMES[L.frec] || 1)
    }, 0)
}

/** Suma mensual de los gastos fijos. */
export const fijosMes = (fixed: FixedExpenseIn[]): number => fixed.reduce((a, f) => a + fijoMensual(f), 0)

/** Gastos de un mes ('YYYY-MM'). */
export const gastosMesK = <T extends Pick<ExpenseIn, "fecha">>(expenses: T[], k: string): T[] => expenses.filter((g) => g.fecha.startsWith(k))

/** Categorías que ya tienen un gasto fijo. */
export const fixedCategoryIds = (fixed: FixedExpenseIn[]): Set<string> => new Set(fixed.map((f) => f.category_id).filter((x): x is string => !!x))

/**
 * Presupuesto variable del mes = topes de las categorías que no son ahorro, no tienen gasto fijo
 * y no son "Suscripciones".
 */
export function variableMes(categories: CategoryIn[], fixed: FixedExpenseIn[]): number {
  const fc = fixedCategoryIds(fixed)
  return categories.filter((c) => c.grupo !== "a" && !fc.has(c.id) && c.nombre !== "Suscripciones").reduce((a, c) => a + +c.tope, 0)
}

/** Promedio del gasto variable real de los 3 meses anteriores con datos (sin pagos de fijos); si no hay, el presupuesto. */
export function gastoVariableReal(expenses: ExpenseIn[], categories: CategoryIn[], fixed: FixedExpenseIn[], today: DateInput): number {
  const t = toDay(today)
  let tot = 0
  let n = 0
  for (let j = 1; j <= 3; j++) {
    const k = mkey(addMonths(new Date(t.getFullYear(), t.getMonth(), 1), -j))
    const g = gastosMesK(expenses, k).filter((x) => !x.fixed_expense_id)
    if (g.length) {
      tot += g.reduce((a, x) => a + +x.valor, 0)
      n++
    }
  }
  return n ? tot / n : variableMes(categories, fixed)
}

/** Gastos básicos del mes: fijos + cuotas de deudas + suscripciones + topes de necesidades sin gasto fijo. */
export function gastosBasicos(b: Pick<BookData, "fixedExpenses" | "loans" | "subscriptions" | "categories" | "settings">, today: DateInput): number {
  const fc = fixedCategoryIds(b.fixedExpenses)
  return (
    fijosMes(b.fixedExpenses) +
    cuotasMes(b.loans, "pagar", today) +
    subsMes(b.subscriptions, b.settings.trm) +
    b.categories.filter((c) => c.grupo === "n" && !fc.has(c.id)).reduce((a, c) => a + +c.tope, 0)
  )
}

export interface Totales {
  /** Me deben (saldo de préstamos por cobrar). */
  xc: number
  /** Le debo (saldo de préstamos por pagar). */
  xp: number
  /** Inversiones a hoy. */
  xi: number
  /** Deuda en tarjetas. */
  xt: number
  /** Activos totales. */
  A: number
  /** Pasivos totales. */
  P: number
  /** Patrimonio. */
  pat: number
}

/** Balance: lo que tienes, lo que debes y tu patrimonio. */
export function totales(b: BookData, today: DateInput): Totales {
  const trm = b.settings.trm
  const sum = (kind: string) => b.loans.filter((L) => L.kind === kind).reduce((a, L) => a + loanEngine(L, today).saldo, 0)
  const xc = sum("cobrar")
  const xp = sum("pagar")
  const xi = b.investments.reduce((a, x) => a + conv(inv(x, today).valor, x.currency, trm), 0)
  const xt = tarjetasDeuda(b.creditCards, today)
  const A = b.assets.reduce((a, x) => a + conv(x.valor, x.currency, trm), 0) + xc + xi
  const P = b.liabilities.reduce((a, x) => a + conv(x.valor, x.currency, trm), 0) + xp + xt
  return { xc, xp, xi, xt, A, P, pat: A - P }
}

export interface HormigaResumen<T> {
  /** Gastos hormiga del mes actual. */
  mes: T[]
  /** Por categoría (clave = category_id, o '' si no tiene). */
  porCat: Record<string, { n: number; v: number }>
  totalMes: number
  /** Últimos 6 meses, del más antiguo al actual. */
  meses: { l: string; v: number }[]
  /** Proyección del mes según lo que va. */
  proy: number
  anual: number
  /** ¿La proyección supera el límite mensual? */
  over: boolean
}

/** Resumen de gastos hormiga del mes y proyección. */
export function hormigas<T extends ExpenseIn>(b: { expenses: T[]; categories: CategoryIn[]; settings: Pick<BookData["settings"], "umbral" | "limite"> }, today: DateInput): HormigaResumen<T> {
  const t = toDay(today)
  const k = mkey(t)
  const small = b.expenses.filter((g) => isHormiga(g, b.categories, b.settings.umbral))
  const mes = small.filter((g) => g.fecha.startsWith(k))
  const porCat: Record<string, { n: number; v: number }> = {}
  mes.forEach((g) => {
    const c = g.category_id ?? ""
    porCat[c] = porCat[c] || { n: 0, v: 0 }
    porCat[c].n++
    porCat[c].v += +g.valor
  })
  const totalMes = mes.reduce((a, g) => a + +g.valor, 0)
  const meses: { l: string; v: number }[] = []
  for (let j = 5; j >= 0; j--) {
    const a = addMonths(new Date(t.getFullYear(), t.getMonth(), 1), -j)
    const kk = mkey(a)
    meses.push({ l: MES[a.getMonth()], v: small.filter((g) => g.fecha.startsWith(kk)).reduce((s, g) => s + +g.valor, 0) })
  }
  const dim = lastDay(t.getFullYear(), t.getMonth())
  const proy = (totalMes / t.getDate()) * dim
  return { mes, porCat, totalMes, meses, proy, anual: proy * 12, over: proy > b.settings.limite }
}
