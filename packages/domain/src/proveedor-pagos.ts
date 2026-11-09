// Próximo pago y deudas con cada proveedor (Proveedores: columnas "Próximo pago" y "Le debes / Te debe").
import { fijoStatus } from "./fixed"
import { fijoValorCOP } from "./reparto"
import { loanEngine } from "./loans"
import { conv } from "./money"
import type { DateInput, FixedExpenseIn, LoanIn, Trm } from "./types"

export interface ProviderNext {
  /** Fecha 'YYYY-MM-DD' del pago más cercano (el vencido más antiguo si hay). */
  fecha: string
  valor: number
  /** Qué se paga: el nombre del gasto fijo o de la suscripción. */
  nombre: string
  origen: "fijo" | "suscripcion"
  id: string
  vencido: boolean
}

type SubNext = { id: string; nombre: string; provider_id?: string | null; valor: number | string; currency?: string | null; proximo?: string | null; activa?: boolean | null }
type FixedWithProv = FixedExpenseIn & { provider_id?: string | null }

/**
 * Próximo pago pendiente de cada proveedor: entre sus gastos fijos (primer periodo vencido o el próximo sin pagar) y
 * sus suscripciones activas (fecha del próximo cobro), el de fecha más cercana. Un pago vencido siempre va primero.
 */
export function providerNextPayments(fixed: FixedWithProv[], subs: SubNext[], today: DateInput, trm: Trm): Map<string, ProviderNext> {
  const t = typeof today === "string" ? today.slice(0, 10) : new Date(today).toISOString().slice(0, 10)
  const out = new Map<string, ProviderNext>()
  const put = (pid: string, n: ProviderNext) => { const cur = out.get(pid); if (!cur || n.fecha < cur.fecha) out.set(pid, n) }
  for (const f of fixed) {
    if (!f.provider_id) continue
    const st = fijoStatus(f, today)
    const p = st.venc[0] ?? st.prox
    // En pesos (como la suscripción de abajo): la columna "Próximo pago" no mezcla monedas.
    if (p) put(f.provider_id, { fecha: p.due, valor: fijoValorCOP(f, p.per, trm), nombre: f.nombre, origen: "fijo", id: f.id, vencido: p.due < t })
  }
  for (const s of subs) {
    if (!s.provider_id || s.activa === false || !s.proximo) continue
    put(s.provider_id, { fecha: s.proximo, valor: Math.round(conv(Number(s.valor), s.currency ?? "COP", trm)), nombre: s.nombre, origen: "suscripcion", id: s.id, vencido: s.proximo < t })
  }
  return out
}

export interface ProviderDebt {
  /** Lo que le debes (préstamos kind 'pagar'). */
  debes: number
  /** Lo que te debe (préstamos kind 'cobrar'). */
  teDebe: number
  /** Próxima cuota (de cualquiera de los dos lados), la más cercana. */
  next: { fecha: string; valor: number; kind: "cobrar" | "pagar"; loanId: string } | null
  /** Hay cuotas vencidas sin pagar. */
  mora: boolean
  loans: { id: string; kind: "cobrar" | "pagar"; saldo: number; done: boolean; mora: number; next: { fecha: string; valor: number } | null }[]
}

/** Saldo con cada proveedor según sus préstamos enlazados (loans.provider_id), con el motor de préstamos. */
export function providerDebts(loans: (LoanIn & { id?: string; provider_id?: string | null })[], today: DateInput): Map<string, ProviderDebt> {
  const out = new Map<string, ProviderDebt>()
  for (const L of loans) {
    if (!L.provider_id || !L.id) continue
    const e = loanEngine(L, today)
    const kind = L.kind === "cobrar" ? "cobrar" : "pagar"
    let d = out.get(L.provider_id)
    if (!d) out.set(L.provider_id, (d = { debes: 0, teDebe: 0, next: null, mora: false, loans: [] }))
    if (kind === "pagar") d.debes += e.saldo; else d.teDebe += e.saldo
    const nx = e.done ? null : (e.vencidas[0] ?? e.next)
    if (nx && (!d.next || nx.fecha < d.next.fecha)) d.next = { fecha: nx.fecha, valor: nx.valor, kind, loanId: L.id }
    if (!e.done && e.mora > 0) d.mora = true
    d.loans.push({ id: L.id, kind, saldo: e.saldo, done: e.done, mora: e.mora, next: nx ? { fecha: nx.fecha, valor: nx.valor } : null })
  }
  for (const d of out.values()) { d.debes = Math.round(d.debes); d.teDebe = Math.round(d.teDebe) }
  return out
}

/** Pagado a un proveedor mes a mes (últimos `n` meses, del más antiguo al actual) a partir de sus gastos. */
export function providerMonthly(expenses: { provider_id?: string | null; valor: number | string; fecha: string }[], providerId: string, today: string, n = 12) {
  const [y, m] = today.split("-").map(Number)
  const months = Array.from({ length: n }, (_, i) => { const d = new Date(y, m - n + i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` })
  const sum = new Map(months.map((k) => [k, 0]))
  for (const g of expenses) if (g.provider_id === providerId) { const k = g.fecha.slice(0, 7); if (sum.has(k)) sum.set(k, sum.get(k)! + Number(g.valor)) }
  return months.map((mes) => ({ mes, valor: Math.round(sum.get(mes)!) }))
}

/** Proveedor con el mismo nombre (normalizado) que el contacto o la entidad de un préstamo: se sugiere enlazarlo. */
export function suggestLoanProvider<P extends { id: string; nombre: string }>(name: string | null | undefined, providers: P[], norm: (s: string) => string): P | undefined {
  const n = norm(name ?? "")
  return n ? providers.find((p) => norm(p.nombre) === n) : undefined
}
