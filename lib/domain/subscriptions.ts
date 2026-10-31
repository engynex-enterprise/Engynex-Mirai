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
