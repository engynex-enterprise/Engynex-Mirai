// Ingresos y gastos fijos flexibles: tipo de ingreso, valor del mes repartido en sus pagos, un valor distinto en cada
// quincena, en qué quincena se descuenta la nómina, días de pago propios, pago diario, el día de la semana del pago
// semanal y el mes del pago anual. Sin reparto guardado todo funciona igual que antes (15 y fin de mes, viernes…).
import { iso, lastDay } from "./dates"
import { dedCalc, type DedItem, type Deducciones, type NominaRef } from "./payroll"
import type { FixedExpenseIn, IncomeIn } from "./types"

export type TipoIngreso = "salario" | "bono" | "comisiones" | "prima" | "honorarios" | "pension" | "arriendo" | "negocio" | "inversiones" | "otro"

/**
 * Tipos de ingreso: qué descuentos de ley le aplican (`ded`, el tipo de `Deducciones`), la frecuencia habitual y la
 * categoría de ingreso con la que se guarda (la primera que exista en el libro; si no hay, se crea con `cat[0]`).
 */
export const TIPOS_INGRESO: { value: TipoIngreso; label: string; desc: string; icon: string; ded: NonNullable<Deducciones["tipo"]>; frec: string; cat: string[]; re: RegExp }[] = [
  { value: "salario", label: "Salario", desc: "Tu sueldo como empleado con contrato", icon: "briefcase", ded: "empleado", frec: "quincenal", cat: ["Salario"], re: /salari|sueldo|n[oó]mina/i },
  { value: "bono", label: "Bono o auxilio", desc: "Alimentación, conectividad, transporte…", icon: "gift", ded: "otro", frec: "quincenal", cat: ["Bonos y auxilios"], re: /bono|auxilio|apoyo/i },
  { value: "comisiones", label: "Comisiones", desc: "Por ventas o metas cumplidas", icon: "badge-percent", ded: "empleado", frec: "mensual", cat: ["Comisiones"], re: /comisi/i },
  { value: "prima", label: "Prima o pago extra", desc: "Prima de servicios, bonificación del año…", icon: "party-popper", ded: "otro", frec: "anual", cat: ["Primas y bonificaciones"], re: /prima|bonifica/i },
  { value: "honorarios", label: "Honorarios", desc: "Independiente o prestación de servicios", icon: "file-text", ded: "independiente", frec: "mensual", cat: ["Honorarios"], re: /honorario|independiente|servicios/i },
  { value: "pension", label: "Pensión", desc: "Tu mesada de pensionado", icon: "armchair", ded: "pensionado", frec: "mensual", cat: ["Pensión"], re: /pensi[oó]n|mesada/i },
  { value: "arriendo", label: "Arriendo", desc: "Lo que te pagan por un inmueble", icon: "house", ded: "otro", frec: "mensual", cat: ["Arriendos"], re: /arriendo|alquiler/i },
  { value: "negocio", label: "Negocio propio", desc: "Ventas o ganancias de tu negocio", icon: "store", ded: "otro", frec: "mensual", cat: ["Negocio propio"], re: /negocio|ventas/i },
  { value: "inversiones", label: "Intereses o inversiones", desc: "CDT, cuentas de ahorro, dividendos…", icon: "trending-up", ded: "otro", frec: "mensual", cat: ["Intereses y rendimientos"], re: /inter[eé]s|rendimiento|inversi|dividendo|cdt/i },
  { value: "otro", label: "Otro ingreso", desc: "Cualquier otro dinero que recibas", icon: "coins", ded: "otro", frec: "mensual", cat: ["Otros ingresos"], re: /otro/i },
]

/** Tipo de un ingreso: el guardado o, en ingresos de antes, el que sugiere su categoría o concepto. */
export function tipoIngreso(x: { reparto?: unknown; concepto?: string | null }, categoria = ""): TipoIngreso {
  const R = incomeReparto(x)
  if (R.tipo && TIPOS_INGRESO.some((t) => t.value === R.tipo)) return R.tipo
  const por = (txt: string) => (txt.trim() ? TIPOS_INGRESO.find((t) => t.value !== "otro" && t.re.test(txt))?.value : undefined)
  return por(categoria) ?? por(x.concepto ?? "") ?? "otro"
}

/** Pagos por mes de cada frecuencia (diario: los días guardados, 30 por defecto). */
const VECES: Record<string, number> = { mensual: 1, quincenal: 2, semanal: 52 / 12, anual: 1 / 12, diario: 30 }
export const pagosMes = (x: { frec: string; reparto?: unknown }): number => (x.frec === "diario" ? Math.max(1, +(incomeReparto(x).dias ?? 0) || 30) : VECES[x.frec] || 0)

/** Reparto guardado en `incomes.reparto`. */
export interface IncomeReparto {
  /** Tipo de ingreso (salario, bono, prima…). */
  tipo?: TipoIngreso
  /** Valor del mes que escribió la persona (antes de descuentos si los hay; el del pago si es anual). */
  mensual?: number
  /** Diario: días que te pagan al mes (30 por defecto). */
  dias?: number
  /** Descuentos de la 1ª quincena cuando `ded` es "pers" (el resto va en la 2ª). */
  x1?: number
  /** Quincenal: mismo valor en las dos quincenas o uno distinto en cada una. */
  modo?: "igual" | "distinto"
  /** Valor escrito para la 1ª y la 2ª quincena (bruto si se calculan descuentos). */
  b1?: number
  b2?: number
  /** Lo que llega a la cuenta en cada quincena. */
  n1?: number
  n2?: number
  /** En qué quincena se descuentan salud, pensión, retención y demás. */
  ded?: DedEn
  /** Días de pago de la 1ª (1..15) y la 2ª quincena (16..31; 31 = último día del mes). */
  d1?: number
  d2?: number
  /** Semanal: día de la semana (0 domingo … 6 sábado). */
  dow?: number
  /** Anual: mes del pago (1..12). */
  mes?: number
}

/** Reparto guardado en `fixed_expenses.reparto` (gasto quincenal con un valor distinto en cada quincena). */
export interface FixedReparto {
  modo?: "igual" | "distinto"
  q1?: number
  q2?: number
}

export type DedEn = "mitad" | "q1" | "q2" | "pers"
export const DED_EN: { value: DedEn; label: string; desc: string }[] = [
  { value: "mitad", label: "Mitad y mitad", desc: "La mitad de los descuentos en cada quincena" },
  { value: "q2", label: "Todo en la 2ª quincena", desc: "La 1ª llega completa; en la 2ª te descuentan todo el mes" },
  { value: "q1", label: "Todo en la 1ª quincena", desc: "En la 1ª te descuentan todo el mes; la 2ª llega completa" },
  { value: "pers", label: "Una parte en cada una", desc: "Escribes cuánto te descuentan en la 1ª; el resto va en la 2ª" },
]

export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
export const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

export const incomeReparto = (x: { reparto?: unknown }): IncomeReparto => (x.reparto && typeof x.reparto === "object" ? (x.reparto as IncomeReparto) : {})
export const fixedReparto = (f: { reparto?: unknown }): FixedReparto => (f.reparto && typeof f.reparto === "object" ? (f.reparto as FixedReparto) : {})

export interface QuincenasNetas {
  /** Lo que llega en la 1ª y la 2ª quincena. */
  n1: number
  n2: number
  /** Descuentos de cada quincena. */
  x1: number
  x2: number
  /** Descuentos del mes y su detalle (valores del mes). */
  total: number
  items: DedItem[]
}

/**
 * Lo que llega en cada quincena: con descuentos, se calculan los del mes (con la marca `mes`, sobre el sueldo del mes
 * como la nómina; sin ella, sobre el promedio de las dos quincenas como un pago quincenal de la v4) y se cargan a la
 * mitad en cada una, todo a la 1ª, todo a la 2ª o `x1` en la 1ª y el resto en la 2ª. Si una quincena no alcanza a
 * cubrir su parte, el resto pasa a la otra.
 */
export function quincenasNetas(b1: number, b2: number, D: Deducciones | null | undefined, ref: NominaRef, ded: DedEn = "mitad", x1Pers?: number): QuincenasNetas {
  b1 = Math.max(0, +b1 || 0)
  b2 = Math.max(0, +b2 || 0)
  const k = D?.mes ? 1 : 2
  const r = D ? (D.mes ? dedCalc(b1 + b2, "mensual", D, ref) : dedCalc((b1 + b2) / 2, "quincenal", D, ref)) : null
  const T = r ? r.total * k : 0
  let x1 = ded === "q1" ? T : ded === "q2" ? 0 : ded === "pers" && x1Pers != null ? Math.min(T, Math.max(0, +x1Pers || 0)) : T / 2
  x1 = Math.min(x1, b1)
  let x2 = T - x1
  if (x2 > b2) {
    x2 = b2
    x1 = Math.min(b1, T - x2)
  }
  return {
    n1: Math.round(b1 - x1), n2: Math.round(b2 - x2), x1: Math.round(x1), x2: Math.round(x2),
    total: Math.round(x1 + x2), items: (r?.items ?? []).map((i) => ({ ...i, v: i.v * k })),
  }
}

export interface PlanPago {
  /** "1ª quincena", "Cada semana", "Cada día"… */
  n: string
  bruto: number
  desc: number
  neto: number
}

export interface PlanIngreso {
  /** Valor del mes antes de descuentos (el del pago si es anual). */
  mensual: number
  /** Descuentos del mes (del pago si es anual) y su detalle. */
  desc: number
  items: DedItem[]
  /** Lo que llega en el mes (en el pago si es anual). */
  neto: number
  /** Cada pago: dos quincenas o un pago representativo (semana, día, mes, año). */
  pagos: PlanPago[]
  /** Promedio por pago: lo que guardan `incomes.valor` (neto) y `incomes.bruto`. */
  valor: number
  bruto: number
}

/**
 * Del valor del mes a cada pago: los descuentos se calculan sobre el mes (como la nómina) y se reparten entre los
 * pagos. Quincenal: `b1` y `b2` (por defecto la mitad del mes) y `ded`/`x1` dicen en qué quincena se descuenta;
 * semanal y diario: el mes entre las semanas (52/12) o los días; anual: el valor es el del pago.
 */
export function planIngreso(o: {
  frec: string; mensual: number; b1?: number; b2?: number; dias?: number
  D?: Deducciones | null; ref: NominaRef; ded?: DedEn; x1?: number
}): PlanIngreso {
  const M = Math.max(0, +o.mensual || 0)
  if (o.frec === "quincenal") {
    const b1 = o.b1 ?? Math.round(M / 2), b2 = o.b2 ?? M - Math.round(M / 2)
    const q = quincenasNetas(b1, b2, o.D, o.ref, o.D ? o.ded ?? "mitad" : "mitad", o.x1)
    return {
      mensual: b1 + b2, desc: q.total, items: q.items, neto: q.n1 + q.n2,
      pagos: [{ n: "1ª quincena", bruto: b1, desc: q.x1, neto: q.n1 }, { n: "2ª quincena", bruto: b2, desc: q.x2, neto: q.n2 }],
      valor: Math.round((q.n1 + q.n2) / 2), bruto: Math.round((b1 + b2) / 2),
    }
  }
  const r = o.D ? dedCalc(M, o.frec === "anual" ? "anual" : "mensual", o.D, o.ref) : { neto: M, items: [], total: 0 }
  const veces = o.frec === "diario" ? Math.max(1, +(o.dias ?? 0) || 30) : o.frec === "anual" ? 1 : VECES[o.frec] || 1
  const per = (v: number) => Math.round(v / veces)
  const n = o.frec === "semanal" ? "Cada semana" : o.frec === "diario" ? "Cada día" : o.frec === "anual" ? "El pago" : "Cada mes"
  return {
    mensual: M, desc: r.total, items: r.items, neto: r.neto,
    pagos: [{ n, bruto: per(M), desc: per(r.total), neto: per(r.neto) }],
    valor: per(r.neto), bruto: per(M),
  }
}

/** Descuentos guardados por el formulario de antes (valores fijos de cada pago) llevados a valores del mes. */
export function dedAMes(D: Deducciones, frec: string): Deducciones {
  if (D.mes) return D
  const k = frec === "anual" ? 1 : VECES[frec] || 1
  const fx = (v: unknown) => (v === "" || v == null ? v : Math.round((+v || 0) * k))
  return {
    ...D, mes: true,
    retV: D.retModo === "manual" ? (fx(D.retV) as number) : D.retV,
    otros: (D.otros ?? []).map((x) => (x.pct ? x : { ...x, v: fx(x.v) as number })),
  }
}

export interface Pago {
  /** 'YYYY-MM-DD' */
  fecha: string
  /** Valor en la moneda del ingreso. */
  v: number
  /** Quincena a la que corresponde (pagos quincenales y lo de cada quincena de un pago diario). */
  parte?: "q1" | "q2"
  /** Pago diario: cuántos días suma. */
  dias?: number
}

/** Día de pago de cada quincena (por defecto 15 y fin de mes), recortado al último día del mes. */
export function diasQuincena(R: IncomeReparto, y: number, m: number): [number, number] {
  const ld = lastDay(y, m)
  const d1 = Math.min(15, Math.max(1, Math.round(R.d1 || 15)))
  const d2 = Math.min(ld, Math.max(16, Math.round(R.d2 || ld)))
  return [d1, d2]
}

/**
 * Pagos de un ingreso en el mes `m` (base 0) del año `y`. Quincenal: 2 pagos con el valor de cada quincena;
 * mensual: el día de pago; semanal: cada semana el día escogido (viernes por defecto); anual: solo si el mes
 * del pago está guardado.
 */
export function incomePagos(x: Pick<IncomeIn, "frec" | "valor" | "dia"> & { reparto?: unknown }, y: number, m: number): Pago[] {
  const R = incomeReparto(x)
  const ld = lastDay(y, m)
  const v = +x.valor || 0
  const at = (d: number) => iso(new Date(y, m, Math.min(d, ld)))
  if (x.frec === "quincenal") {
    const [d1, d2] = diasQuincena(R, y, m)
    return [{ fecha: at(d1), v: R.n1 ?? v, parte: "q1" }, { fecha: at(d2), v: R.n2 ?? v, parte: "q2" }]
  }
  if (x.frec === "mensual") return [{ fecha: at(x.dia || 30), v }]
  if (x.frec === "diario") {
    // Se resume en lo de cada quincena (los días se reparten mitad y mitad) para no llenar la agenda de pagos.
    const n = pagosMes(x), h = Math.round(n / 2)
    const [d1, d2] = diasQuincena({}, y, m)
    return [{ fecha: at(d1), v: v * h, parte: "q1", dias: h }, { fecha: at(d2), v: v * (n - h), parte: "q2", dias: n - h }]
  }
  if (x.frec === "semanal") {
    const dow = R.dow ?? 5
    const out: Pago[] = []
    for (let d = 1; d <= ld; d++) if (new Date(y, m, d).getDay() === dow) out.push({ fecha: at(d), v })
    return out
  }
  if (x.frec === "anual" && R.mes === m + 1) return [{ fecha: at(x.dia || 1), v }]
  return []
}

/** Texto corto de cuándo llega un ingreso: "15 y 30 · $X y $Y", "Cada viernes", "Cada año el 20 de diciembre". */
export function incomeCuando(x: Pick<IncomeIn, "frec" | "dia"> & { reparto?: unknown }): string {
  const R = incomeReparto(x)
  if (x.frec === "quincenal") return `Cada quincena (${R.d1 || 15} y ${R.d2 && R.d2 < 31 ? R.d2 : "fin de mes"})`
  if (x.frec === "mensual") return `Cada mes el día ${x.dia || 30}`
  if (x.frec === "semanal") return `Cada ${DIAS_SEMANA[R.dow ?? 5].toLowerCase()}`
  if (x.frec === "diario") return `Cada día (${pagosMes(x)} días al mes)`
  if (x.frec === "anual") return R.mes ? `Cada año el ${x.dia || 1} de ${MESES_LARGOS[R.mes - 1].toLowerCase()}` : "Una vez al año"
  return x.frec
}

/** Quincena en la que cae un día del mes según el corte (por defecto 15). */
export const quincenaDeDia = (dia: number, corte = 15): "q1" | "q2" => (dia <= Math.min(Math.max(corte || 15, 1), 27) ? "q1" : "q2")

/** Valor de un periodo de un gasto fijo: quincenal con valor distinto en cada quincena; si no, `valor`. */
export function fijoValor(f: Pick<FixedExpenseIn, "frec" | "valor"> & { reparto?: unknown }, per: string): number {
  const R = fixedReparto(f)
  if (f.frec === "quincenal" && R.modo === "distinto") {
    const v = per.endsWith("Q1") ? R.q1 : per.endsWith("Q2") ? R.q2 : undefined
    if (v != null && Number.isFinite(+v)) return +v
  }
  return +f.valor
}
