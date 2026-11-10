// Tasa de usura por mes (ref_usury_rate, migración 0013): cuál rige hoy y si falta cargar alguna. La certifica la
// Superintendencia Financiera cada mes (interés bancario corriente × 1,5, consumo y ordinario). La llena el cron de
// referencias desde datos.gov.co y, si la fuente falla, la consola › Datos de referencia a mano. Puro.
import { addMonths, iso, lastDay, parseDate } from "./dates"

export type UsuraRow = { desde: string; hasta: string; tasa_ea: number; fuente?: string | null }
/** sin-tasa: no hay ninguna para hoy · vencida: la última ya terminó · falta-siguiente: acaba el mes y no está la del próximo. */
export type AlertaUsura = "sin-tasa" | "vencida" | "falta-siguiente"

/** La que rige `hoy`: la más reciente que ya empezó. */
export function usuraVigente(rows: UsuraRow[], hoy: string): UsuraRow | null {
  return [...rows].filter((r) => r.desde <= hoy).sort((a, b) => b.desde.localeCompare(a.desde))[0] ?? null
}

/** Desde y hasta de un mes (YYYY-MM): del 1 al último día. */
export function mesUsura(ym: string): { desde: string; hasta: string } {
  const [y, m] = ym.split("-").map(Number)
  return { desde: `${ym}-01`, hasta: `${ym}-${String(lastDay(y, m - 1)).padStart(2, "0")}` }
}

/** Usura E.A. (%) desde el interés bancario corriente (%): × 1,5, con dos decimales. */
export const usuraDesdeIbc = (ibc: number) => Math.round((+ibc || 0) * 1.5 * 100) / 100

/** Qué rige hoy y si hay que cargar algo a mano (los últimos 3 días del mes se avisa si falta la del siguiente). */
export function estadoUsura(rows: UsuraRow[], hoy: string): { vigente: UsuraRow | null; alerta: AlertaUsura | null; siguiente: string } {
  const vigente = usuraVigente(rows, hoy)
  const d = parseDate(hoy)
  const siguiente = iso(addMonths(new Date(d.getFullYear(), d.getMonth(), 1), 1)).slice(0, 7)
  if (!vigente) return { vigente, alerta: "sin-tasa", siguiente }
  if (vigente.hasta < hoy) return { vigente, alerta: "vencida", siguiente }
  const finDeMes = lastDay(d.getFullYear(), d.getMonth()) - d.getDate() < 3
  if (finDeMes && !rows.some((r) => r.desde.slice(0, 7) === siguiente)) return { vigente, alerta: "falta-siguiente", siguiente }
  return { vigente, alerta: null, siguiente }
}
