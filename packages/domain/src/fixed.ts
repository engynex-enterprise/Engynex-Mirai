// Gastos fijos: periodos, vencimientos y valor mensual (equivalente a b_core.js de la v4).
import { addDays, iso, lastDay, mkey, parseDate, toDay } from "./dates"
import { fijoValor } from "./reparto"
import type { DateInput, FixedExpenseIn, FixedPaymentIn } from "./types"

export const FFREC: Record<string, string> = {
  mensual: "Cada mes",
  quincenal: "Cada quincena",
  bimestral: "Cada dos meses",
  trimestral: "Cada tres meses",
  semestral: "Cada seis meses",
  anual: "Una vez al año",
  unico: "Una sola vez",
}

/** Cada cuántos meses se repite. */
export const FSTEP: Record<string, number> = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 }

export interface FixedPeriod {
  /** Clave del periodo: 'YYYY-MM', 'YYYY-MM-Q1'/'-Q2', 'YYYY' (anual) o 'U' (único). */
  per: string
  /** Fecha de pago 'YYYY-MM-DD'. */
  due: string
}

type FijoPeriodInput = Pick<FixedExpenseIn, "frec" | "dia" | "dia2" | "mes" | "desde" | "fecha_unica">

/**
 * Periodos de un gasto fijo que caen en el mes `m` (base 0) del año `y`.
 * Bimestral/trimestral/semestral toman la fase de `desde`. Un día mayor al último del mes se recorta.
 * `today` solo se usa si un gasto único no tiene fecha (la v4 tomaba hoy).
 */
export function fijoPeriods(f: FijoPeriodInput, y: number, m: number, today?: DateInput): FixedPeriod[] {
  const ld = lastDay(y, m)
  const mk = `${y}-${String(m + 1).padStart(2, "0")}`
  const dd = (x: number | null | undefined) => iso(new Date(y, m, Math.min(x || 1, ld)))
  if (f.frec === "mensual") return [{ per: mk, due: dd(f.dia) }]
  if (f.frec === "quincenal") return [{ per: mk + "-Q1", due: dd(f.dia && f.dia <= 15 ? f.dia : 15) }, { per: mk + "-Q2", due: dd(f.dia2 || 30) }]
  if (FSTEP[f.frec] > 1 && f.frec !== "anual") {
    const n = FSTEP[f.frec]
    const [dy, dm] = (f.desde || mk).split("-").map(Number)
    const diff = (y - dy) * 12 + (m - (dm - 1))
    return diff >= 0 && diff % n === 0 ? [{ per: mk, due: dd(f.dia) }] : []
  }
  if (f.frec === "anual") return +(f.mes ?? 0) === m + 1 ? [{ per: String(y), due: dd(f.dia) }] : []
  if (f.frec === "unico") {
    const d = parseDate(f.fecha_unica, today ?? new Date(y, m, 1))
    return d.getFullYear() === y && d.getMonth() === m ? [{ per: "U", due: iso(d) }] : []
  }
  return []
}

/** Valor mensual equivalente: quincenal ×2; con paso N meses ÷N; único → 0. */
export function fijoMensual(f: Pick<FixedExpenseIn, "frec" | "valor">): number {
  return f.frec === "quincenal" ? f.valor * 2 : FSTEP[f.frec] ? f.valor / FSTEP[f.frec] : 0
}

export interface FixedPeriodStatus extends FixedPeriod {
  pago?: FixedPaymentIn
}

export interface FixedStatus {
  periods: FixedPeriodStatus[]
  /** Periodos sin pago con fecha anterior a hoy. */
  venc: FixedPeriodStatus[]
  /** Primer periodo sin pago desde hoy. */
  prox: FixedPeriodStatus | null
  mensual: number
}

/**
 * Estado de un gasto fijo: recorre desde max(mes de `desde`, hace 3 meses) hasta hoy + 13 meses,
 * ignora periodos anteriores a `inicio` y cruza con los pagos registrados.
 */
export function fijoStatus(f: FixedExpenseIn, today: DateInput): FixedStatus {
  const t = toDay(today)
  const ti = iso(t)
  const out: FixedPeriodStatus[] = []
  const [dy, dm] = (f.desde || mkey(t)).split("-").map(Number)
  const start = new Date(Math.max(new Date(dy, dm - 1, 1).getTime(), new Date(t.getFullYear(), t.getMonth() - 3, 1).getTime()))
  const end = new Date(t.getFullYear(), t.getMonth() + 13, 1)
  const ini = f.inicio ? iso(parseDate(f.inicio)) : null
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    for (const p of fijoPeriods(f, d.getFullYear(), d.getMonth(), t)) {
      if (ini && p.due < ini) continue
      const pago = f.payments.find((x) => x.periodo === p.per)
      out.push({ ...p, pago })
    }
  }
  const venc = out.filter((p) => !p.pago && p.due < ti)
  const prox = out.find((p) => !p.pago && p.due >= ti) || null
  return { periods: out, venc, prox, mensual: fijoMensual(f) }
}

/** Fecha del primer periodo vencido o del próximo; si no hay, hoy + 10 días. */
export function fijoProxIso(f: FixedExpenseIn | null | undefined, today: DateInput): string {
  if (f && f.id) {
    const st = fijoStatus(f, today)
    const p = st.venc[0] || st.prox
    if (p) return p.due
  }
  return iso(addDays(toDay(today), 10))
}

// ——— ¿Este gasto es el pago de un gasto fijo? ———

const normF = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
/** Palabras con sentido (3+ letras) para comparar "Arriendo apto" con "Pago arriendo noviembre". */
const palabras = (s: string) => normF(s).split(" ").filter((w) => w.length >= 3 && !/^(pago|pague|del|las|los|mes|por|para|con)$/.test(w))

export interface SugerenciaFijo {
  fixed: FixedExpenseIn
  /** Periodo pendiente ('YYYY-MM', 'YYYY-MM-Q1'…) y su fecha de pago. */
  per: string
  due: string
  /** Valor esperado del periodo. */
  valor: number
}

type GastoSuelto = { descripcion: string; valor: number; fecha: string; provider_id?: string | null; fixed_expense_id?: string | null; origen?: string | null }
type FijoSug = FixedExpenseIn & { provider_id?: string | null; vmin?: number | null; vmax?: number | null; deleted_at?: string | null }

/**
 * ¿El gasto suelto que acabas de guardar es el pago de un gasto fijo que está pendiente? (p. ej. el arriendo que llegó
 * por el correo del banco). Coincide si:
 * - el fijo tiene el mismo proveedor, o su nombre y la descripción comparten una palabra (Arriendo ↔ "Pago arriendo"), y
 * - el valor se parece (±15 % del valor del periodo o dentro del rango si es variable), y
 * - hay un periodo sin pago con fecha a 40 días o menos de la del gasto.
 * Nunca para aportes a metas (`link_type`) ni para gastos que ya están enlazados (fijo, tarjeta, préstamo, compartido).
 * Devuelve el periodo pendiente más cercano en fecha (o `null`).
 */
export function sugerirPagoFijo(g: GastoSuelto, fijos: FijoSug[], today: DateInput = g.fecha): SugerenciaFijo | null {
  if (g.fixed_expense_id || (g.origen && !["manual", "correo", "importar", "ocr", "voz"].includes(g.origen)) || !(+g.valor > 0)) return null
  const pg = new Set(palabras(g.descripcion))
  const f0 = parseDate(g.fecha)
  let best: (SugerenciaFijo & { dist: number }) | null = null
  for (const f of fijos) {
    if (f.link_type || f.deleted_at) continue
    const mismoProv = !!g.provider_id && f.provider_id === g.provider_id
    if (!mismoProv && !palabras(f.nombre).some((w) => pg.has(w))) continue
    for (let k = -1; k <= 1; k++) {
      const d = new Date(f0.getFullYear(), f0.getMonth() + k, 1)
      for (const p of fijoPeriods(f, d.getFullYear(), d.getMonth(), today)) {
        if (f.inicio && p.due < iso(parseDate(f.inicio))) continue
        if (f.payments.some((x) => x.periodo === p.per)) continue
        const dist = Math.abs(parseDate(p.due).getTime() - f0.getTime()) / 864e5
        if (dist > 40) continue
        const esperado = fijoValor(f, p.per)
        const v = +g.valor
        const okValor = f.variable && +(f.vmin ?? 0) > 0 ? v >= +(f.vmin ?? 0) * 0.85 && v <= +(f.vmax ?? 0) * 1.15 : Math.abs(v - esperado) <= Math.max(1000, esperado * 0.15)
        if (!okValor) continue
        if (!best || dist < best.dist) best = { fixed: f, per: p.per, due: p.due, valor: esperado, dist }
      }
    }
  }
  if (!best) return null
  const { dist: _d, ...r } = best
  void _d
  return r
}

const MESES_F = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

/** El periodo de un fijo en palabras: "noviembre", "la primera quincena de noviembre", "2026" o "" (pago único). */
export function periodoTexto(per: string): string {
  const m = per.match(/^(\d{4})-(\d{2})(?:-Q([12]))?$/)
  if (m) return `${m[3] ? `la ${m[3] === "1" ? "primera" : "segunda"} quincena de ` : ""}${MESES_F[+m[2] - 1]}`
  return /^\d{4}$/.test(per) ? per : ""
}
