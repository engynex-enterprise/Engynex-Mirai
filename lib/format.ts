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

/**
 * Lo que la persona va escribiendo en un campo de dinero (solo cifras y separadores).
 * Los puntos son siempre de miles (se reformatean en vivo) y la coma es decimal solo si `dec`.
 * Así "4.5500" (lo que queda al teclear tras "4.550") se lee 45.500 y no 4,55.
 */
export function typedMoney(raw: string, dec: boolean): { n: number; text: string } {
  const clean = raw.replace(/[$\s]/g, "")
  if (!dec) {
    const d = clean.replace(/\D/g, "").replace(/^0+(?=\d)/, "")
    const n = d ? Number(d) : 0
    return { n, text: d ? new Intl.NumberFormat("es-CO").format(n) : "" }
  }
  const [ent = "", ...rest] = clean.replace(/\./g, "").split(",")
  const intD = ent.replace(/\D/g, "").replace(/^0+(?=\d)/, "")
  const hasComma = rest.length > 0
  const decD = rest.join("").replace(/\D/g, "").slice(0, 2)
  const n = Number(`${intD || "0"}.${decD || "0"}`)
  const text = (intD ? new Intl.NumberFormat("es-CO").format(Number(intD)) : hasComma ? "0" : "") + (hasComma ? `,${decD}` : "")
  return { n, text }
}

/** Edad cumplida a una fecha (por defecto hoy en Colombia) y si ese día es su cumpleaños. */
export function edad(nacimiento: string | null | undefined, hoy = todayISO()) {
  if (!nacimiento) return null
  const [y, m, d] = nacimiento.split("-").map(Number), [ty, tm, td] = hoy.split("-").map(Number)
  const años = ty - y - (tm < m || (tm === m && td < d) ? 1 : 0)
  return { años, cumple: tm === m && td === d }
}

/** Días que faltan para el próximo cumpleaños (0 = hoy) y los años que cumplirá. El 29 de febrero se celebra el 28 en años no bisiestos. */
export function proxCumple(nacimiento: string | null | undefined, hoy = todayISO()) {
  if (!nacimiento) return null
  const [y, m, d] = nacimiento.split("-").map(Number), [ty, tm, td] = hoy.split("-").map(Number)
  const t = Date.UTC(ty, tm - 1, td)
  const fecha = (yr: number) => { const leap = (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0; return Date.UTC(yr, m - 1, m === 2 && d === 29 && !leap ? 28 : d) }
  let yr = ty
  if (fecha(yr) < t) yr++
  return { dias: Math.round((fecha(yr) - t) / 86_400_000), años: yr - y }
}

/** Dígitos de un documento (sin puntos, guiones ni letras) y los 2 últimos que usa la DIAN. */
export const soloDigitos = (s: string) => s.replace(/\D/g, "")
export const digitosDian = (doc: string) => { const d = soloDigitos(doc); return d.length >= 2 ? d.slice(-2) : "" }
