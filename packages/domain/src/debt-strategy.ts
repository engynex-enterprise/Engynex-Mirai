// "Salir de deudas": simulador avalancha / bola de nieve y simulador de abono
// (equivalente a `sim()` y al bloque de abono de V.estrategia en c_views.js de la v4).
import { iso, toDay } from "./dates"
import { loanEngine, loanName, type LoanEngine } from "./loans"
import { compraEstado, tarjetaPagoMes } from "./cards"
import type { ContactIn, CreditCardIn, DateInput, EntityIn, LoanIn } from "./types"

export interface DebtSim {
  /** Id del préstamo (o su posición si no tiene id). */
  id: string
  /** Nombre que se muestra: contraparte · concepto. */
  n: string
  /** Saldo. */
  s: number
  /** Tasa por periodo. */
  i: number
  /** Cuota mínima sin seguros. */
  c: number
}

export interface DebtSimResult {
  /** Meses hasta terminar todas las deudas (máx. 600). */
  m: number
  /** Intereses totales. */
  ti: number
  /** Mes en que termina cada deuda (por id). */
  pay: Record<string, number>
  /** Orden en que se atacan (ids). */
  ord: string[]
  /** Nombre de cada deuda (por id). */
  names: Record<string, string>
}

/** Prefijo del id de una tarjeta en la simulación (los préstamos usan su propio id). */
export const CARD_PREFIX = "tc:"

/**
 * Una tarjeta como deuda para simular: saldo de todas sus compras, tasa mensual ponderada por saldo (las compras a una
 * cuota no causan intereses) y pago mínimo = las cuotas que factura este mes. Sin saldo, null.
 */
export function cardDebt(t: CreditCardIn, today: DateInput): DebtSim | null {
  let s = 0, si = 0
  for (const c of t.purchases || []) {
    const e = compraEstado(t, c, today)
    if (e.saldo <= 0) continue
    s += e.saldo
    si += e.saldo * (e.n > 1 ? (+t.tasa || 0) / 100 : 0)
  }
  if (s <= 1) return null
  return { id: CARD_PREFIX + t.id, n: `Tarjeta ${t.nombre}`, s, i: s ? si / s : 0, c: tarjetaPagoMes(t, today) }
}

/**
 * Deudas por pagar con saldo, listas para simular: préstamos de Le debo y, si se pasan, las tarjetas de crédito.
 * Los pasivos escritos a mano en Balance no entran: no tienen tasa ni cuota (la vista los lista aparte).
 */
export function debtsFrom(loans: LoanIn[], contacts: ContactIn[], entities: EntityIn[], today: DateInput, cards: CreditCardIn[] = []): DebtSim[] {
  const prest = loans
    .filter((L) => L.kind === "pagar")
    .map((L, ix) => {
      const e = loanEngine(L, today)
      return { id: L.id ?? String(ix), n: loanName(L, contacts, entities) + (L.concepto ? " · " + L.concepto : ""), s: e.saldo, i: e.i, c: e.next ? e.next.valor - (+(L.extra ?? 0) || 0) : 0 }
    })
    .filter((d) => d.s > 1)
  return [...prest, ...cards.map((t) => cardDebt(t, today)).filter((d): d is DebtSim => !!d)]
}

/**
 * Simula mes a mes: cada deuda causa interés y recibe su cuota mínima; con `roll`, lo que sobra del
 * presupuesto (cuotas + `extra`) va a las deudas en el orden `order`. Nota: igual que la v4, cada
 * paso es un "mes" aunque la deuda sea quincenal (usa la tasa por periodo).
 */
export function simDebts(debts: DebtSim[], extra: number, order: (a: DebtSim, b: DebtSim) => number, roll = true): DebtSimResult | null {
  const D = debts.map((d) => ({ ...d }))
  if (!D.length) return null
  const budget = D.reduce((a, d) => a + d.c, 0) + extra
  let m = 0
  let ti = 0
  const pay: Record<string, number> = {}
  const ord = [...D].sort(order)
  while (D.some((d) => d.s > 1) && m < 600) {
    m++
    D.forEach((d) => {
      if (d.s > 1) {
        const int = d.s * d.i
        d.s += int
        ti += int
      }
    })
    let avl = budget
    D.forEach((d) => {
      if (d.s > 1) {
        const p = Math.min(d.c, d.s)
        d.s -= p
        avl -= p
      }
    })
    if (roll) {
      avl = Math.max(avl, 0)
      for (const o of ord) {
        const d = D.find((x) => x.id === o.id)!
        if (d.s > 1 && avl > 0) {
          const p = Math.min(avl, d.s)
          d.s -= p
          avl -= p
        }
      }
    }
    D.forEach((d) => {
      if (d.s <= 1 && !pay[d.id]) pay[d.id] = m
    })
  }
  return { m, ti, pay, ord: ord.map((o) => o.id), names: Object.fromEntries(D.map((d) => [d.id, d.n])) }
}

/** Avalancha: el dinero extra va primero a la deuda con la tasa más alta. */
export const byAvalancha = (a: DebtSim, b: DebtSim) => b.i - a.i
/** Bola de nieve: el dinero extra va primero a la deuda más pequeña. */
export const byBolaNieve = (a: DebtSim, b: DebtSim) => a.s - b.s

/** Compara pagar solo las cuotas, avalancha y bola de nieve con `extra` pesos más al mes (préstamos y tarjetas). */
export function debtStrategy(loans: LoanIn[], contacts: ContactIn[], entities: EntityIn[], extra: number, today: DateInput, cards: CreditCardIn[] = []) {
  const D = debtsFrom(loans, contacts, entities, today, cards)
  const base = simDebts(D, 0, () => 0, false)
  const avalancha = simDebts(D, extra, byAvalancha)
  const bola = simDebts(D, extra, byBolaNieve)
  if (!base || !avalancha || !bola) return null
  return { base, avalancha, bola, recomendado: avalancha.ti <= bola.ti ? ("avalancha" as const) : ("bola" as const) }
}

/** ¿Y si hago un abono hoy? Devuelve el motor antes y después del abono simulado. */
export function simAbono(L: LoanIn, valor: number, modo: "plazo" | "cuota", today: DateInput): { antes: LoanEngine; despues: LoanEngine; ahorroIntereses: number } {
  const antes = loanEngine(L, today)
  const despues = loanEngine({ ...L, payments: [...L.payments, { id: "sim", fecha: iso(toDay(today)), tipo: "abono", valor, modo }] }, today)
  return { antes, despues, ahorroIntereses: Math.max(antes.intTotal - despues.intTotal, 0) }
}
