// Tarjetas de crédito: cuotas de las compras, pago del mes y deuda (equivalente a f_extra.js de la v4).
import { addMonths, iso, lastDay, parseDate, toDay } from "./dates"
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

const dia = (y: number, m: number, d: number) => new Date(y, m, Math.min(d, lastDay(y, m)))
const corteDia = (t: Pick<CreditCardIn, "corte">) => +t.corte || 25
const pagoDia = (t: { pago?: number | null }) => +(t.pago ?? 0) || 10

/**
 * Corte cuya factura se paga en el mes `m` (base 0) de `y`: si el día de pago va después del de corte, el corte de ese
 * mismo mes (corte 5 → pago 20); si no, el del mes anterior (corte 25 → pago 10 del mes siguiente).
 */
export function cortePagadoEnMes(t: Pick<CreditCardIn, "corte"> & { pago?: number | null }, y: number, m: number): Date {
  return pagoDia(t) > corteDia(t) ? dia(y, m, corteDia(t)) : dia(y, m - 1, corteDia(t))
}

/** Fecha límite de pago en el mes `m` de `y`. */
export const fechaPagoMes = (t: { pago?: number | null }, y: number, m: number) => dia(y, m, pagoDia(t))

/** Último corte cuya fecha de pago ya llegó a `hasta` (lo pagado hasta ese día, si pagaste a tiempo). */
function ultimoCortePagado(t: Pick<CreditCardIn, "corte"> & { pago?: number | null }, hasta: Date): Date {
  const y = hasta.getFullYear(), m = hasta.getMonth()
  return hasta >= fechaPagoMes(t, y, m) ? cortePagadoEnMes(t, y, m) : cortePagadoEnMes(t, y, m - 1)
}

export interface PurchaseState {
  /** Valor de cada cuota. */
  cuota: number
  /** Número de cuotas. */
  n: number
  /** Cuotas ya pagadas (su fecha de pago ya pasó). */
  k: number
  /** Cuotas ya facturadas (cortes después de la compra). */
  fact: number
  saldo: number
  /** Intereses totales de la compra. */
  int: number
  pendiente: boolean
}

/**
 * Estado de una compra a cuotas a una fecha. La cuota j se cobra en el j-ésimo corte después de la compra y se paga en
 * la fecha de pago siguiente: el saldo baja ese día, no el día del corte. Una sola cuota no causa intereses.
 */
export function compraEstado(t: Pick<CreditCardIn, "corte" | "tasa"> & { pago?: number | null }, c: CardPurchaseIn, hasta: DateInput): PurchaseState {
  const n = Math.max(1, +c.cuotas || 1)
  const i = n > 1 ? (+t.tasa || 0) / 100 : 0
  const cuota = annuity(+c.valor, i, n)
  const h = toDay(hasta)
  // Antes de la compra no hay nada que deber.
  if (!c.pagada && iso(h) < String(c.fecha).slice(0, 10)) return { cuota, n, k: 0, fact: 0, saldo: 0, int: cuota * n - c.valor, pendiente: false }
  const fact = c.pagada ? n : Math.min(cortesDesde(t, c.fecha, h), n)
  const k = c.pagada ? n : Math.min(cortesDesde(t, c.fecha, ultimoCortePagado(t, h)), n)
  let saldo = +c.valor
  for (let j = 0; j < k; j++) {
    const int = saldo * i
    saldo = Math.max(0, saldo - (cuota - int))
  }
  if (c.pagada) saldo = 0
  return { cuota, n, k, fact, saldo, int: cuota * n - c.valor, pendiente: k < n && !c.pagada }
}

/** Cuota de la compra que se cobra en la factura del corte `corte` (0 si no le toca) y su parte de intereses. */
function cuotaEnCorte(t: Pick<CreditCardIn, "corte" | "tasa">, c: CardPurchaseIn, corte: Date): { cuota: number; interes: number } {
  if (c.pagada) return { cuota: 0, interes: 0 }
  const n = Math.max(1, +c.cuotas || 1)
  const j = cortesDesde(t, c.fecha, corte)
  if (j < 1 || j > n) return { cuota: 0, interes: 0 }
  const i = n > 1 ? (+t.tasa || 0) / 100 : 0
  const cuota = annuity(+c.valor, i, n)
  let saldo = +c.valor
  for (let x = 1; x < j; x++) saldo = Math.max(0, saldo - (cuota - saldo * i))
  return { cuota, interes: saldo * i }
}

/**
 * Pago de la tarjeta en el mes de hoy + `offset`, según el plan de cuotas (sin mirar pagos registrados): la factura del
 * corte que se paga ese mes, con la cuota que le toca a cada compra. No depende del día del mes en que se mire.
 */
export function tarjetaCuotaMes(t: Pick<CreditCardIn, "corte" | "tasa" | "purchases"> & { pago?: number | null }, today: DateInput, offset = 0): number {
  const ref = addMonths(toDay(today), offset)
  const corte = cortePagadoEnMes(t, ref.getFullYear(), ref.getMonth())
  return (t.purchases || []).reduce((a, c) => a + cuotaEnCorte(t, c, corte).cuota, 0)
}

// ——— Pagos reales de la tarjeta (tabla card_payments) ———
// Modelo: como en la v4, se supone que cada mes pagas las cuotas de tus compras. Cuando registras un pago:
// · en ese mes el flujo usa lo que pagaste y no la estimación;
// · lo que pagaste de más (o de menos) frente a la cuota del mes baja (o sube) lo que debes;
// · un pago "total" deja pagadas todas las compras hasta su fecha (lo hace la base: pay_credit_card) y reinicia la cuenta.

export interface CardPaymentIn {
  id?: string
  card_id?: string
  /** 'YYYY-MM-DD' */
  fecha: string
  valor: number
  /** 'minimo' | 'total' | 'otro' */
  tipo?: string | null
  /** De qué medio de pago (y cuenta, en F1) salió la plata. */
  payment_method_id?: string | null
  deleted_at?: string | null
}
/** Tarjeta con sus pagos registrados (opcionales: sin pagos todo se calcula como en la v4). `lib/book-data.ts` los deja en `pagos`. */
type ConPagos = { payments?: CardPaymentIn[] | null; pagos?: CardPaymentIn[] | null }
export type CardConPagos = Pick<CreditCardIn, "corte" | "tasa" | "purchases"> & { id?: string; pago?: number | null } & ConPagos

const isoDay = (d: DateInput) => iso(toDay(d))
const pagosDe = (t: ConPagos) => (t.payments ?? t.pagos ?? []).filter((p) => !p.deleted_at && +p.valor > 0)

/** Pagos registrados de la tarjeta en el mes `m` (base 0) del año `y`. */
export function pagosTarjetaMes(t: ConPagos, y: number, m: number): CardPaymentIn[] {
  const k = `${y}-${String(m + 1).padStart(2, "0")}`
  return pagosDe(t).filter((p) => isoDay(p.fecha).slice(0, 7) === k)
}

/**
 * Lo que pagaste de más (+) o de menos (−) frente a la cuota de cada mes en que registraste pagos, hasta `hasta`.
 * Solo cuenta desde el último pago "total" (ese ya dejó las compras anteriores en cero).
 */
export function ajusteTarjeta(t: CardConPagos, hasta: DateInput): number {
  const h = isoDay(hasta)
  const ps = pagosDe(t).filter((p) => isoDay(p.fecha) <= h)
  const ultTotal = ps.filter((p) => p.tipo === "total").reduce((a, p) => (isoDay(p.fecha) > a ? isoDay(p.fecha) : a), "")
  const porMes = new Map<string, { v: number; ref: string }>()
  for (const p of ps) {
    const f = isoDay(p.fecha)
    if (p.tipo === "total" || (ultTotal && f <= ultTotal)) continue
    const k = f.slice(0, 7)
    const x = porMes.get(k) ?? { v: 0, ref: f }
    x.v += +p.valor
    if (f < x.ref) x.ref = f
    porMes.set(k, x)
  }
  // Si la fecha de pago de ese mes ya llegó, el saldo base ya descontó su cuota: cuenta la diferencia. Si pagaste antes de
  // la fecha límite, el saldo base aún no la descuenta: baja la deuda completo.
  const hd = toDay(hasta)
  let aj = 0
  for (const { v, ref } of porMes.values()) {
    const r = toDay(ref)
    aj += fechaPagoMes(t, r.getFullYear(), r.getMonth()) <= hd ? v - tarjetaCuotaMes(t, ref) : v
  }
  return aj
}

/** Saldo de las compras a una fecha (suponiendo que pagaste cada cuota), sin los pagos registrados. */
const saldoCompras = (t: CardConPagos, hasta: DateInput) => (t.purchases || []).reduce((a, c) => a + compraEstado(t, c, hasta).saldo, 0)

/** Lo que debes en la tarjeta: saldo de sus compras menos lo que abonaste de más (o más lo que dejaste de pagar). */
export function deudaTarjeta(t: CardConPagos, today: DateInput): number {
  const base = saldoCompras(t, today)
  if (!pagosDe(t).length) return base
  return Math.max(0, base - ajusteTarjeta(t, today))
}

/**
 * Lo que falta pagar de la tarjeta en el mes de hoy + `offset`: la cuota del mes (v4), sin pasar de lo que te queda por
 * pagar si abonaste de más, y menos lo que ya pagaste ese mes. Sin pagos registrados es igual a la v4.
 */
export function tarjetaPagoMes(t: CardConPagos, today: DateInput, offset = 0): number {
  const v = tarjetaCuotaMes(t, today, offset)
  if (!pagosDe(t).length) return v
  const ref = addMonths(toDay(today), offset)
  const aj = ajusteTarjeta(t, ref)
  const tope = aj > 0 ? Math.max(0, saldoCompras(t, ref) + v - aj) : Infinity
  const pagado = pagosTarjetaMes(t, ref.getFullYear(), ref.getMonth()).reduce((a, p) => a + +p.valor, 0)
  return Math.max(0, Math.min(v, tope) - pagado)
}

/** Deuda total en tarjetas (con sus pagos registrados). */
export function tarjetasDeuda(cards: CardConPagos[], today: DateInput): number {
  return (cards || []).reduce((a, t) => a + deudaTarjeta(t, today), 0)
}

/**
 * La tarjeta en el flujo del mes `m` (base 0) de `y`: si registraste pagos ese mes, salen esos pagos (lo real); si no, la
 * estimación del pago del mes. `interes`: parte de intereses estimada (saldo de las compras diferidas × tasa).
 */
export function tarjetaFlujoMes(t: CardConPagos, y: number, m: number, today: DateInput): { pagos: CardPaymentIn[]; estimado: number; interes: number } {
  const hoy = toDay(today)
  const off = (y - hoy.getFullYear()) * 12 + (m - hoy.getMonth())
  const ref = addMonths(hoy, off)
  const corte = cortePagadoEnMes(t, ref.getFullYear(), ref.getMonth())
  const interes = (t.purchases || []).reduce((a, c) => a + cuotaEnCorte(t, c, corte).interes, 0)
  const pagos = pagosTarjetaMes(t, y, m)
  return { pagos, estimado: pagos.length ? 0 : tarjetaPagoMes(t, today, off), interes }
}

/**
 * Enganche para el saldo de cuentas (F1): los pagos de tarjeta entre `a` y `b` ('YYYY-MM-DD', incluidos), con el medio
 * de pago del que salió la plata. Un pago de tarjeta es una salida de la cuenta; la compra con tarjeta no lo es.
 */
export function pagosTarjetaEntre(cards: (CardConPagos & { id?: string })[], a: string, b: string): (CardPaymentIn & { card_id?: string })[] {
  return (cards || []).flatMap((t) => pagosDe(t).filter((p) => isoDay(p.fecha) >= a && isoDay(p.fecha) <= b).map((p) => ({ ...p, card_id: p.card_id ?? t.id })))
}
