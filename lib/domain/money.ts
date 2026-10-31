// Formato y lectura de dinero en pesos colombianos (equivalentes a b_core.js de la v4).
import type { Trm } from "./types"

const NF = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 })
const NBSP = " "

/** '$ 1.234.567' (espacio no separable). Negativos: '-$ 1.234'. Redondea a pesos. */
export function formatCOP(v: number | string | null | undefined): string {
  const n = Math.round(+(v ?? 0) || 0)
  return (n < 0 ? `-$${NBSP}` : `$${NBSP}`) + NF.format(Math.abs(n))
}

/** Formato corto: '$1,5 M', '$250 mil' o el valor completo si es menor a mil. */
export function formatCompact(v: number): string {
  const a = Math.abs(v)
  return a >= 1e6
    ? "$" + (v / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 }) + " M"
    : a >= 1e3
      ? "$" + Math.round(v / 1e3) + " mil"
      : formatCOP(v)
}

/** Valor en su moneda: COP con `formatCOP`; otra → 'USD 2.500,5' (máx. 2 decimales). */
export function formatCurrency(v: number, currency?: string | null): string {
  return !currency || currency === "COP" ? formatCOP(v) : `${currency} ${(+v).toLocaleString("es-CO", { maximumFractionDigits: 2 })}`
}

/** Porcentaje: 0.256 → '25,6%'. No finito → '0%'. */
export function pct(v: number, d = 1): string {
  return (isFinite(v) ? v * 100 : 0).toLocaleString("es-CO", { maximumFractionDigits: d }) + "%"
}

/**
 * Lee un monto escrito por el usuario: si hay coma, los puntos son miles y la coma es decimal;
 * si no, los puntos son miles. '1.234,5' → 1234.5 · '1.234' → 1234.
 */
export function parseMoney(s: unknown): number {
  let t = String(s ?? "").trim()
  if (!t) return 0
  t = t.replace(/[^\d,.-]/g, "")
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".")
  else t = t.replace(/\./g, "")
  return parseFloat(t) || 0
}

/** Número con coma decimal ('2,5' → 2.5). */
export const parseNum = (s: unknown): number => parseFloat(String(s ?? "").replace(",", ".")) || 0

/** Texto para un input de dinero ('' si vacío). */
export function fmtMoneyInput(v: number | string | null | undefined, dec?: boolean): string {
  if (v === "" || v == null) return ""
  const n = +v
  if (!isFinite(n)) return ""
  return dec ? n.toLocaleString("es-CO", { maximumFractionDigits: 2 }) : NF.format(Math.round(n))
}

/** Convierte a COP con la TRM manual del libro. Moneda sin tasa → 0 (como la v4). */
export function conv(v: number | string | null | undefined, currency: string | null | undefined, trm: Trm): number {
  return (+(v ?? 0) || 0) * (currency && currency !== "COP" ? +trm[currency] || 0 : 1)
}
