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

/**
 * Tabla del Fondo de Solidaridad Pensional: [desde cuántos salarios mínimos, %]. Por defecto la de la Ley 797 de 2003
 * (art. 8, que modificó el art. 27 de la Ley 100): 1 % desde 4 SMMLV y de 16 a 20 SMMLV sube 0,2 puntos por salario.
 * Se puede cambiar en Ajustes › Finanzas › Nómina (por ejemplo, si entra a regir otra tabla).
 */
export const FSP_LEY797: [number, number][] = [[4, 1], [16, 1.2], [17, 1.4], [18, 1.6], [19, 1.8], [20, 2]]

/** % del Fondo de Solidaridad Pensional según cuántos salarios mínimos es la base (tabla propia o la de ley). */
export function fspPct(base: number, smmlv: number, tabla?: [number, number][] | null): number {
  const n = base / smmlv
  let p = 0
  for (const [desde, pct] of [...(tabla?.length ? tabla : FSP_LEY797)].sort((a, b) => a[0] - b[0])) if (n >= desde) p = pct
  return p
}

/** Ajustes de nómina del libro (`book_settings.nomina`). */
export interface NominaCfg {
  /** Procedimiento de retención por defecto para ingresos nuevos de empleados. */
  retModo?: "auto" | "proc2"
  /** % fijo del procedimiento 2. */
  retPct?: number
  /** Tabla propia del Fondo de Solidaridad Pensional. */
  fsp?: [number, number][]
}

/** Referencias de un cálculo de nómina: salario mínimo, UVT y la tabla del FSP si el libro tiene una propia. */
export interface NominaRef {
  smmlv: number
  uvt: number
  fsp?: [number, number][] | null
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

/**
 * Retención en la fuente por el procedimiento 2 (art. 386 E.T.): el porcentaje fijo que calcula la empresa cada
 * semestre (sale en el desprendible, p. ej. "Procedimiento 2, 4,38 %") se aplica sobre la base depurada:
 * ingreso − aportes obligatorios, menos 25 % exento (tope 790 UVT/año). Redondeo a miles.
 */
export function retProc2(mensual: number, aportes: number, pct: number, uvt: number): number {
  const neto = Math.max(0, mensual - aportes)
  const ex = Math.min(neto * 0.25, (790 / 12) * uvt)
  return Math.round(((neto - ex) * (pct || 0)) / 100 / 1000) * 1000
}

/** Aportes a seguridad social redondeados al múltiplo de $100 superior, como los liquida la PILA. */
const pila = (v: number) => Math.ceil(v / 100 - 1e-9) * 100

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
  /** auto = tabla (procedimiento 1); proc2 = % fijo sobre la base depurada; pct = % del pago; manual = valor fijo. */
  retModo?: "auto" | "manual" | "pct" | "proc2"
  retV?: number | string
  otros?: { n?: string; v?: number | string; pct?: boolean }[]
  /**
   * Formulario nuevo (descuentos del mes): los valores fijos (retención y otros descuentos) son del mes y los aportes
   * se redondean como la PILA. Sin la marca, los valores fijos son de cada pago (como la v4).
   */
  mes?: boolean
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
export function dedCalc(bruto: number, frec: string, D: Deducciones | null | undefined, ref: NominaRef): DedResult {
  if (!D || !bruto) return { neto: bruto || 0, items: [], total: 0 }
  const k = ({ quincenal: 2, semanal: 52 / 12, anual: 1 / 12 } as Record<string, number>)[frec] || 1
  const M = bruto * k
  const it: DedItem[] = []
  const add = (n: string, mv: number, h: string) => {
    if (mv > 0) it.push({ n, v: mv / k, h })
  }
  const t = D.tipo || "empleado"
  const ap = (v: number) => (D.mes ? pila(v) : v)
  if (t === "empleado") {
    const sp = +(D.saludP ?? 0) || 4
    const pp = +(D.pensionP ?? 0) || 4
    const s = D.salud !== false ? ap((M * sp) / 100) : 0
    const p = D.pension !== false ? ap((M * pp) / 100) : 0
    const fp = D.fsp !== false ? fspPct(M, ref.smmlv, ref.fsp) : 0
    const f = ap((M * fp) / 100)
    add("Salud", s, `${pc(sp)}% del salario`)
    add("Pensión", p, `${pc(pp)}% del salario`)
    add("Fondo de solidaridad pensional", f, `${pc(fp)}% (ganas ${(M / ref.smmlv).toFixed(1).replace(".", ",")} salarios mínimos)`)
    if (D.ret !== false) {
      const rv = +(D.retV ?? 0) || 0
      const r = D.retModo === "manual" ? rv * (D.mes ? 1 : k) : D.retModo === "pct" ? (M * rv) / 100 : D.retModo === "proc2" ? retProc2(M, s + p + f, rv, ref.uvt) : retEmpleado(M, s + p + f, ref.uvt)
      add("Retención en la fuente", r, D.retModo === "manual" ? "valor fijo" : D.retModo === "pct" ? `${pc(D.retV)}% del pago` : D.retModo === "proc2" ? `procedimiento 2: ${pc(rv)}% de la base` : "cálculo aproximado (tabla art. 383)")
    }
  } else if (t === "independiente") {
    // IBC: 40 % del ingreso (Ley 2277/2022 art. 89), mínimo 1 SMMLV y máximo 25 SMMLV (Ley 797/2003 art. 5;
    // Decreto 780/2016 art. 3.2.7.1). La v4 no aplicaba el tope (ver NOTAS.md).
    const ib = Math.min(25 * ref.smmlv, Math.max(ref.smmlv, (M * (+(D.ibcP ?? 0) || 40)) / 100))
    const sp = +(D.saludP ?? 0) || 12.5
    const pp = +(D.pensionP ?? 0) || 16
    const s = D.salud !== false ? ap((ib * sp) / 100) : 0
    const p = D.pension !== false ? ap((ib * pp) / 100) : 0
    const fp = D.fsp !== false ? fspPct(ib, ref.smmlv, ref.fsp) : 0
    const arl = ARLN.find((a) => a[0] === String(D.arlN || "1"))!
    const ar = D.arl !== false ? ap((ib * arl[2]) / 100) : 0
    add("Salud", s, `${pc(sp)}% de tu base (${$(ib)})`)
    add("Pensión", p, `${pc(pp)}% de tu base`)
    add("Fondo de solidaridad pensional", ap((ib * fp) / 100), `${pc(fp)}%`)
    add("ARL", ar, arl[1])
    if (D.ret !== false && +(D.retV ?? 0))
      add("Retención en la fuente", D.retModo === "manual" ? +(D.retV ?? 0) * (D.mes ? 1 : k) : (M * +(D.retV ?? 0)) / 100, D.retModo === "manual" ? "valor fijo" : `${pc(D.retV)}% de lo facturado`)
  } else if (t === "pensionado") {
    const sp = +(D.saludP ?? 0) || 12
    if (D.salud !== false) add("Salud", ap((M * sp) / 100), `${pc(sp)}% de la mesada`)
  }
  for (const o of D.otros || []) if (o && o.n && +(o.v ?? 0)) it.push({ n: o.n, v: o.pct ? (bruto * +(o.v ?? 0)) / 100 : +(o.v ?? 0), h: o.pct ? `${o.v}%` : "valor fijo" })
  const total = it.reduce((a, x) => a + x.v, 0)
  return { neto: Math.max(0, Math.round(bruto - total)), items: it.map((x) => ({ ...x, v: Math.round(x.v) })), total: Math.round(total) }
}
