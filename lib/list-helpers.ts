// Ayudas compartidas por las listas de Mi dinero y deudas (fechas relativas, meses, estados de vencimiento).
import { fmtDate, todayISO } from "@/lib/format"

/** Días de `a` a `b` (fechas 'YYYY-MM-DD'; negativo si `b` es anterior). */
export const daysBetween = (a: string, b: string) => Math.round((new Date(b.slice(0, 10) + "T12:00:00").getTime() - new Date(a.slice(0, 10) + "T12:00:00").getTime()) / 864e5)

/** Los últimos `n` meses 'YYYY-MM', del actual hacia atrás. */
export const lastMonths = (n: number, today = todayISO()) => {
  const [y, m] = today.split("-").map(Number)
  return Array.from({ length: n }, (_, i) => { const d = new Date(y, m - 1 - i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` })
}

/** "Hoy · 2 de noviembre 2026", "Ayer · …" o la fecha larga (títulos de grupos por día). */
export function dayHeading(d: string, today = todayISO()) {
  const k = daysBetween(d, today)
  return `${k === 0 ? "Hoy · " : k === 1 ? "Ayer · " : ""}${fmtDate(d, { long: true })}`
}

export type DueState = "vencido" | "hoy" | "pronto" | "luego"
/** Estado de una fecha de pago: vencido, hoy, pronto (dentro de `anticipo` días) o luego. */
export function dueState(due: string, today = todayISO(), anticipo = 5): DueState {
  const k = daysBetween(today, due)
  return k < 0 ? "vencido" : k === 0 ? "hoy" : k <= anticipo ? "pronto" : "luego"
}
/** "venció hace 3 días", "es hoy", "mañana", "en 12 días". */
export function dueText(due: string, today = todayISO()) {
  const k = daysBetween(today, due)
  return k < -1 ? `venció hace ${-k} días` : k === -1 ? "venció ayer" : k === 0 ? "es hoy" : k === 1 ? "mañana" : `en ${k} días`
}
/** Tono de StatusPill para cada estado. */
export const DUE_TONE = { vencido: "vencido", hoy: "porVencer", pronto: "porVencer", luego: "gray" } as const
/** Explicación simple de cada estado (tooltips). */
export const DUE_HINT: Record<DueState, string> = {
  vencido: "La fecha de pago ya pasó y no hay pago registrado. Págalo cuanto antes para evitar intereses o cortes.",
  hoy: "Hoy es el día de pago.",
  pronto: "Se acerca la fecha de pago: te avisamos con anticipación para que tengas la plata lista.",
  luego: "Todavía falta para la fecha de pago.",
}
