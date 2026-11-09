// "Salir de deudas": simulador avalancha / bola de nieve y simulador de abono
// (equivalente a `sim()` y al bloque de abono de V.estrategia en c_views.js de la v4).
import { iso, toDay } from "./dates"
import { cuotaMensual, loanEngine, loanName, type LoanEngine } from "./loans"
import { compraEstado, deudaTarjeta, tarjetaCuotaMes } from "./cards"
import type { ContactIn, CreditCardIn, DateInput, EntityIn, LoanIn } from "./types"

export interface DebtSim {
  /** Id del préstamo (o su posición si no tiene id). */
  id: string
  /** Nombre que se muestra: contraparte · concepto. */
  n: string
  /** Lo que se debe hoy. */
  s: number
  /** Tasa de interés MENSUAL (fracción). Una deuda quincenal ya viene convertida a su equivalente del mes. */
  i: number
  /** Lo que esa deuda se lleva CADA MES sin seguros (una cuota quincenal cuenta dos veces). */
  c: number
}

export interface DebtSimResult {
  /** Meses hasta terminar todas las deudas (máx. `TOPE_MESES`). */
  m: number
  /** Intereses totales. */
  ti: number
  /** Mes en que termina cada deuda (por id). Las que no se acaban no aparecen. */
  pay: Record<string, number>
  /** Orden en que se atacan (ids). */
  ord: string[]
  /** Nombre de cada deuda (por id). */
  names: Record<string, string>
  /**
   * `false` si al llegar al tope quedaron deudas vivas: con esa cuota no se acaban NUNCA (pasa cuando la cuota no
   * alcanza ni para los intereses del mes, como en un crédito de solo intereses). Con `false`, `m` y `ti` son el tope
   * de la simulación y no una respuesta: no se muestran como si fueran una cifra real.
   */
  fin: boolean
  /** Ids de las deudas que no se acaban. */
  sinFin: string[]
}

/** Tope de la simulación: 50 años. Si se llega aquí es que la deuda no se acaba. */
export const TOPE_MESES = 600

/** Prefijo del id de una tarjeta en la simulación (los préstamos usan su propio id). */
export const CARD_PREFIX = "tc:"

/**
 * Una tarjeta como deuda para simular: lo que debes hoy (`deudaTarjeta`, ya con los pagos que registraste), la tasa
 * mensual ponderada por saldo (las compras a una cuota no causan intereses) y lo que la tarjeta se lleva en un mes
 * normal. Sin saldo, null.
 *
 * La cuota del mes sale de `tarjetaCuotaMes` (el plan de cuotas) y NO de `tarjetaPagoMes` (lo que falta por pagar este
 * mes): si ya pagaste la factura, lo que falta es cero, pero el otro mes vuelves a pagar la cuota. Con cero la deuda
 * nunca bajaba y la simulación terminaba en el tope, con intereses de billones de pesos. Se toma la factura más alta
 * entre este mes y el siguiente para que una compra recién hecha (aún sin facturar) también cuente.
 */
export function cardDebt(t: CreditCardIn, today: DateInput): DebtSim | null {
  let compras = 0, si = 0
  for (const c of t.purchases || []) {
    const e = compraEstado(t, c, today)
    if (e.saldo <= 0) continue
    compras += e.saldo
    si += e.saldo * (e.n > 1 ? (+t.tasa || 0) / 100 : 0)
  }
  const s = deudaTarjeta(t, today)
  if (s <= 1) return null
  return {
    id: CARD_PREFIX + t.id,
    n: `Tarjeta ${t.nombre}`,
    s,
    i: compras > 0 ? si / compras : (+t.tasa || 0) / 100,
    c: Math.max(tarjetaCuotaMes(t, today), tarjetaCuotaMes(t, today, 1)),
  }
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
      return {
        id: L.id ?? String(ix),
        n: loanName(L, contacts, entities) + (L.concepto ? " · " + L.concepto : ""),
        s: e.saldo,
        // `loan.tasa` ya es la tasa MENSUAL: así una deuda quincenal no entra con la tasa de media quincena.
        i: L.sistema === "sin" ? 0 : (+L.tasa || 0) / 100,
        // La misma cifra que `cuotasMes` muestra como compromiso del mes, sin los seguros (que no bajan la deuda).
        c: cuotaMensual(L, today, { eng: e, sinExtra: true }),
      }
    })
    .filter((d) => d.s > 1)
  return [...prest, ...cards.map((t) => cardDebt(t, today)).filter((d): d is DebtSim => !!d)]
}

/**
 * Simula mes a mes: cada deuda causa el interés del mes y recibe su cuota del mes; con `roll`, lo que sobra del
 * presupuesto (cuotas + `extra`) va a las deudas en el orden `order`. A diferencia de la v4, cada paso es un mes de
 * verdad: las deudas quincenales o semanales llegan aquí ya convertidas a su equivalente mensual (`debtsFrom`), así
 * que un crédito a 20 quincenas termina en 10 meses y no en "20 meses".
 */
export function simDebts(debts: DebtSim[], extra: number, order: (a: DebtSim, b: DebtSim) => number, roll = true): DebtSimResult | null {
  const D = debts.map((d) => ({ ...d }))
  if (!D.length) return null
  const budget = D.reduce((a, d) => a + d.c, 0) + extra
  let m = 0
  let ti = 0
  const pay: Record<string, number> = {}
  const ord = [...D].sort(order)
  while (D.some((d) => d.s > 1) && m < TOPE_MESES) {
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
  const sinFin = D.filter((d) => d.s > 1).map((d) => d.id)
  return { m, ti, pay, ord: ord.map((o) => o.id), names: Object.fromEntries(D.map((d) => [d.id, d.n])), fin: !sinFin.length, sinFin }
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
  // Con una sola deuda (o cuando la más cara es también la más pequeña) los dos métodos hacen lo mismo: da igual cuál
  // elijas y la pantalla lo dice en vez de señalar un "ganador" que no existe.
  const empate = avalancha.m === bola.m && Math.abs(avalancha.ti - bola.ti) < 1
  return {
    deudas: D,
    /** Lo que las deudas ya se llevan cada mes sin poner un peso extra. */
    cuotas: D.reduce((a, d) => a + d.c, 0),
    base,
    avalancha,
    bola,
    empate,
    recomendado: avalancha.ti <= bola.ti ? ("avalancha" as const) : ("bola" as const),
  }
}

/** ¿Y si hago un abono hoy? Devuelve el motor antes y después del abono simulado. */
export function simAbono(L: LoanIn, valor: number, modo: "plazo" | "cuota", today: DateInput): { antes: LoanEngine; despues: LoanEngine; ahorroIntereses: number } {
  const antes = loanEngine(L, today)
  const despues = loanEngine({ ...L, payments: [...L.payments, { id: "sim", fecha: iso(toDay(today)), tipo: "abono", valor, modo }] }, today)
  return { antes, despues, ahorroIntereses: Math.max(antes.intTotal - despues.intTotal, 0) }
}
