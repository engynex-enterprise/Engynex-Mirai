// Importar extractos bancarios en CSV (equivalente a pnum/pdate/classify/parseCSV de c_views.js de la v4).
import type { KeywordRuleIn } from "./types"

/**
 * Lee un número de un extracto detectando el separador decimal: con coma y punto, el último es el
 * decimal; solo coma con 1–2 decimales → decimal (si no, miles); solo puntos en grupos de 3 → miles.
 */
export function pnum(s: unknown): number {
  let t = String(s).replace(/[^\d,.\-]/g, "")
  if (!t) return NaN
  const c = t.lastIndexOf(",")
  const p = t.lastIndexOf(".")
  if (c > -1 && p > -1) t = c > p ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "")
  else if (c > -1) t = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "")
  else if (p > -1 && /\.\d{3}(\.|$)/.test(t) && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, "")
  return parseFloat(t)
}

/** Fecha 'YYYY-MM-DD' desde 'YYYY-MM-DD', 'YYYY/MM/DD' o 'dd/mm/aa(aa)' (con / - .). Año de 2 dígitos → 20xx. */
export function pdate(s: unknown): string | null {
  const t = String(s).trim()
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3]
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  }
  return null
}

/** Categoría por la primera regla cuya palabra esté en la descripción; `null` = "Otros". */
export function classify(desc: string, rules: KeywordRuleIn[]): string | null {
  const d = desc.toLowerCase()
  const r = rules.find((x) => x.keyword && d.includes(x.keyword.toLowerCase()))
  return r ? r.category_id : null
}

export interface CsvRow {
  fecha: string
  descripcion: string
  /** Valor en positivo. */
  valor: number
  /** Categoría sugerida por las reglas (`null` = Otros). */
  category_id: string | null
  /** ¿Se importa? Por defecto los débitos (valores negativos); si no hay negativos, todas. */
  incl: boolean
}

export type CsvResult = { rows: CsvRow[]; skipped: number; err?: undefined } | { err: string; rows?: undefined; skipped?: undefined }

/**
 * Lee un extracto: separador ';' si tiene tantos o más que comas, si no tabulador o ','; soporta comillas.
 * Busca columnas de fecha, descripción y valor por encabezado; sin encabezado, si la primera celda es una
 * fecha, usa fecha = col. 1, descripción = col. 2 y valor = última.
 */
export function parseCSV(txt: string, rules: KeywordRuleIn[]): CsvResult {
  const lines = txt.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return { err: "El archivo está vacío." }
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ";" : lines[0].includes("\t") ? "\t" : ","
  const split = (l: string) => {
    const o: string[] = []
    let cur = ""
    let q = false
    for (const ch of l) {
      if (ch === '"') { q = !q; continue }
      if (ch === sep && !q) { o.push(cur); cur = ""; continue }
      cur += ch
    }
    o.push(cur)
    return o.map((x) => x.trim())
  }
  const rows = lines.map(split)
  const h = rows[0].map((x) => x.toLowerCase())
  let fi = h.findIndex((x) => /fecha|date/.test(x))
  let di = h.findIndex((x) => /desc|concepto|detalle|referencia|movimiento/.test(x))
  let vi = h.findIndex((x) => /valor|monto|importe|d[eé]bito|amount/.test(x))
  let start = 1
  if (fi < 0 || di < 0 || vi < 0) {
    if (pdate(rows[0][0])) { fi = 0; di = 1; vi = rows[0].length - 1; start = 0 }
    else return { err: "No encontré columnas de fecha, descripción y valor. Usa un encabezado como: Fecha;Descripción;Valor" }
  }
  const out: CsvRow[] = []
  let skipped = 0
  for (let i = start; i < rows.length; i++) {
    const r = rows[i]
    const f = pdate(r[fi])
    const v = pnum(r[vi])
    const de = r[di] || ""
    if (!f || !isFinite(v)) { skipped++; continue }
    out.push({ fecha: f, descripcion: de, valor: v, category_id: classify(de, rules), incl: v < 0 })
  }
  if (!out.some((o) => o.valor < 0)) out.forEach((o) => (o.incl = true))
  out.forEach((o) => (o.valor = Math.abs(o.valor)))
  return { rows: out, skipped }
}
