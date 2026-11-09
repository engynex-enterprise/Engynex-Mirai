// Gastos fijos: periodos, vencimientos y valor mensual (equivalente a b_core.js de la v4).
import { addDays, iso, lastDay, mkey, parseDate, toDay } from "./dates"
import { conv } from "./money"
import { fijoValor, fijoValorCOP } from "./reparto"
import type { DateInput, FixedExpenseIn, FixedPaymentIn, Trm } from "./types"

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
  /** Lo pagado en el periodo (siempre en pesos: así se registran los pagos). */
  pagado: number
  /** Lo que falta del periodo (0 si está completo); en pesos si `fijoStatus` recibió la TRM. */
  falta: number
  /** ¿Quedó pagado? */
  completo: boolean
  /** ¿Tiene abonos y le falta? */
  parcial: boolean
}

/** Lo que hace falta para saber desde qué periodo cuida Mirai un fijo y cuándo se creó. */
type FijoInicio = FijoPeriodInput & { inicio?: string | null; created_at?: string | null }

/** Primer periodo que Mirai cuida de un fijo: el primero con fecha de pago igual o posterior a `inicio`. */
export function primerPeriodo(f: Partial<FijoInicio>): FixedPeriod | null {
  if (!f.inicio || !f.frec) return null
  const ini = iso(parseDate(f.inicio))
  const d0 = parseDate(ini)
  for (let k = 0; k <= 12; k++) {
    const d = new Date(d0.getFullYear(), d0.getMonth() + k, 1)
    const p = fijoPeriods(f as FijoPeriodInput, d.getFullYear(), d.getMonth(), d0).find((x) => x.due >= ini)
    if (p) return p
  }
  return null
}

/**
 * Con qué periodo se guarda el «¿Ya lo pagaste este mes?» al crear un fijo (`fpag`: cuándo lo pagó). Si el primer
 * periodo que Mirai cuida ya venció hoy, ese pago es el de ese periodo: «Próximo pago: 5 nov» escrito el 9 nov y «ya
 * lo pagué el 5 nov» paga noviembre. Si el próximo pago todavía no llega, lo que pagó este mes fue el periodo de antes
 * de empezar a usar Mirai (`prev-AAAA-MM`): queda registrado como gasto pero no paga ningún periodo.
 */
export function periodoPagoAlCrear(f: Partial<FijoInicio>, fpag: string, today: DateInput): string {
  const p = primerPeriodo(f)
  return p && p.due <= iso(toDay(today)) ? p.per : `prev-${fpag.slice(0, 7)}`
}

/**
 * ¿Los pagos "de antes del alta" (`prev-…`) de este fijo son los del periodo `per`? Sí cuando `per` es el primer
 * periodo y ya había vencido el día en que se creó el fijo: así quedaron guardados los fijos creados antes de
 * `periodoPagoAlCrear` (salían vencidos aunque ya estaban pagados).
 */
function prevEsDe(f: Partial<FijoInicio>, per: string): boolean {
  const creado = f.created_at?.slice(0, 10)
  if (!creado) return false
  const p = primerPeriodo(f)
  return !!p && p.per === per && p.due <= creado
}

/**
 * Cómo va un periodo de un fijo con sus pagos (abonos): lo pagado, lo que falta y si quedó completo. Queda completo si
 * un pago lo cierra (`cierra: true`, también "esta vez costó menos"), si lo pagado cubre el valor del periodo, o si el
 * fijo es de valor variable y hay un pago que no es abono. Los pagos de antes (`cierra` vacío) por menos del valor de
 * un fijo de valor fijo cuentan como abono: así se ve lo que falta (la moto: $70.000, pagaste $40.000 → faltan $30.000).
 *
 * `trm` (opcional, al final) pone `esperado` y `falta` **en pesos**, que es la moneda en la que se registran los pagos:
 * sin ella, un Netflix de USD 10 esperaría 10 y cualquier abono lo daría por pagado. Un fijo en pesos da exactamente
 * lo mismo con y sin `trm`.
 */
export function pagoPeriodo(
  f: Pick<FixedExpenseIn, "frec" | "valor" | "variable" | "currency"> & { reparto?: unknown } & Partial<FijoInicio>,
  per: string,
  pagos: FixedPaymentIn[],
  trm?: Trm | null,
) {
  // Un pago guardado como "de antes del alta" (`prev-…`) puede ser en realidad el del primer periodo (ver `prevEsDe`).
  const prev = pagos.some((x) => x.periodo?.startsWith("prev-")) && prevEsDe(f, per)
  const vivos = pagos.filter((x) => (x.periodo === per || (prev && x.periodo?.startsWith("prev-"))) && !x.deleted_at)
  const pagado = vivos.reduce((a, x) => a + (+x.valor || 0), 0)
  const esperado = trm ? fijoValorCOP(f, per, trm) : fijoValor(f, per)
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
 * `trm` (opcional, en pesos si se pasa) convierte `mensual` igual que `fijoMensual`/`fijosMes` y pone `falta` y
 * `esperado` de cada periodo en pesos (la moneda de los pagos), para que el total de la tabla, el KPI del mismo
 * listado y los abonos no se contradigan con un fijo en USD o EUR.
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
      const P = pagoPeriodo(f, p.per, f.payments, trm)
      out.push({ ...p, pago: P.pagos[0], pagos: P.pagos, pagado: P.pagado, falta: P.falta, completo: P.completo, parcial: P.parcial })
    }
  }
  // Pendiente = sin pagar o con abonos y le falta.
  const venc = out.filter((p) => !p.completo && p.due < ti)
  const prox = out.find((p) => !p.completo && p.due >= ti) || null
  return { periods: out, venc, prox, mensual: fijoMensual(f, trm ?? null, t) }
}

export type EstadoFijo = "vencido" | "pronto" | "pendiente" | "pagado" | "luego" | "aldia" | "terminado"

export interface EstadoDeFijo {
  /**
   * vencido: un periodo pasó sin pagarse completo · pronto: lo que toca pagar cae dentro de los días de aviso ·
   * pendiente: el periodo de este mes todavía no llega (o tiene un abono) · pagado: los periodos de este mes ya están
   * pagados y el próximo es más adelante · luego: este mes no le toca (bimestral, anual…) y el próximo está lejos ·
   * aldia: no tiene más periodos · terminado: ya pasó su fecha de fin.
   */
  estado: EstadoFijo
  /** El periodo que toca pagar ahora (el vencido más viejo, el de este mes o uno dentro del aviso). Sin él, no hay botón de pagar. */
  porPagar: FixedPeriodStatus | null
  /** El próximo periodo sin pagar, aunque todavía no toque ("próximo: 5 dic"). */
  proximo: FixedPeriodStatus | null
  vencidos: FixedPeriodStatus[]
  /** Los periodos que caen este mes existen y están todos pagados completos. */
  pagadoMes: boolean
  st: FixedStatus
}

/**
 * Una sola regla para la etiqueta de un gasto fijo y para el botón de pagar (Fijos, Metas, Proveedores). Solo se
 * ofrece pagar lo que toca: lo vencido, lo de este mes o lo que cae dentro de los días de aviso (`aviso` del fijo o
 * `anticipo` del libro). Si lo de este mes ya está pagado, el siguiente no se ofrece hasta que se acerque.
 */
export function estadoFijo(f: FixedExpenseIn & { aviso?: number | null }, today: DateInput, o: { anticipo?: number; trm?: Trm | null } = {}): EstadoDeFijo {
  const st = fijoStatus(f, today, o.trm)
  const ti = iso(toDay(today))
  const mes = ti.slice(0, 7)
  const delMes = st.periods.filter((p) => p.due.startsWith(mes))
  const pagadoMes = delMes.length > 0 && delMes.every((p) => p.completo)
  const aviso = f.aviso ?? o.anticipo ?? 5
  const dias = (d: string) => Math.round((parseDate(d).getTime() - parseDate(ti).getTime()) / 864e5)
  const toca = (p: FixedPeriodStatus) => p.due.startsWith(mes) || p.parcial || dias(p.due) <= aviso
  const proximo = st.prox
  const porPagar = st.venc[0] ?? (proximo && toca(proximo) ? proximo : null)
  const fin = !!f.hasta && f.hasta < ti
  const estado: EstadoFijo = st.venc.length ? "vencido"
    : porPagar ? (dias(porPagar.due) <= aviso ? "pronto" : "pendiente")
    : fin ? "terminado"
    : !proximo ? "aldia"
    : pagadoMes ? "pagado"
    : "luego"
  return { estado, porPagar, proximo, vencidos: st.venc, pagadoMes, st }
}

/**
 * Fin de la quincena en que cae `today` ('YYYY-MM-DD'), con el corte de quincena del libro (`corte_q`, 15 por defecto):
 * del 1 al corte es la 1ª; del día siguiente a fin de mes, la 2ª.
 */
export function finQuincena(today: DateInput, corte = 15): string {
  const t = toDay(today)
  const c = Math.min(Math.max(+corte || 15, 1), 27)
  return iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() <= c ? c : lastDay(t.getFullYear(), t.getMonth())))
}

/**
 * Lo que falta pagar de los periodos que vencen entre `desde` y `hasta` (incluidos), sin los ya pagados completos y,
 * con abonos, solo lo que falta. La moto ($75.000 por quincena, abonaste $40.000 a la 1ª): en la 1ª quincena faltan
 * $35.000; en el mes, $110.000 (los $35.000 más los $75.000 de la 2ª).
 */
export function faltaEntre(periods: FixedPeriodStatus[], desde: string, hasta: string): number {
  return periods.filter((p) => !p.completo && p.due >= desde && p.due <= hasta).reduce((a, p) => a + p.falta, 0)
}

/** Cómo se dice "cada pago" según la frecuencia ("cada quincena", "cada dos meses"…). */
export const CADA_PAGO: Record<string, string> = { mensual: "cada mes", quincenal: "cada quincena", bimestral: "cada dos meses", trimestral: "cada tres meses", semestral: "cada seis meses", anual: "cada año", unico: "una sola vez" }

/**
 * Lo que vale cada pago si `valorMes` es lo de todo el mes: la gasolina de $150.000 al mes, pagada cada quincena, son
 * $75.000 por quincena; el agua de $60.000 al mes, cobrada cada dos meses, son $120.000 por factura. Un pago único no
 * se reparte.
 */
export function valorPorPago(valorMes: number, frec: string): number {
  if (frec === "unico") return valorMes
  const porMes = fijoMensual({ frec, valor: 1 })
  return porMes > 0 ? Math.round(valorMes / porMes) : valorMes
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
 * `opts.trm` compara en pesos los fijos en USD o EUR (el gasto suelto siempre está en pesos); sin ella se compara
 * tal cual, como antes.
 */
export function sugerirPagoFijo(
  g: GastoSuelto,
  fijos: FijoSug[],
  today: DateInput = g.fecha,
  opts: { incluirPagados?: boolean; trm?: Trm | null } = {},
): SugerenciaFijo | null {
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
        const PP = pagoPeriodo(f, p.per, f.payments, opts.trm)
        if (PP.completo && !opts.incluirPagados) continue
        const dist = Math.abs(parseDate(p.due).getTime() - f0.getTime()) / 864e5
        if (dist > 40) continue
        // Sin TRM se compara tal cual (lo de siempre); con TRM, todo en pesos, que es la moneda del gasto suelto.
        const cop = (x: number | null | undefined) => (opts.trm ? conv(x, f.currency, opts.trm) : +(x ?? 0))
        const esperado = PP.parcial ? PP.falta : cop(fijoValor(f, p.per))
        const v = +g.valor
        // Con abonos no se usa el rango del fijo variable: lo que falta es una cifra exacta.
        const okValor = f.variable && +(f.vmin ?? 0) > 0 && !PP.parcial
          ? v >= cop(f.vmin) * 0.85 && v <= cop(f.vmax) * 1.15
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
