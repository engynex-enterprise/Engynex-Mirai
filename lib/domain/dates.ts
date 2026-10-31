// Utilidades de fecha (equivalentes a b_core.js de la v4).
// Todo trabaja con fechas locales a medianoche. Las fechas entran y salen como 'YYYY-MM-DD'.
import type { DateInput } from "./types"

export const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const
export const MESL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"] as const

const MS_DIA = 864e5

/** 'YYYY-MM-DD' de una fecha local. */
export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Convierte 'YYYY-MM-DD' (o un Date) en una fecha local a medianoche.
 * Si el texto está vacío usa `fallback` (en la v4 era "hoy").
 */
export function parseDate(s: DateInput | null | undefined, fallback?: DateInput): Date {
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate())
  if (!s) {
    if (fallback === undefined) throw new Error("parseDate: fecha vacía sin valor por defecto")
    return parseDate(fallback)
  }
  const [y, m, d] = String(s).split("-").map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** Normaliza "hoy" (texto o Date) a medianoche local. */
export const toDay = (d: DateInput): Date => parseDate(d)

/** Suma meses conservando el día, recortado al último día del mes destino (31 ene + 1 → 28/29 feb). */
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()
  r.setDate(Math.min(d.getDate(), last))
  return r
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** Días entre dos fechas (b − a), redondeado. */
export const days = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / MS_DIA)

/** Último día del mes (`m` en base 0). */
export const lastDay = (y: number, m: number): number => new Date(y, m + 1, 0).getDate()

/** '5 ene 2026' */
export const fdate = (d: Date): string => `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`
/** '5 ene' */
export const fshort = (d: Date): string => `${d.getDate()} ${MES[d.getMonth()]}`
/** 'YYYY-MM' */
export const mkey = (d: Date): string => iso(d).slice(0, 7)

/** Hoy, Mañana, Ayer, En N días, Hace N días. */
export function relTime(d: Date, today: DateInput): string {
  const n = days(toDay(today), d)
  return n === 0 ? "Hoy" : n === 1 ? "Mañana" : n === -1 ? "Ayer" : n > 0 ? `En ${n} días` : `Hace ${-n} días`
}

/** Suma `k` días hábiles saltando domingos (frecuencia "diario lunes a sábado"). */
export function addBiz(d: Date, k: number): Date {
  let x = new Date(d)
  let c = 0
  while (c < k) {
    x = addDays(x, 1)
    if (x.getDay() !== 0) c++
  }
  return x
}

/** Próxima fecha con el día `d` del mes (este mes si no ha pasado, si no el siguiente). Recorta a fin de mes. */
export function proxDia(d: number, today: DateInput): Date {
  const t = toDay(today)
  let f = new Date(t.getFullYear(), t.getMonth(), Math.min(d, lastDay(t.getFullYear(), t.getMonth())))
  if (f < t) f = new Date(t.getFullYear(), t.getMonth() + 1, Math.min(d, lastDay(t.getFullYear(), t.getMonth() + 1)))
  return f
}

/**
 * "Hoy" en Colombia como 'YYYY-MM-DD'. Es la ÚNICA función que lee el reloj: úsala en la capa
 * que llama a los cálculos (Server Components, rutas, cron), nunca dentro de ellos.
 */
export function todayBogota(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}
