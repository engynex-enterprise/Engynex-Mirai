// Descuentos de nómina y seguridad social: lo que realmente recibes (equivalente a m_nomina.js de la v4).
// Valores de referencia de Colombia: SMMLV y UVT por año (se pueden sobrescribir en los ajustes del libro).
// Todo es un ESTIMADO: el valor final lo da la nómina o el contador.
import { formatCOP as $ } from "./money"

/**
 * SMMLV por año. 2026: $1.750.905 rige por el Decreto 0159 de 2026 (transitorio; el Decreto 1469 de 2025 fue
 * suspendido por el Consejo de Estado). Verificar con fuentes oficiales antes de agregar uno nuevo.
 */
export const SMMLV: Record<number, number> = { 2026: 1750905 }
/** UVT por año (fuente: resoluciones DIAN). */
export const UVT: Record<number, number> = { 2025: 49799, 2026: 52374 }

const SMMLV_DEF = 1750905
const UVT_DEF = 52374

/** SMMLV del año: sobrescritura del libro o valor por defecto (igual que la v4: si no hay, 1.750.905). */
export const smmlvFor = (year: number, overrides?: Record<string, number> | null): number => +(overrides ?? {})[year] || SMMLV[year] || SMMLV_DEF
/** UVT del año: sobrescritura del libro, tabla UVT o 52.374. */
export const uvtFor = (year: number, overrides?: Record<string, number> | null): number => +({ ...UVT, ...(overrides ?? {}) } as Record<string, number>)[year] || UVT_DEF

/** Riesgos ARL: [nivel, nombre, % sobre el IBC]. */
export const ARLN: [string, string, number][] = [
  ["1", "Riesgo I (oficina)", 0.522],
  ["2", "Riesgo II", 1.044],
  ["3", "Riesgo III", 2.436],
  ["4", "Riesgo IV", 4.35],
  ["5", "Riesgo V", 6.96],
]

export const DTIPOS = {
  empleado: { l: "Empleado con contrato", d: "Te descuentan salud 4%, pensión 4% y, si aplica, fondo de solidaridad y retención.", icon: "briefcase" },
  independiente: { l: "Independiente / prestación de servicios", d: "Pagas tu seguridad social sobre el 40% de lo que facturas: salud 12,5%, pensión 16% y ARL.", icon: "file-signature" },
  pensionado: { l: "Pensionado", d: "Te descuentan salud de tu mesada.", icon: "armchair" },
  otro: { l: "Otro / solo descuentos propios", d: "Escribe tus descuentos uno por uno.", icon: "sliders-horizontal" },
} as const

/** % del Fondo de Solidaridad Pensional según cuántos salarios mínimos es la base. */
export function fspPct(base: number, smmlv: number): number {
  const n = base / smmlv
  if (n < 4) return 0
  if (n < 16) return 1
  if (n < 17) return 1.2
  if (n < 18) return 1.4
  if (n < 19) return 1.6
  if (n < 20) return 1.8
  return 2
}

/**
 * Retención en la fuente de un empleado (procedimiento 1, tabla del art. 383 E.T.), aproximada:
 * ingreso − aportes, menos 25 % exento (tope 790 UVT/año), tabla en UVT y redondeo a miles.
 * No aplica el límite global del 40 % / 1.340 UVT ni otras deducciones (igual que la v4; ver NOTAS.md).
 */
export function retEmpleado(mensual: number, aportes: number, uvt: number): number {
  const U = uvt
  const neto = Math.max(0, mensual - aportes)
  const ex = Math.min(neto * 0.25, (790 / 12) * U)
  const base = (neto - ex) / U
  let r = 0
  if (base > 2300) r = (base - 2300) * 0.39 + 770
  else if (base > 945) r = (base - 945) * 0.37 + 268
  else if (base > 640) r = (base - 640) * 0.35 + 162
  else if (base > 360) r = (base - 360) * 0.33 + 69
  else if (base > 150) r = (base - 150) * 0.28 + 10
  else if (base > 95) r = (base - 95) * 0.19
  return Math.round((r * U) / 1000) * 1000
}

/** Configuración de descuentos guardada en `incomes.deducciones`. */
export interface Deducciones {
  tipo?: "empleado" | "independiente" | "pensionado" | "otro"
  salud?: boolean
  pension?: boolean
  fsp?: boolean
  ret?: boolean
  arl?: boolean
  saludP?: number | string
  pensionP?: number | string
  /** % del IBC para independientes (por defecto 40). */
  ibcP?: number | string
  arlN?: string | number
  retModo?: "auto" | "manual" | "pct"
  retV?: number | string
  otros?: { n?: string; v?: number | string; pct?: boolean }[]
}

export interface DedItem {
  n: string
  v: number
  h: string
}

export interface DedResult {
  neto: number
  items: DedItem[]
  total: number
}

const pc = (x: unknown) => String(x).replace(".", ",")

/**
 * Descuentos de un pago (`bruto` es el valor del periodo: quincena, mes…). Los topes se calculan
 * con el equivalente mensual. Devuelve el neto (lo que llega a la cuenta) y el detalle.
 */
export function dedCalc(bruto: number, frec: string, D: Deducciones | null | undefined, ref: { smmlv: number; uvt: number }): DedResult {
  if (!D || !bruto) return { neto: bruto || 0, items: [], total: 0 }
  const k = ({ quincenal: 2, semanal: 52 / 12, anual: 1 / 12 } as Record<string, number>)[frec] || 1
  const M = bruto * k
  const it: DedItem[] = []
  const add = (n: string, mv: number, h: string) => {
    if (mv > 0) it.push({ n, v: mv / k, h })
  }
  const t = D.tipo || "empleado"
  if (t === "empleado") {
    const sp = +(D.saludP ?? 0) || 4
    const pp = +(D.pensionP ?? 0) || 4
    const s = D.salud !== false ? (M * sp) / 100 : 0
    const p = D.pension !== false ? (M * pp) / 100 : 0
    const fp = D.fsp !== false ? fspPct(M, ref.smmlv) : 0
    const f = (M * fp) / 100
    add("Salud", s, `${pc(sp)}% del salario`)
    add("Pensión", p, `${pc(pp)}% del salario`)
    add("Fondo de solidaridad pensional", f, `${pc(fp)}% (ganas ${(M / ref.smmlv).toFixed(1).replace(".", ",")} salarios mínimos)`)
    if (D.ret !== false) {
      const r = D.retModo === "manual" ? (+(D.retV ?? 0) || 0) * k : D.retModo === "pct" ? (M * (+(D.retV ?? 0) || 0)) / 100 : retEmpleado(M, s + p + f, ref.uvt)
      add("Retención en la fuente", r, D.retModo === "manual" ? "valor fijo" : D.retModo === "pct" ? `${pc(D.retV)}% del pago` : "cálculo aproximado (tabla art. 383)")
    }
  } else if (t === "independiente") {
    // IBC: 40 % del ingreso (Ley 2277/2022 art. 89), mínimo 1 SMMLV y máximo 25 SMMLV (Ley 797/2003 art. 5;
    // Decreto 780/2016 art. 3.2.7.1). La v4 no aplicaba el tope (ver NOTAS.md).
    const ib = Math.min(25 * ref.smmlv, Math.max(ref.smmlv, (M * (+(D.ibcP ?? 0) || 40)) / 100))
    const sp = +(D.saludP ?? 0) || 12.5
    const pp = +(D.pensionP ?? 0) || 16
    const s = D.salud !== false ? (ib * sp) / 100 : 0
    const p = D.pension !== false ? (ib * pp) / 100 : 0
    const fp = D.fsp !== false ? fspPct(ib, ref.smmlv) : 0
    const arl = ARLN.find((a) => a[0] === String(D.arlN || "1"))!
    const ar = D.arl !== false ? (ib * arl[2]) / 100 : 0
    add("Salud", s, `${pc(sp)}% de tu base (${$(ib)})`)
    add("Pensión", p, `${pc(pp)}% de tu base`)
    add("Fondo de solidaridad pensional", (ib * fp) / 100, `${pc(fp)}%`)
    add("ARL", ar, arl[1])
    if (D.ret !== false && +(D.retV ?? 0))
      add("Retención en la fuente", D.retModo === "manual" ? +(D.retV ?? 0) * k : (M * +(D.retV ?? 0)) / 100, D.retModo === "manual" ? "valor fijo" : `${pc(D.retV)}% de lo facturado`)
  } else if (t === "pensionado") {
    const sp = +(D.saludP ?? 0) || 12
    if (D.salud !== false) add("Salud", (M * sp) / 100, `${pc(sp)}% de la mesada`)
  }
  for (const o of D.otros || []) if (o && o.n && +(o.v ?? 0)) it.push({ n: o.n, v: o.pct ? (bruto * +(o.v ?? 0)) / 100 : +(o.v ?? 0), h: o.pct ? `${o.v}%` : "valor fijo" })
  const total = it.reduce((a, x) => a + x.v, 0)
  return { neto: Math.max(0, Math.round(bruto - total)), items: it.map((x) => ({ ...x, v: Math.round(x.v) })), total: Math.round(total) }
}
