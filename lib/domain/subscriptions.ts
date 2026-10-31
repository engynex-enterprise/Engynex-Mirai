// Suscripciones: costo mensual y fechas de cobro (equivalente a b_core.js de la v4).
import { addMonths, parseDate } from "./dates"
import { conv } from "./money"
import type { SubscriptionIn, Trm } from "./types"

/** Lo que te cuesta al mes (anual ÷ 12) y solo tu parte si la compartes. */
export function subMensual(x: Pick<SubscriptionIn, "valor" | "currency" | "ciclo" | "comparte">, trm: Trm): number {
  const parte = +(x.comparte ?? 0) > 1 ? +(x.comparte as number) : 1
  return (conv(x.valor, x.currency, trm) * (x.ciclo === "anual" ? 1 / 12 : 1)) / parte
}

/** Suma mensual de todas las suscripciones. */
export const subsMes = (subs: SubscriptionIn[], trm: Trm): number => subs.reduce((a, s) => a + subMensual(s, trm), 0)

/** Fechas de cobro ('YYYY-MM-DD') entre `a` y `b` (inclusive), partiendo de `proximo` (paso 1 o 12 meses). */
export function subOcc(s: Pick<SubscriptionIn, "proximo" | "ciclo">, a: Date, b: Date): Date[] {
  const out: Date[] = []
  let d = parseDate(s.proximo)
  const step = s.ciclo === "anual" ? 12 : 1
  while (d > a) d = addMonths(d, -step)
  while (d <= b) {
    if (d >= a) out.push(new Date(d))
    d = addMonths(d, step)
  }
  return out
}

export interface DetectedSub {
  desc: string
  /** Valor mediano de los cobros. */
  valor: number
  /** Meses distintos en que aparece. */
  meses: number
  category_id: string | null
}

/**
 * Cobros que se repiten en tus gastos y parecen suscripciones (detectSubs de la v4):
 * misma descripción en 3+ meses distintos, valores dentro de ±15 % de la mediana, no más de
 * 1,5 cobros por mes, y que no coincidan con una suscripción ya registrada.
 */
export function detectSubs(
  expenses: { descripcion: string; valor: number; fecha: string; fixed_expense_id?: string | null; category_id?: string | null }[],
  subs: Pick<SubscriptionIn, "nombre">[],
): DetectedSub[] {
  const by = new Map<string, typeof expenses>()
  for (const g of expenses) {
    if (g.fixed_expense_id) continue
    const k = g.descripcion.toLowerCase().trim()
    by.set(k, [...(by.get(k) ?? []), g])
  }
  const names = subs.map((s) => s.nombre.toLowerCase())
  const out: DetectedSub[] = []
  for (const [k, l] of by) {
    const ms = new Set(l.map((g) => g.fecha.slice(0, 7)))
    if (ms.size < 3) continue
    const vals = l.map((g) => +g.valor).sort((a, b) => a - b)
    const med = vals[Math.floor(vals.length / 2)]
    if (vals.some((v) => Math.abs(v - med) > med * 0.15)) continue
    if (l.length > ms.size * 1.5) continue
    if (names.some((n) => k.includes(n) || n.includes(k))) continue
    out.push({ desc: l[0].descripcion, valor: med, meses: ms.size, category_id: l[0].category_id ?? null })
  }
  return out
}
