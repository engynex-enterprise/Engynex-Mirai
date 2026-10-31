// Motor de préstamos (equivalente a `engine` y compañía en b_core.js y j_loans.js de la v4).
// La tasa `loan.tasa` es % MENSUAL. Para otras frecuencias se convierte: compuesta (1+im)^k − 1;
// en interés simple, lineal im·k.
import { addBiz, addDays, addMonths, days, iso, parseDate, toDay } from "./dates"
import type { ContactIn, DateInput, EntityIn, LoanIn, LoanPaymentIn } from "./types"

export type Sistema = "frances" | "aleman" | "simple" | "americano" | "sin"

export const SISTEMAS: Record<Sistema, { n: string; t: string; icon: string; d: string }> = {
  frances: { n: "Cuota fija", t: "Sistema francés", icon: "equal", d: "Pagas el mismo valor en cada cuota. Es el que usan los bancos en Colombia para créditos de consumo, libranza y vehículo." },
  aleman: { n: "Cuota que va bajando", t: "Abono fijo a capital (sistema alemán)", icon: "trending-down", d: "Cada cuota abona lo mismo a la deuda y los intereses se calculan sobre lo que falta, así que la cuota empieza alta y baja. Pagas menos intereses en total." },
  simple: { n: "Interés sobre lo prestado", t: "Interés simple", icon: "percent", d: 'Muy común entre conocidos ("te presto al 2%"): el interés de cada cuota se calcula sobre el valor prestado y la cuota es fija.' },
  americano: { n: "Solo intereses y al final el capital", t: "Sistema americano", icon: "hourglass", d: "Cada periodo se pagan solo los intereses y el valor prestado se devuelve completo en la última cuota." },
  sin: { n: "Sin intereses", t: "Partes iguales", icon: "hand-coins", d: "Se divide el valor en cuotas iguales, sin cobrar intereses." },
}

/** Frecuencias de pago: `k` = fracción de mes de cada periodo. */
export const FRECS: Record<string, { n: string; per: string; k: number; pl: string }> = {
  mensual: { n: "Mensual", per: "mes", k: 1, pl: "meses" },
  quincenal: { n: "Quincenal", per: "quincena", k: 0.5, pl: "quincenas" },
  semanal: { n: "Semanal", per: "semana", k: 12 / 52, pl: "semanas" },
  diario: { n: "Diario", per: "día", k: 12 / 365, pl: "días" },
  diariohab: { n: "Diario (lunes a sábado)", per: "día hábil", k: 12 / 313, pl: "días hábiles" },
}

/** Cuántas cuotas caen en un mes según la frecuencia. */
export const FMES: Record<string, number> = { mensual: 1, quincenal: 2, semanal: 52 / 12, diario: 365 / 12, diariohab: 313 / 12 }

type LoanRate = Pick<LoanIn, "tasa" | "sistema" | "frec">

/** Tasa de interés de cada periodo (fracción, no %). */
export function periodRate(L: LoanRate): number {
  const im = (+L.tasa || 0) / 100
  if (L.sistema === "sin" || !im) return 0
  const k = FRECS[L.frec]?.k || 1
  return L.sistema === "simple" ? im * k : Math.pow(1 + im, k) - 1
}

/** Fecha programada de la cuota `k` (quincenal = cada 15 días exactos, no 15 y 30). */
export function addPeriod(inicio: string, frec: string, k: number): Date {
  const d = parseDate(inicio)
  return frec === "quincenal" ? addDays(d, 15 * k)
    : frec === "semanal" ? addDays(d, 7 * k)
    : frec === "diario" ? addDays(d, k)
    : frec === "diariohab" ? addBiz(d, k)
    : addMonths(d, k)
}

/** Cuota fija de una anualidad: S·i / (1 − (1+i)^−n). */
export const annuity = (S: number, i: number, n: number): number => (n <= 0 ? S : i === 0 ? S / n : (S * i) / (1 - Math.pow(1 + i, -n)))

export interface CuotaRow {
  n: number
  fecha: string
  valor: number
  int: number
  cap: number
  extra: number
  saldo: number
}

export type HistRow =
  | { id?: string; tipo: "cuota"; n: number; fecha: string; prog: string; valor: number; int: number; cap: number; extra: number; saldo: number }
  | { id?: string; tipo: "abono"; fecha: string; valor: number; int: 0; cap: number; extra: 0; saldo: number; modo?: string | null }

export interface LoanEngine {
  /** Tasa por periodo. */
  i: number
  sys: Sistema
  /** Lo que falta de capital. */
  saldo: number
  hist: HistRow[]
  /** Cuotas futuras (máx. 1.200). */
  plan: CuotaRow[]
  next: CuotaRow | null
  /** Días de atraso de la próxima cuota. */
  mora: number
  vencidas: CuotaRow[]
  /** Cuotas pagadas. */
  k: number
  intPag: number
  pagado: number
  intTotal: number
  totalPagar: number
  done: boolean
  progreso: number
  extraFut: number
}

type EngineLoan = Pick<LoanIn, "monto" | "sistema" | "tasa" | "frec" | "plazo" | "inicio" | "extra"> & { payments: LoanPaymentIn[] }

/**
 * Simula el préstamo cuota a cuota aplicando los pagos registrados en orden de fecha.
 * - Cuota: consume la siguiente cuota (el valor lo calcula el motor).
 * - Abono: resta a capital. `modo:'plazo'` mantiene la cuota y recalcula cuántas faltan;
 *   `modo:'cuota'` (o sistema americano) mantiene el plazo y recalcula la cuota.
 */
export function loanEngine(L: EngineLoan, today: DateInput): LoanEngine {
  const i = periodRate(L)
  const sys: Sistema = L.sistema in SISTEMAS ? (L.sistema as Sistema) : "frances"
  let S = +L.monto
  let nRem = +L.plazo
  let k = 0
  let base = S
  let C = annuity(S, i, nRem)
  let capF = S / nRem
  const extra = +(L.extra ?? 0) || 0
  const next = () => {
    if (S <= 0.5 || nRem <= 0) return null
    let int = 0
    let cap = 0
    if (sys === "frances") { int = S * i; cap = nRem <= 1 ? S : Math.min(Math.max(C - int, 0), S) }
    else if (sys === "aleman") { int = S * i; cap = nRem <= 1 ? S : Math.min(capF, S) }
    else if (sys === "americano") { int = S * i; cap = nRem <= 1 ? S : 0 }
    else if (sys === "simple") { int = base * i; cap = nRem <= 1 ? S : Math.min(capF, S) }
    else { int = 0; cap = nRem <= 1 ? S : Math.min(capF, S) }
    return { int, cap, valor: int + cap + extra }
  }
  const hist: HistRow[] = []
  let intPag = 0
  let pagado = 0
  const pagos = L.payments.map((p, ix) => ({ ...p, ix })).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.ix - b.ix)
  for (const p of pagos) {
    if (p.tipo === "cuota") {
      const q = next()
      if (!q) continue
      S -= q.cap; k++; nRem--; intPag += q.int; pagado += q.valor
      hist.push({ id: p.id, tipo: "cuota", n: k, fecha: iso(parseDate(p.fecha)), prog: iso(addPeriod(L.inicio, L.frec, k)), valor: q.valor, int: q.int, cap: q.cap, extra, saldo: Math.max(S, 0) })
    } else {
      const v = Math.min(+p.valor || 0, S)
      if (v <= 0) continue
      S -= v; pagado += v
      hist.push({ id: p.id, tipo: "abono", fecha: iso(parseDate(p.fecha)), valor: v, int: 0, cap: v, extra: 0, saldo: Math.max(S, 0), modo: p.modo })
      if (S <= 0.5) { S = 0; nRem = 0; continue }
      if (p.modo === "plazo" && (sys === "frances" || sys === "aleman" || sys === "simple" || sys === "sin")) {
        if (sys === "frances") nRem = i === 0 ? Math.ceil(S / C) : Math.max(1, Math.ceil(-Math.log(1 - Math.min((S * i) / C, 0.999999)) / Math.log(1 + i)))
        else nRem = Math.max(1, Math.ceil(S / capF - 1e-9))
      } else { C = annuity(S, i, nRem); capF = S / nRem; base = S }
      if (sys === "simple") base = S
    }
  }
  // Plan de cuotas futuras (no altera el estado actual).
  const plan: CuotaRow[] = []
  {
    const sv = { S, nRem, k, C, capF, base }
    let j = k
    while (S > 0.5 && nRem > 0 && plan.length < 1200) {
      const q = next()!
      j++; S -= q.cap; nRem--
      plan.push({ n: j, fecha: iso(addPeriod(L.inicio, L.frec, j)), valor: q.valor, int: q.int, cap: q.cap, extra, saldo: Math.max(S, 0) })
    }
    ;({ S, nRem, k, C, capF, base } = sv)
  }
  const saldo = Math.max(S, 0)
  const nx = plan[0] || null
  const t = iso(toDay(today))
  const mora = nx && nx.fecha < t ? days(parseDate(nx.fecha), parseDate(t)) : 0
  const vencidas = plan.filter((r) => r.fecha < t)
  const intFut = plan.reduce((a, r) => a + r.int, 0)
  const extraFut = plan.reduce((a, r) => a + r.extra, 0)
  return {
    i, sys, saldo, hist, plan, next: nx, mora, vencidas, k, intPag, pagado,
    intTotal: intPag + intFut,
    totalPagar: pagado + plan.reduce((a, r) => a + r.valor, 0),
    done: saldo <= 0.5,
    progreso: L.monto ? 1 - saldo / L.monto : 1,
    extraFut,
  }
}

export interface LoanPreviewInput {
  monto: number
  sistema: string
  tasa: number
  frec: string
  plazo: number
  inicio?: string | null
  extra?: number | null
}

/** Vista previa al crear un préstamo: primera y última cuota, total, intereses, fecha final y tasa E.A. */
export function previewLoan(p: LoanPreviewInput, today: DateInput) {
  const L = { monto: p.monto, sistema: p.sistema, tasa: p.tasa, frec: p.frec, plazo: p.plazo, inicio: p.inicio || iso(toDay(today)), payments: [], extra: p.extra || 0 }
  const e = loanEngine(L, today)
  const first = e.plan[0]
  const last = e.plan[e.plan.length - 1]
  const ea = L.sistema === "simple" ? ((+L.tasa || 0) * 12) / 100 : Math.pow(1 + (+L.tasa || 0) / 100, 12) - 1
  return {
    cuota: first ? first.valor : 0,
    cuotaFin: last ? last.valor : 0,
    total: e.plan.reduce((a, r) => a + r.valor, 0),
    int: e.plan.reduce((a, r) => a + r.int, 0),
    fin: last ? last.fecha : null,
    ea,
    plan: e.plan,
  }
}

/** Tasa mensual (%) que produce una cuota dada (bisección de 80 pasos). 0 si la cuota no cubre el monto. */
export function rateFromCuota(M: number, cuota: number, n: number, frec: string): number {
  const k = FRECS[frec]?.k || 1
  if (cuota * n <= M) return 0
  let lo = 0
  let hi = 1
  for (let it = 0; it < 80; it++) {
    const mid = (lo + hi) / 2
    const ip = Math.pow(1 + mid, k) - 1
    const c = annuity(M, ip, n)
    if (c > cuota) hi = mid
    else lo = mid
  }
  return lo * 100
}

/** Nombre de la contraparte: contacto (me deben) o entidad/contacto (le debo). */
export function loanName(L: Pick<LoanIn, "kind" | "contact_id" | "entity_id">, contacts: ContactIn[], entities: EntityIn[]): string {
  if (L.kind === "cobrar") return contacts.find((c) => c.id === L.contact_id)?.nombre || "Sin contacto"
  if (L.contact_id) return contacts.find((c) => c.id === L.contact_id)?.nombre || "—"
  return entities.find((e) => e.id === L.entity_id)?.nombre || "—"
}

export type LoanStatus = [cls: "ok" | "bad" | "warn" | "info", texto: string, icon: string]

/** Estado para la etiqueta del préstamo: Pagado / Atrasado N d / Cuota pronto / Al día. */
export function loanStatus(e: LoanEngine, today: DateInput, anticipo: number): LoanStatus {
  return e.done ? ["ok", "Pagado", "circle-check"]
    : e.mora > 0 ? ["bad", `Atrasado ${e.mora} d`, "circle-alert"]
    : e.next && days(toDay(today), parseDate(e.next.fecha)) <= anticipo ? ["warn", "Cuota pronto", "clock"]
    : ["info", "Al día", "check"]
}

/** Calendario de cuotas: pagadas (en su fecha programada) + pendientes. */
export function loanCal(e: LoanEngine): { fecha: string; valor: number; paid: boolean; n: number }[] {
  const rows: { fecha: string; valor: number; paid: boolean; n: number }[] = []
  for (const h of e.hist) if (h.tipo === "cuota") rows.push({ fecha: h.prog, valor: h.valor, paid: true, n: h.n })
  for (const p of e.plan) rows.push({ fecha: p.fecha, valor: p.valor, paid: false, n: p.n })
  return rows
}

export type HistMode = "nuevo" | "aldia" | "cuotas" | "saldo"

export interface HistPlanInput {
  mode: HistMode
  /** Modo 'cuotas': cuántas cuotas ya se pagaron. */
  ncuotas?: number | null
  /** Modo 'saldo': lo que se debe hoy según el extracto. */
  saldoHoy?: number | null
  /** Modo 'saldo': fecha del último pago ('YYYY-MM-DD'). Por defecto hoy. */
  fultPago?: string | null
}

/** Pago generado para un préstamo que ya venía de antes (se marcan como importados). */
export type HistPayment = { fecha: string; tipo: "cuota" | "abono"; valor?: number; modo?: "plazo"; imp: 1 }

/**
 * Préstamos que ya venían de antes: genera de una vez los pagos ya hechos.
 * - aldia: una cuota por cada fila del plan con fecha ≤ hoy.
 * - cuotas: las primeras N (fecha = la de la cuota o hoy si es futura).
 * - saldo: marca cuotas mientras el saldo siga ≥ el saldo de hoy y cuadra la diferencia con un abono (modo plazo).
 */
export function histPlan(L: EngineLoan, input: HistPlanInput, today: DateInput): HistPayment[] {
  const mode = input.mode
  const e = loanEngine(L, today)
  const rows = e.plan
  const t = iso(toDay(today))
  let pagos: HistPayment[] = []
  if (mode === "aldia") pagos = rows.filter((r) => r.fecha <= t).map((r) => ({ fecha: r.fecha, tipo: "cuota", imp: 1 }))
  else if (mode === "cuotas") {
    const n = Math.max(0, Math.min(Math.round(input.ncuotas || 0), rows.length))
    pagos = rows.slice(0, n).map((r) => ({ fecha: r.fecha < t ? r.fecha : t, tipo: "cuota", imp: 1 }))
  } else if (mode === "saldo") {
    const T = input.saldoHoy
    if (T == null || (typeof T === "number" && isNaN(T))) return []
    const fu = input.fultPago || t
    const fuIso = iso(parseDate(fu))
    const L2 = { ...L, payments: [] as LoanPaymentIn[] }
    for (const r of rows) {
      if (r.saldo < T - 0.5) break
      const p: HistPayment = { fecha: r.fecha < fuIso ? r.fecha : fuIso, tipo: "cuota", imp: 1 }
      L2.payments.push({ fecha: p.fecha, tipo: "cuota", valor: 0 })
      pagos.push(p)
      if (L2.payments.length > 1200) break
    }
    const s2 = loanEngine(L2, today).saldo
    const diff = Math.round(s2 - T)
    if (diff > 1) pagos.push({ fecha: fu, tipo: "abono", valor: diff, modo: "plazo", imp: 1 })
  }
  return pagos
}
