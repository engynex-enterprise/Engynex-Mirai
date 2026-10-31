/** Formatos de presentación (es-CO). Los cálculos viven en lib/domain. */
const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
const num = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 })

export function fmtMoney(v: number | null | undefined, currency = "COP") {
  const n = Number(v ?? 0)
  if (currency === "COP") return cop.format(Math.round(n))
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 2 }).format(n)
}

/** $1,2 M · $350 mil — para KPIs compactos */
export function fmtShort(v: number) {
  const a = Math.abs(v)
  const s = v < 0 ? "−" : ""
  if (a >= 1e9) return `${s}$${num.format(a / 1e9)} mil M`
  if (a >= 1e6) return `${s}$${num.format(Math.round(a / 1e5) / 10)} M`
  if (a >= 1e3) return `${s}$${num.format(Math.round(a / 1e3))} mil`
  return `${s}$${num.format(a)}`
}

export const fmtNum = (v: number) => num.format(v)
export const fmtPct = (v: number, d = 1) => `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: d }).format(v)} %`

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

/** 'YYYY-MM-DD' → '5 nov 2026' (sin zonas horarias: las fechas son de calendario). */
export function fmtDate(iso: string | null | undefined, opts: { year?: boolean; long?: boolean } = {}) {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  const mes = (opts.long ? MESES_L : MESES)[m - 1]
  return opts.year === false ? `${d} ${mes}` : `${d} ${mes} ${y}`
}
export const monthName = (m: number, long = true) => (long ? MESES_L : MESES)[m - 1]
export const fmtMonth = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${MESES_L[m - 1]} ${y}` }

/** Hoy en Colombia como 'YYYY-MM-DD'. */
export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(now)
}

/** Lee montos escritos por personas: "120.000", "120 mil", "1,5 millones", "$ 45.900" */
export function parseMoney(input: string | number | null | undefined): number {
  if (typeof input === "number") return input
  if (!input) return 0
  let s = String(input).toLowerCase().replace(/\$|cop|\s/g, "")
  let mult = 1
  if (/(millones|millón|millon|mm|m)$/.test(s)) { mult = 1e6; s = s.replace(/(millones|millón|millon|mm|m)$/, "") }
  else if (/(mil|k)$/.test(s)) { mult = 1e3; s = s.replace(/(mil|k)$/, "") }
  // Formato colombiano: punto de miles, coma decimal
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".")
  else s = s.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".")
  const n = Number(s)
  return Number.isFinite(n) ? n * mult : 0
}
