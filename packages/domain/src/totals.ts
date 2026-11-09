// Cálculos generales del libro: ingresos, gastos, liquidez, patrimonio y gastos hormiga
// (equivalente a b_core.js y `gastosBasicos` de d_app.js de la v4).
import { addMonths, iso, lastDay, MES, mkey, parseDate, toDay } from "./dates"
import { tarjetasDeuda } from "./cards"
import { fijoMensual } from "./fixed"
import { isHormiga } from "./hormiga"
import { inv } from "./investments"
import { cuotaMensual, FMES, loanEngine } from "./loans"
import { conv } from "./money"
import { incomeReparto, pagosMes } from "./reparto"
import { subsMes } from "./subscriptions"
import type {
  AssetIn, BookData, CategoryIn, DateInput, ExpenseIn, FixedExpenseIn, IncomeIn, InvestmentIn, LoanIn, Trm,
} from "./types"

/** Veces que se recibe un ingreso al mes según su frecuencia. */
export const FREC: Record<string, number> = { mensual: 1, quincenal: 2, semanal: 52 / 12, anual: 1 / 12, diario: 30 }

/** Ingreso mensual equivalente de todos los ingresos (en COP). */
export const ingresoMensual = (incomes: IncomeIn[], trm: Trm): number =>
  incomes.reduce((a, x) => a + conv(x.valor, x.currency, trm) * pagosMes(x), 0)

/**
 * Ingreso del mes antes de descuentos: el bruto de los ingresos con nómina (en quincenas con valores distintos, la suma
 * de las dos) y el valor de los demás. Junto con `ingresoMensual` (lo que llega) muestra cuánto se va en descuentos.
 */
export const ingresoBrutoMensual = (incomes: IncomeIn[], trm: Trm): number =>
  incomes.reduce((a, x) => {
    const b = +(x.bruto ?? 0)
    if (!(b > 0)) return a + conv(x.valor, x.currency, trm) * pagosMes(x)
    const R = incomeReparto(x)
    const mes = x.frec === "quincenal" && R.b1 != null && R.b2 != null ? +R.b1 + +R.b2 : b * pagosMes(x)
    return a + conv(mes, x.currency, trm)
  }, 0)

/** Dinero disponible: cuentas y efectivo (PUC 11xx) + inversiones de tipo ahorro. */
export function liquidez(assets: AssetIn[], investments: InvestmentIn[], trm: Trm, today: DateInput): number {
  return (
    assets.filter((a) => /^11/.test(a.cod)).reduce((s, a) => s + conv(a.valor, a.currency, trm), 0) +
    investments.filter((x) => x.tipo === "ahorro").reduce((a, x) => a + inv(x, today).valor, 0)
  )
}

/**
 * Compromiso mensual de los préstamos activos de un tipo (para compararlo con el ingreso): la cuota × las veces al mes.
 * Un pago único (o el último pago grande de un préstamo "solo intereses") no cuenta como si fuera de todos los meses: se
 * reparte entre los meses que faltan para pagarlo. En "solo intereses" cuentan los intereses de cada mes.
 */
export function cuotasMes(loans: LoanIn[], kind: "cobrar" | "pagar", today: DateInput): number {
  return loans.filter((L) => L.kind === kind).reduce((a, L) => a + cuotaMensual(L, today), 0)
}

/**
 * Cuotas que tocan este mes según el plan de cada préstamo (pagadas o no): la misma cifra del Balance del mes. Un pago
 * único cuenta solo en el mes en que vence.
 */
export function cuotasDelMes(loans: LoanIn[], kind: "cobrar" | "pagar", today: DateInput): number {
  const k = mkey(toDay(today))
  return loans
    .filter((L) => L.kind === kind)
    .reduce((a, L) => {
      const e = loanEngine(L, today)
      const pagadas = e.hist.filter((h) => h.tipo === "cuota" && h.prog.startsWith(k)).reduce((x, h) => x + h.valor, 0)
      const faltan = [...e.vencidas, ...e.plan].filter((q, i, arr) => q.fecha.startsWith(k) && arr.findIndex((z) => z.n === q.n) === i).reduce((x, q) => x + q.valor, 0)
      return a + pagadas + faltan
    }, 0)
}

/** Suma mensual de los gastos fijos (en pesos si se pasa la TRM). */
export const fijosMes = (fixed: FixedExpenseIn[], trm?: Record<string, number> | null): number => fixed.reduce((a, f) => a + fijoMensual(f, trm), 0)

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

/**
 * Lo que sueles gastar en el día a día (sin pagos de fijos), sin inventar con pocos datos: el promedio de los meses
 * completos de los últimos 3 desde que registras gastos (el primer mes casi siempre está a medias), con al menos 2;
 * si no hay, los topes del presupuesto; si tampoco, "sin-datos" (0, y la app lo dice en vez de afirmar una cifra).
 */
export function gastoVariable(expenses: ExpenseIn[], categories: CategoryIn[], fixed: FixedExpenseIn[], today: DateInput): { valor: number; base: "historial" | "presupuesto" | "sin-datos"; meses: number } {
  const t = toDay(today)
  const desde = expenses.reduce<string | null>((a, g) => (!a || g.fecha < a ? g.fecha : a), null)
  // El primer mes cuenta completo solo si empezó a registrar en los 3 primeros días.
  const primerMes = desde ? (Number(desde.slice(8, 10)) <= 3 ? desde.slice(0, 7) : mkey(addMonths(parseDate(desde.slice(0, 7) + "-01"), 1))) : null
  let tot = 0, n = 0
  for (let j = 1; j <= 3; j++) {
    const k = mkey(addMonths(new Date(t.getFullYear(), t.getMonth(), 1), -j))
    if (!primerMes || k < primerMes) continue
    const g = gastosMesK(expenses, k).filter((x) => !x.fixed_expense_id)
    if (g.length) { tot += g.reduce((a, x) => a + +x.valor, 0); n++ }
  }
  if (n >= 2) return { valor: tot / n, base: "historial", meses: n }
  const pres = variableMes(categories, fixed)
  return pres > 0 ? { valor: pres, base: "presupuesto", meses: n } : { valor: 0, base: "sin-datos", meses: n }
}

/** Gastos básicos del mes: fijos + cuotas de deudas + suscripciones + topes de necesidades sin gasto fijo. */
export function gastosBasicos(b: Pick<BookData, "fixedExpenses" | "loans" | "subscriptions" | "categories" | "settings">, today: DateInput): number {
  const fc = fixedCategoryIds(b.fixedExpenses)
  return (
    // Sin los aportes a metas o al fondo (fijos con link_type): ahorrar no es un gasto básico.
    fijosMes(b.fixedExpenses.filter((f) => !(f as { link_type?: string | null }).link_type), b.settings.trm) +
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

/**
 * De dónde sale una proyección del mes:
 *  · "mes-cerrado": el mes ya terminó (es lo que se gastó).
 *  · "historial":   lo que llevas + tu promedio diario de los meses anteriores × los días que faltan.
 *  · "ritmo":       sin historial: lo que llevas + tu ritmo de este mes (desde que empezaste a registrar) × los días que faltan.
 *  · "pronto":      sin historial y con menos de 14 días o 4 registros: no se proyecta (sería adivinar).
 */
export type BaseProyeccion = "mes-cerrado" | "historial" | "ritmo" | "pronto"
export interface Proyeccion { valor: number; base: BaseProyeccion; /** Días con datos este mes (para el texto). */ dias: number }

/** Sin historial, para proyectar con el ritmo del mes: al menos 14 días de datos y 4 registros. */
export const DIAS_MIN_PROYECCION = 14
export const REGISTROS_MIN_PROYECCION = 4

/**
 * Proyección del total de un mes sin inflar lo de pocos días: con meses anteriores usa su promedio para lo que falta;
 * sin historial usa el ritmo desde el primer registro (no desde el día 1) y solo con 14 días y 4 registros o más.
 * `mes` AAAA-MM, `hoy` AAAA-MM-DD, `previos` = totales de los meses anteriores con datos, `desde` = primer registro.
 */
export function proyectarMes(o: { llevas: number; mes: string; hoy: string; previos: number[]; desde?: string | null; registros?: number }): Proyeccion {
  const [y, m] = o.mes.split("-").map(Number)
  const dim = lastDay(y, m - 1)
  const mesHoy = o.hoy.slice(0, 7)
  if (o.mes < mesHoy) return { valor: o.llevas, base: "mes-cerrado", dias: dim }
  if (o.mes > mesHoy) return { valor: o.llevas, base: "pronto", dias: 0 }
  const dia = Number(o.hoy.slice(8, 10))
  const inicio = o.desde && o.desde.startsWith(o.mes) ? Math.min(dia, Number(o.desde.slice(8, 10))) : 1
  const dias = dia - inicio + 1
  const faltan = dim - dia
  const prev = o.previos.filter((v) => v >= 0)
  if (prev.length >= 2) {
    const diario = prev.reduce((a, v) => a + v, 0) / prev.length / 30.4
    return { valor: Math.round(o.llevas + diario * faltan), base: "historial", dias }
  }
  if (dias >= DIAS_MIN_PROYECCION && (o.registros ?? Infinity) >= REGISTROS_MIN_PROYECCION) return { valor: Math.round(o.llevas + (o.llevas / dias) * faltan), base: "ritmo", dias }
  return { valor: o.llevas, base: "pronto", dias }
}

export interface HormigaResumen<T> {
  /** Gastos hormiga del mes actual. */
  mes: T[]
  /** Por categoría (clave = category_id, o '' si no tiene). */
  porCat: Record<string, { n: number; v: number }>
  totalMes: number
  /** Últimos 6 meses, del más antiguo al actual. */
  meses: { l: string; v: number }[]
  /** Proyección del mes (ver `proyectarMes`): con pocos datos es lo que llevas (`base` "pronto"). */
  proy: number
  base: BaseProyeccion
  /** Días con datos este mes. */
  dias: number
  /** Al año (proyección × 12); 0 mientras es "pronto". */
  anual: number
  /** ¿Ya pasaste el límite mensual? */
  pasado: boolean
  /** ¿Lo pasaste o la proyección (con datos suficientes) lo supera? */
  over: boolean
}

/** Resumen de gastos hormiga del mes y proyección (`proyectarMes`: sin inflar lo de pocos días). */
export function hormigas<T extends ExpenseIn>(b: { expenses: T[]; categories: CategoryIn[]; settings: Pick<BookData["settings"], "umbral" | "limite"> }, today: DateInput, mesVer?: string): HormigaResumen<T> {
  const hoy = toDay(today)
  // `mesVer` (AAAA-MM): el resumen de otro mes (Gastos deja elegir el mes); por defecto, el actual.
  const t = mesVer && mesVer !== mkey(hoy) ? new Date(+mesVer.slice(0, 4), +mesVer.slice(5, 7) - 1, 1) : hoy
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
  const meses: { l: string; v: number; k: string }[] = []
  for (let j = 5; j >= 0; j--) {
    const a = addMonths(new Date(t.getFullYear(), t.getMonth(), 1), -j)
    const kk = mkey(a)
    meses.push({ l: MES[a.getMonth()], v: small.filter((g) => g.fecha.startsWith(kk)).reduce((s, g) => s + +g.valor, 0), k: kk })
  }
  // Historial: solo meses completos desde que la persona registra gastos (un mes sin usar Mirai no cuenta como $0).
  const desde = b.expenses.reduce<string | null>((a, g) => (!a || g.fecha < a ? g.fecha : a), null)
  const previos = meses.slice(0, -1).filter((x) => desde && x.k > desde.slice(0, 7)).map((x) => x.v)
  const P = proyectarMes({ llevas: totalMes, mes: k, hoy: iso(hoy), previos, desde, registros: mes.length })
  const limite = +b.settings.limite || 0
  const pasado = limite > 0 && totalMes > limite
  return {
    mes, porCat, totalMes, meses: meses.map(({ l, v }) => ({ l, v })), proy: P.valor, base: P.base, dias: P.dias,
    anual: P.base === "pronto" ? 0 : P.valor * 12, pasado, over: pasado || (limite > 0 && P.base !== "pronto" && P.valor > limite),
  }
}
