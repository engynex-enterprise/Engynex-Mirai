// Fondo de emergencia, aportes programados y metas (equivalente a j_loans.js y c2_views.js de la v4).
import { toDay } from "./dates"
import { incomeReparto } from "./reparto"
import { gastosBasicos } from "./totals"
import type { BookData, DateInput, ExpenseIn, GoalIn, IncomeCategoryIn, IncomeIn } from "./types"

export interface PayDays {
  frec: "quincenal" | "mensual"
  dia: number
  dia2: number
  /** Texto para la ayuda: "cada quincena (15 y 30), cuando te pagan". */
  txt: string
}

/**
 * Días en que recibes tu ingreso principal, para sugerir cuándo aportar: el ingreso quincenal, o el que
 * parezca salario (salario, sueldo, nómina), o el primero. Sin ingresos → mensual el 30.
 */
export function payDays(incomes: IncomeIn[], incomeCategories: IncomeCategoryIn[] = []): PayDays {
  const catName = (id: string | null | undefined) => (id ? incomeCategories.find((c) => c.id === id)?.nombre ?? "" : "")
  const sal = incomes.find((i) => i.frec === "quincenal") || incomes.find((i) => /salario|sueldo|n[oó]mina/i.test(i.concepto + " " + catName(i.category_id))) || incomes[0]
  if (!sal) return { frec: "mensual", dia: 30, dia2: 30, txt: "" }
  const q = sal.frec === "quincenal"
  // Días propios de la quincena (reparto) o, como en la v4, 15 y 30.
  const R = incomeReparto(sal)
  const d1 = q && R.d1 ? Math.min(15, Math.max(1, R.d1)) : 15, d2 = q && R.d2 ? Math.min(31, Math.max(16, R.d2)) : 30
  return {
    frec: q ? "quincenal" : "mensual",
    dia: q ? d1 : sal.dia || 30,
    dia2: d2,
    txt: q ? `cada quincena (${d1} y ${d2}), cuando te pagan` : `cada mes el día ${sal.dia || 30}, cuando te pagan`,
  }
}

/** Aporte sugerido redondeado a miles hacia arriba (por quincena si es quincenal). */
export const aporteSugerido = (baseMensual: number, frec: "quincenal" | "mensual"): number =>
  baseMensual ? Math.ceil((frec === "quincenal" ? baseMensual / 2 : baseMensual) / 1000) * 1000 : 0

/** Aporte sugerido al fondo de emergencia: 10 % de los gastos básicos, redondeado a miles. */
export const aporteFondoSugerido = (gastosBasicos: number): number => Math.ceil((gastosBasicos * 0.1) / 1000) * 1000

/** Días válidos de un aporte: quincenal 1..15 (def. 15) y 16..31 (def. 30); mensual 1..31 (def. 30). */
export function aporteDias(frec: "quincenal" | "mensual", dia?: number | null, dia2?: number | null, diaM?: number | null) {
  const q = frec === "quincenal"
  return {
    dia: q ? Math.min(15, Math.max(1, Math.round(dia || 15))) : Math.min(31, Math.max(1, Math.round(diaM || 30))),
    dia2: Math.min(31, Math.max(16, Math.round(dia2 || 30))),
  }
}

/** Usar el fondo para un imprevisto: el fondo cubre hasta su saldo; el resto sale del día a día. */
export function usarFondo(valor: number, saldo: number): { cubre: number; resto: number; saldoFinal: number } {
  const cubre = Math.min(valor, saldo)
  return { cubre, resto: valor - cubre, saldoFinal: saldo - cubre }
}

/** Imprevistos del mes y del año (gastos de la categoría Imprevistos). */
export function imprevistos(expenses: ExpenseIn[], imprevistosId: string | null | undefined, today: DateInput) {
  const t = toDay(today)
  const mes = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`
  const de = expenses.filter((g) => !!imprevistosId && g.category_id === imprevistosId)
  return {
    mes: de.filter((g) => g.fecha.startsWith(mes)).reduce((a, g) => a + +g.valor, 0),
    ano: de.filter((g) => g.fecha.startsWith(String(t.getFullYear()))).reduce((a, g) => a + +g.valor, 0),
  }
}

/** Meta del fondo de emergencia: `emergMeta` meses de gastos básicos. */
export const metaFondo = (gastosBasicos: number, emergMeta: number): number => gastosBasicos * emergMeta

/** Fondo de emergencia (`emergency_funds`): si está activo, su saldo; si no, cuenta lo que tienes disponible. */
export type FondoRef = { activo?: boolean | null; saldo?: number | string | null } | null | undefined

/**
 * Plata con la que cuentas para emergencias: el saldo del fondo si lo activaste (un bolsillo aparte) o, si no, todo tu
 * dinero disponible (cuentas, efectivo y ahorros). La misma regla en Metas, Dashboard y Balance.
 */
export const fondoDisponible = (fund: FondoRef, liquidez: number): number => (fund?.activo ? Math.max(0, Number(fund.saldo ?? 0) || 0) : liquidez)

export interface FondoEstado {
  /** Gastos básicos del mes. */
  basicos: number
  /** Meses de la meta (emerg_meta; 6 si no hay dato). */
  metaMeses: number
  meta: number
  /** Con qué cuentas hoy (`fondoDisponible`). */
  tiene: number
  falta: number
  /** Meses que aguantas sin ingresos. */
  meses: number
  /** ¿Sale del saldo del fondo (true) o de tu dinero disponible (false)? */
  enFondo: boolean
}

/** Cómo va el fondo de emergencia: lo usan Metas, el Dashboard (capacidad) y las decisiones, con las mismas cifras. */
export function fondoEstado(b: Pick<BookData, "fixedExpenses" | "loans" | "subscriptions" | "categories" | "settings">, today: DateInput, liquidez: number, fund?: FondoRef): FondoEstado {
  const basicos = gastosBasicos(b, today)
  const metaMeses = +b.settings.emerg_meta || 6
  const tiene = fondoDisponible(fund, liquidez)
  const meta = metaFondo(basicos, metaMeses)
  return { basicos, metaMeses, meta, tiene, falta: Math.max(0, meta - tiene), meses: basicos ? tiene / basicos : 0, enFondo: !!fund?.activo }
}

/**
 * Plan de una meta: meses que faltan (mín. 1), cuánto guardar al mes y aporte sugerido redondeado a miles.
 */
export function metaPlan(g: Pick<GoalIn, "objetivo" | "ahorrado" | "fecha">, today: DateInput) {
  const t = toDay(today)
  const falta = Math.max(0, g.objetivo - g.ahorrado)
  let meses = 1
  if (g.fecha) {
    const [y, m] = g.fecha.split("-").map(Number)
    meses = Math.max(1, (y - t.getFullYear()) * 12 + m - (t.getMonth() + 1))
  }
  const mensual = falta / meses
  return { falta, meses, mensual, sugerido: Math.ceil(mensual / 1000) * 1000, progreso: g.objetivo ? g.ahorrado / g.objetivo : 0 }
}
