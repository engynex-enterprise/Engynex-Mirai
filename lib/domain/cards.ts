// Tarjetas de crédito: cuotas de las compras, pago del mes y deuda (equivalente a f_extra.js de la v4).
import { addMonths, lastDay, parseDate, toDay } from "./dates"
import { annuity } from "./loans"
import type { CardPurchaseIn, CreditCardIn, DateInput } from "./types"

/** Cortes de la tarjeta (día `corte`, recortado a fin de mes) posteriores a la compra y ≤ `hasta` (máx. 600). */
export function cortesDesde(t: Pick<CreditCardIn, "corte">, fecha: string, hasta: Date): number {
  const c = +t.corte || 25
  let n = 0
  const d = parseDate(fecha)
  let cur = new Date(d.getFullYear(), d.getMonth(), Math.min(c, lastDay(d.getFullYear(), d.getMonth())))
  if (cur <= d) cur = new Date(d.getFullYear(), d.getMonth() + 1, Math.min(c, lastDay(d.getFullYear(), d.getMonth() + 1)))
  while (cur <= hasta && n < 600) {
    n++
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, Math.min(c, lastDay(cur.getFullYear(), cur.getMonth() + 1)))
  }
  return n
}

export interface PurchaseState {
  /** Valor de cada cuota. */
  cuota: number
  /** Número de cuotas. */
  n: number
  /** Cuotas ya facturadas. */
  k: number
  saldo: number
  /** Intereses totales de la compra. */
  int: number
  pendiente: boolean
}

/** Estado de una compra a cuotas a una fecha. Una sola cuota no causa intereses. */
export function compraEstado(t: Pick<CreditCardIn, "corte" | "tasa">, c: CardPurchaseIn, hasta: DateInput): PurchaseState {
  const n = Math.max(1, +c.cuotas || 1)
  const i = n > 1 ? (+t.tasa || 0) / 100 : 0
  const cuota = annuity(+c.valor, i, n)
  const k = c.pagada ? n : Math.min(cortesDesde(t, c.fecha, toDay(hasta)), n)
  let saldo = +c.valor
  for (let j = 0; j < k; j++) {
    const int = saldo * i
    saldo = Math.max(0, saldo - (cuota - int))
  }
  if (c.pagada) saldo = 0
  return { cuota, n, k, saldo, int: cuota * n - c.valor, pendiente: k < n && !c.pagada }
}

/** Pago del mes de la tarjeta (suma de cuotas pendientes) a hoy + `offset` meses. */
export function tarjetaPagoMes(t: CreditCardIn, today: DateInput, offset = 0): number {
  const ref = addMonths(toDay(today), offset)
  return (t.purchases || []).reduce((a, c) => {
    const e = compraEstado(t, c, ref)
    return a + (e.pendiente ? e.cuota : 0)
  }, 0)
}

/** Deuda total en tarjetas (saldo de todas las compras). */
export function tarjetasDeuda(cards: CreditCardIn[], today: DateInput): number {
  return (cards || []).reduce((a, t) => a + (t.purchases || []).reduce((b, c) => b + compraEstado(t, c, today).saldo, 0), 0)
}
