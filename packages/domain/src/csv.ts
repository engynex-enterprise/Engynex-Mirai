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
  /** Entrada de plata (valor positivo en un extracto que sí trae negativos): se importa como ingreso extra. */
  abono?: boolean
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
  else out.forEach((o) => (o.abono = o.valor > 0))
  out.forEach((o) => (o.valor = Math.abs(o.valor)))
  return { rows: out, skipped }
}

/** Hash corto y estable (FNV-1a de 32 bits, en base 36). */
function fnv(t: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(36)
}

/**
 * Id estable de un movimiento importado: `csv:` + hash de fecha, descripción, valor y si es entrada, más `n` (cuántas
 * veces se repitió antes ese mismo movimiento en el archivo: dos cafés iguales el mismo día son dos movimientos).
 * Subir el mismo extracto otra vez da los mismos ids, y el índice único de la base no deja duplicarlos.
 */
export function csvExternalId(r: Pick<CsvRow, "fecha" | "descripcion" | "valor" | "abono">, n = 0): string {
  const d = r.descripcion.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim()
  return `csv:${fnv(`${r.fecha}|${d}|${Math.round(Math.abs(r.valor) * 100)}|${r.abono ? "+" : "-"}`)}:${n}`
}

/** Ids estables de todas las filas de un extracto (las repetidas llevan 0, 1, 2… en el orden del archivo). */
export function csvExternalIds(rows: Pick<CsvRow, "fecha" | "descripcion" | "valor" | "abono">[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    const base = csvExternalId(r, 0)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n ? csvExternalId(r, n) : base
  })
}
