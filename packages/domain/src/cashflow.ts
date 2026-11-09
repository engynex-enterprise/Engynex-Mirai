// Flujo de caja proyectado a 12 meses (equivalente a `flujo()` de b_core.js de la v4).
import { iso, MES, parseDate, toDay } from "./dates"
import { tarjetaPagoMes } from "./cards"
import { fijoPeriods, pagoPeriodo } from "./fixed"
import { fijoValorCOP, incomePagos, pagosMes } from "./reparto"
import { loanEngine } from "./loans"
import { conv } from "./money"
import { subOcc } from "./subscriptions"
import { liquidez, variableMes } from "./totals"
import type { BookData, CalendarEventIn, DateInput } from "./types"

/** ¿La fecha del calendario cae en el mes `a`? Anual (o sin dato, como en la v4): cualquier año; de una sola vez: ese mes y año. */
const calEnMes = (c: Pick<CalendarEventIn, "fecha" | "anual">, a: Date) => {
  const d = parseDate(c.fecha)
  return d.getMonth() === a.getMonth() && (c.anual !== false || d.getFullYear() === a.getFullYear())
}

export interface CashflowMonth {
  /** Etiqueta: 'ene' (+ ' 27' si es enero o el primer mes). */
  l: string
  /** Primer día del mes 'YYYY-MM-DD'. */
  mes: string
  /** Entradas. */
  I: number
  /** Salidas. */
  E: number
  neto: number
  /** Saldo acumulado (empieza en la liquidez de hoy). */
  saldo: number
  det: { ing: number; cob: number; cuo: number; fij: number; sub: number; var: number }
}

/**
 * Proyección mes a mes. Entradas: ingresos mensualizados (los anuales cuentan 0, igual que la v4),
 * fechas de ingreso del calendario, ingresos extra y cuotas por cobrar. Salidas: cuotas por pagar
 * (en el primer mes también las vencidas) y tarjetas, fijos sin pagar, calendario, suscripciones y
 * el presupuesto variable.
 */
export function flujo(b: BookData, today: DateInput): CashflowMonth[] {
  const t = toDay(today)
  const s = b.settings
  const out: CashflowMonth[] = []
  let saldo = liquidez(b.assets, b.investments, s.trm, t)
  const vm = variableMes(b.categories, b.fixedExpenses)
  // Los planes de los préstamos no dependen del mes: se calculan una vez.
  const planes = b.loans.map((L) => ({ kind: L.kind, plan: loanEngine(L, t).plan }))
  for (let k = 0; k < 12; k++) {
    const a = new Date(t.getFullYear(), t.getMonth() + k, 1)
    const bb = new Date(t.getFullYear(), t.getMonth() + k + 1, 0)
    const ai = iso(a)
    const bi = iso(bb)
    const inM = (d: string) => d >= ai && d <= bi
    const det = { ing: 0, cob: 0, cuo: 0, fij: 0, sub: 0, var: vm }
    // Promedio del mes (las quincenas suman n1 + n2 = 2 × valor); el pago anual cuenta en su mes si está guardado.
    for (const x of b.incomes) det.ing += x.frec === "anual" ? incomePagos(x, a.getFullYear(), a.getMonth()).reduce((q, p) => q + conv(p.v, x.currency, s.trm), 0) : conv(x.valor, x.currency, s.trm) * pagosMes(x)
    for (const c of b.calendarEvents) if (c.tipo === "ingreso" && +c.monto > 0 && calEnMes(c, a)) det.ing += +c.monto
    for (const p of planes) if (p.kind === "cobrar") for (const r of p.plan) if (inM(r.fecha)) det.cob += r.valor
    for (const p of planes) if (p.kind === "pagar") for (const r of p.plan) if (inM(r.fecha) || (k === 0 && r.fecha < ai)) det.cuo += r.valor
    for (const f of b.fixedExpenses)
      // En pesos: un fijo en USD o EUR se convierte con la TRM, igual que las suscripciones de abajo.
      for (const p of fijoPeriods(f, a.getFullYear(), a.getMonth(), t)) { const PP = pagoPeriodo(f, p.per, f.payments); if (!PP.completo) det.fij += PP.pagos.length ? PP.falta : fijoValorCOP(f, p.per, s.trm) }
    for (const c of b.calendarEvents) if (c.tipo === "egreso" && +c.monto > 0 && calEnMes(c, a)) det.fij += +c.monto
    for (const sb of b.subscriptions) det.sub += subOcc(sb, a, bb).length * conv(sb.valor, sb.currency, s.trm)
    det.cuo += b.creditCards.reduce((q, c) => q + tarjetaPagoMes(c, t, k), 0)
    for (const x of b.extraIncomes) if (inM(iso(parseDate(x.fecha)))) det.ing += +x.valor
    const I = det.ing + det.cob
    const E = det.cuo + det.fij + det.sub + det.var
    saldo += I - E
    out.push({ l: MES[a.getMonth()] + (a.getMonth() === 0 || k === 0 ? " " + String(a.getFullYear()).slice(2) : ""), mes: ai, I, E, neto: I - E, saldo, det })
  }
  return out
}
