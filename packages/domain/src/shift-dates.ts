// Corre las fechas de un estado de Mirai 4.0 (el libro de ejemplo) para que quede "al día". Portado 1:1 de shiftDates
// de apps/web/features/import/v4.ts (la API lo usa en POST /v1/books/:b/import/sample).

/** Días entre dos fechas AAAA-MM-DD (al mediodía, sin líos de horario). */
export const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 864e5)

/** Corre todas las fechas `days` días (y los meses 'AAAA-MM' / periodos 'prev-AAAA-MM-Q1') unos meses equivalentes. */
export function shiftDates<T>(S: T, days: number): T {
  if (!days) return S
  const months = Math.round(days / 30.44)
  const shiftDay = (s: string) => {
    const d = new Date(s + "T12:00:00")
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
  }
  const shiftMonth = (y: number, m: number) => {
    const d = new Date(y, m - 1 + months, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  }
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return shiftDay(v)
      const m = v.match(/^(prev-)?(\d{4})-(\d{2})(-Q[12])?$/)
      if (m) return `${m[1] ?? ""}${shiftMonth(+m[2], +m[3])}${m[4] ?? ""}`
      return v
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(S) as T
}
