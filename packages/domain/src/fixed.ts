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

type FijoPeriodInput = Pick<FixedExpenseIn, "frec" | "dia" | "dia2" | "mes" | "desde" | "fecha_unica" | "hasta">

function periodosDelMes(f: FijoPeriodInput, y: number, m: number, today?: DateInput): FixedPeriod[] {
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

/**
 * Periodos de un gasto fijo que caen en el mes `m` (base 0) del año `y`.
 * Bimestral/trimestral/semestral toman la fase de `desde`. Un día mayor al último del mes se recorta.
 * `today` solo se usa si un gasto único no tiene fecha (la v4 tomaba hoy).
 * Un fijo con fecha de fin (`hasta`) no tiene periodos después de esa fecha.
 */
export function fijoPeriods(f: FijoPeriodInput, y: number, m: number, today?: DateInput): FixedPeriod[] {
  const out = periodosDelMes(f, y, m, today)
  const h = f.hasta
  return h ? out.filter((p) => p.due <= h) : out
}

/**
 * Equivalente mensual de un fijo, en pesos si se pasa la TRM (un fijo en USD o EUR se convierte).
 * Con `today`, un fijo que ya terminó (`hasta`) vale 0: no sigue sumando en "Total al mes".
 */
export function fijoMensual(
  f: Pick<FixedExpenseIn, "frec" | "valor"> & { currency?: string | null; hasta?: string | null },
  trm?: Record<string, number> | null,
  today?: DateInput,
): number {
  if (today && f.hasta && iso(toDay(today)) > f.hasta) return 0
  const v = trm && f.currency && f.currency !== "COP" ? f.valor * (+trm[f.currency] || 1) : f.valor
  return f.frec === "quincenal" ? v * 2 : FSTEP[f.frec] ? v / FSTEP[f.frec] : 0
}

export interface FixedPeriodStatus extends FixedPeriod {
  /** El primer pago del periodo (si hay). Para saber si está pagado usa `completo`. */
  pago?: FixedPaymentIn
  /** Pagos (abonos) del periodo. */
  pagos: FixedPaymentIn[]
  /** Lo pagado en el periodo. */
  pagado: number
  /** Lo que falta del periodo (0 si está completo). */
  falta: number
  /** ¿Quedó pagado? */
  completo: boolean
  /** ¿Tiene abonos y le falta? */
  parcial: boolean
}

/**
 * Cómo va un periodo de un fijo con sus pagos (abonos): lo pagado, lo que falta y si quedó completo. Queda completo si
 * un pago lo cierra (`cierra: true`, también "esta vez costó menos"), si lo pagado cubre el valor del periodo, o si el
 * fijo es de valor variable y hay un pago que no es abono. Los pagos de antes (`cierra` vacío) por menos del valor de
 * un fijo de valor fijo cuentan como abono: así se ve lo que falta (la moto: $70.000, pagaste $40.000 → faltan $30.000).
 */
export function pagoPeriodo(f: Pick<FixedExpenseIn, "frec" | "valor" | "variable"> & { reparto?: unknown }, per: string, pagos: FixedPaymentIn[]) {
  const vivos = pagos.filter((x) => x.periodo === per && !x.deleted_at)
  const pagado = vivos.reduce((a, x) => a + (+x.valor || 0), 0)
  const esperado = fijoValor(f, per)
  const completo = vivos.length > 0 && (
    vivos.some((x) => x.cierra === true) || pagado >= esperado - 1 || (!!f.variable && vivos.some((x) => x.cierra == null))
  )
  const falta = completo ? 0 : Math.max(0, esperado - pagado)
  return { pagos: vivos, pagado, falta, completo, parcial: vivos.length > 0 && !completo, esperado }
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
 * `trm` (opcional, en pesos si se pasa) convierte `mensual` igual que `fijoMensual`/`fijosMes`, para que
 * el total de la tabla y el KPI del mismo listado no se contradigan con un fijo en USD o EUR.
 */
export function fijoStatus(f: FixedExpenseIn, today: DateInput, trm?: Record<string, number> | null): FixedStatus {
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
      const P = pagoPeriodo(f, p.per, f.payments)
      out.push({ ...p, pago: P.pagos[0], pagos: P.pagos, pagado: P.pagado, falta: P.falta, completo: P.completo, parcial: P.parcial })
    }
  }
  // Pendiente = sin pagar o con abonos y le falta.
  const venc = out.filter((p) => !p.completo && p.due < ti)
  const prox = out.find((p) => !p.completo && p.due >= ti) || null
  return { periods: out, venc, prox, mensual: fijoMensual(f, trm ?? null, t) }
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
  /** Lo que falta del periodo (su valor, o el resto si ya tiene abonos). */
  valor: number
  /** Lo ya abonado al periodo (0 si no tiene abonos). */
  abonado: number
  /** ¿Con este gasto queda pagado el periodo? Sin abonos antes, sí; con abonos, solo si cubre lo que falta. */
  completo: boolean
  /** El periodo ya está pagado (solo con `incluirPagados`: el gasto estaría contado dos veces). */
  yaPagado: boolean
}

type GastoSuelto = { descripcion: string; valor: number; fecha: string; provider_id?: string | null; fixed_expense_id?: string | null; origen?: string | null }
type FijoSug = FixedExpenseIn & { provider_id?: string | null; vmin?: number | null; vmax?: number | null; deleted_at?: string | null }

/**
 * ¿El gasto suelto que acabas de guardar es el pago de un gasto fijo que está pendiente? (p. ej. el arriendo que llegó
 * por el correo del banco). Coincide si:
 * - el fijo tiene el mismo proveedor, o su nombre y la descripción comparten una palabra (Arriendo ↔ "Pago arriendo"), y
 * - el valor se parece (±15 % de lo que falta del periodo o dentro del rango si es variable), y
 * - hay un periodo sin pagar con fecha a 40 días o menos de la del gasto (también uno con abonos: se compara con lo
 *   que falta, p. ej. la moto de $70.000 con $40.000 abonados acepta un gasto de $30.000).
 * Nunca para aportes a metas (`link_type`) ni para gastos que ya están enlazados (fijo, tarjeta, préstamo, compartido).
 * Devuelve el periodo pendiente más cercano en fecha (o `null`).
 */
export function sugerirPagoFijo(g: GastoSuelto, fijos: FijoSug[], today: DateInput = g.fecha, opts: { incluirPagados?: boolean } = {}): SugerenciaFijo | null {
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
        // Un periodo con abonos sigue abierto: lo que se compara es lo que FALTA, no el valor completo.
        const PP = pagoPeriodo(f, p.per, f.payments)
        if (PP.completo && !opts.incluirPagados) continue
        const dist = Math.abs(parseDate(p.due).getTime() - f0.getTime()) / 864e5
        if (dist > 40) continue
        const esperado = PP.parcial ? PP.falta : fijoValor(f, p.per)
        const v = +g.valor
        // Con abonos no se usa el rango del fijo variable: lo que falta es una cifra exacta.
        const okValor = f.variable && +(f.vmin ?? 0) > 0 && !PP.parcial
          ? v >= +(f.vmin ?? 0) * 0.85 && v <= +(f.vmax ?? 0) * 1.15
          : Math.abs(v - esperado) <= Math.max(1000, esperado * 0.15)
        if (!okValor) continue
        if (!best || dist < best.dist) best = { fixed: f, per: p.per, due: p.due, valor: esperado, abonado: PP.pagado, completo: !PP.parcial || v >= esperado - 1, yaPagado: PP.completo, dist }
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
