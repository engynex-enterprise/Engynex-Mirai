// Valor de una inversión hoy (equivalente a `inv()` de b_core.js de la v4). Tasas en % efectivo anual.
import { addDays, days, iso, parseDate, toDay } from "./dates"
import type { DateInput, InvestmentIn } from "./types"

export interface InvestmentValue {
  /** Rendimiento bruto (CDT: al vencimiento; ahorro: a hoy; otros: valor − capital). */
  bruto: number
  /** Retención en la fuente (solo CDT). */
  ret: number
  neto: number
  /** Valor hoy. */
  valor: number
  /** Lo que recibes al vencimiento (solo CDT). */
  final: number | null
  /** Fecha de vencimiento 'YYYY-MM-DD' (solo CDT). */
  venc: string | null
  /** Avance del plazo 0..1 (solo CDT). */
  prog: number | null
  /** Días que faltan (solo CDT). */
  rest?: number
  ganHoy: number
  /** Rentabilidad total (fondo/acciones/cripto/otro). */
  rent?: number
  /** Ganancia mensual aproximada. */
  mes: number | null
}

export function inv(x: InvestmentIn, today: DateInput): InvestmentValue {
  const ini = parseDate(x.inicio)
  const t = toDay(today)
  const trans = Math.max(0, days(ini, t))
  if (x.tipo === "cdt") {
    const D = +(x.dias ?? 0) || 0
    const bruto = x.capital * (Math.pow(1 + x.tasa / 100, D / 365) - 1)
    const ret = (bruto * (+(x.ret ?? 0) || 0)) / 100
    const hoyR = x.capital * (Math.pow(1 + x.tasa / 100, Math.min(trans, D) / 365) - 1)
    const venc = addDays(ini, D)
    return { bruto, ret, neto: bruto - ret, valor: x.capital + hoyR, final: x.capital + bruto - ret, venc: iso(venc), prog: D ? Math.min(trans / D, 1) : 1, rest: Math.max(days(t, venc), 0), ganHoy: hoyR, mes: (bruto - ret) / (D / 30.4 || 1) }
  }
  if (x.tipo === "ahorro") {
    const g = x.capital * (Math.pow(1 + x.tasa / 100, trans / 365) - 1)
    return { bruto: g, ret: 0, neto: g, valor: x.capital + g, final: null, venc: null, prog: null, ganHoy: g, mes: x.capital * (Math.pow(1 + x.tasa / 100, 1 / 12) - 1) }
  }
  const v = +(x.actual ?? 0) || +x.capital
  return { bruto: v - x.capital, ret: 0, neto: v - x.capital, valor: v, final: null, venc: null, prog: null, ganHoy: v - x.capital, rent: x.capital ? v / x.capital - 1 : 0, mes: null }
}
