// Entradas y salidas de una quincena o de un mes (equivalente a `quincena()` de b_core.js de la v4).
import { fshort, iso, lastDay, parseDate } from "./dates"
import { fijoValor, incomePagos } from "./reparto"
import { tarjetaPagoMes } from "./cards"
import { fijoPeriods, pagoPeriodo } from "./fixed"
import { loanCal, loanEngine, loanName } from "./loans"
import { conv } from "./money"
import { subOcc } from "./subscriptions"
import { variableMes } from "./totals"
import type { BookData, CategoryIn, DateInput } from "./types"

export type QuincenaWhich = "q1" | "q2" | "mes"

export interface FlowItem {
  icon: string
  /** Nombre. */
  n: string
  /** Subtítulo. */
  s: string
  /** Valor en COP. */
  v: number
  fecha: string
  paid?: boolean
}

export interface Quincena {
  /** Inicio y fin del rango ('YYYY-MM-DD'). */
  a: string
  b: string
  ent: FlowItem[]
  sal: FlowItem[]
  /** Total que entra. */
  E: number
  /** Total que sale. */
  Sa: number
  /** Lo que queda disponible. */
  disp: number
}

export const catIcon = (categories: CategoryIn[], id: string | null | undefined): string => (id && categories.find((c) => c.id === id)?.icon) || "tag"

/**
 * Lo que entra y sale en la 1ª quincena (`q1`: día 1 al corte), la 2ª (`q2`: corte+1 a fin de mes)
 * o el mes completo (`mes`) del mes `m` (base 0) del año `y`. El corte es `corte_q` (1..27, por defecto 15).
 */
export function quincena(b: BookData, y: number, m: number, which: QuincenaWhich, today: DateInput): Quincena {
  const trm = b.settings.trm
  const ld = lastDay(y, m)
  const cq = Math.min(Math.max(+b.settings.corte_q || 15, 1), 27)
  const a = new Date(y, m, which === "q2" ? cq + 1 : 1)
  const bb = new Date(y, m, which === "q1" ? cq : ld)
  const ai = iso(a)
  const bi = iso(bb)
  const inR = (d: string) => d >= ai && d <= bi
  const ent: FlowItem[] = []
  const sal: FlowItem[] = []
  for (const x of b.incomes) {
    const pagos = incomePagos(x, y, m).filter((p) => inR(p.fecha))
    if (x.frec === "semanal") {
      if (pagos.length) ent.push({ icon: "briefcase", n: x.concepto, s: `${pagos.length} pagos semanales`, v: conv(x.valor, x.currency, trm) * pagos.length, fecha: ai })
      continue
    }
    if (x.frec === "diario") {
      for (const p of pagos) ent.push({ icon: "briefcase", n: x.concepto, s: `${p.dias} días de pago`, v: conv(p.v, x.currency, trm), fecha: ai })
      continue
    }
    const tag = x.frec === "quincenal" ? "Ingreso quincenal · " : x.frec === "anual" ? "Ingreso anual · " : "Ingreso · "
    for (const p of pagos) ent.push({ icon: "briefcase", n: x.concepto, s: tag + fshort(parseDate(p.fecha)), v: conv(p.v, x.currency, trm), fecha: p.fecha })
  }
  const cobrar = b.loans.filter((L) => L.kind === "cobrar")
  const pagar = b.loans.filter((L) => L.kind === "pagar")
  for (const L of cobrar)
    for (const r of loanCal(loanEngine(L, today)))
      if (inR(r.fecha)) ent.push({ icon: "hand-coins", n: `Cuota ${r.n} · ${loanName(L, b.contacts, b.entities)}`, s: "Te pagan · " + fshort(parseDate(r.fecha)), v: r.valor, fecha: r.fecha, paid: r.paid })
  const calDate = (fecha: string) => {
    const p = parseDate(fecha)
    return new Date(y, p.getMonth(), p.getDate())
  }
  for (const c of b.calendarEvents.filter((c) => c.tipo === "ingreso" && +c.monto > 0)) {
    const d = calDate(c.fecha)
    if (inR(iso(d))) ent.push({ icon: "calendar", n: c.titulo, s: fshort(d), v: +c.monto, fecha: iso(d) })
  }
  for (const f of b.fixedExpenses)
    for (const p of fijoPeriods(f, y, m, today))
      if (inR(p.due)) {
        // Abonos (pagoPeriodo): lo pagado y, si falta, lo que falta como otra línea sin pagar.
        const PP = pagoPeriodo(f, p.per, f.payments)
        sal.push({ icon: catIcon(b.categories, f.category_id), n: f.nombre, s: "Gasto fijo · " + fshort(parseDate(p.due)), v: PP.pagos.length ? PP.pagado : fijoValor(f, p.per), fecha: p.due, paid: PP.pagos.length > 0 })
        if (PP.parcial && PP.falta > 0.5) sal.push({ icon: catIcon(b.categories, f.category_id), n: `${f.nombre} (falta)`, s: "Gasto fijo · " + fshort(parseDate(p.due)), v: PP.falta, fecha: p.due, paid: false })
      }
  for (const L of pagar)
    for (const r of loanCal(loanEngine(L, today)))
      if (inR(r.fecha)) sal.push({ icon: "landmark", n: `Cuota ${r.n} · ${loanName(L, b.contacts, b.entities)}`, s: "Crédito · " + fshort(parseDate(r.fecha)), v: r.valor, fecha: r.fecha, paid: r.paid })
  for (const s of b.subscriptions)
    for (const d of subOcc(s, a, bb)) sal.push({ icon: "repeat", n: s.nombre, s: "Suscripción · " + fshort(d), v: conv(s.valor, s.currency, trm), fecha: iso(d) })
  for (const c of b.calendarEvents.filter((c) => c.tipo === "egreso" && +c.monto > 0)) {
    const d = calDate(c.fecha)
    if (inR(iso(d))) sal.push({ icon: "calendar", n: c.titulo, s: fshort(d), v: +c.monto, fecha: iso(d) })
  }
  for (const x of b.extraIncomes) {
    const d = parseDate(x.fecha)
    if (inR(iso(d))) ent.push({ icon: "coins", n: x.descripcion, s: "Ingreso extra · " + fshort(d), v: +x.valor, fecha: iso(d), paid: true })
  }
  for (const t of b.creditCards) {
    const d = new Date(y, m, Math.min(+t.pago || 15, ld))
    const pm = tarjetaPagoMes(t, today)
    if (inR(iso(d)) && pm > 0) sal.push({ icon: "credit-card", n: "Tarjeta " + t.nombre, s: "Pago mínimo · " + fshort(d), v: pm, fecha: iso(d) })
  }
  const vm = variableMes(b.categories, b.fixedExpenses)
  if (vm) sal.push({ icon: "shopping-cart", n: "Gasto variable estimado", s: "Mercado, transporte, gustos… según tu presupuesto", v: which === "mes" ? vm : vm / 2, fecha: bi })
  const byFecha = (p: FlowItem, q: FlowItem) => (p.fecha < q.fecha ? -1 : p.fecha > q.fecha ? 1 : 0)
  ent.sort(byFecha)
  sal.sort(byFecha)
  const E = ent.reduce((s, x) => s + x.v, 0)
  const Sa = sal.reduce((s, x) => s + x.v, 0)
  return { a: ai, b: bi, ent, sal, E, Sa, disp: E - Sa }
}
