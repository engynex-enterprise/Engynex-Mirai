// Bandeja "Todos los gastos": lo que sale de todos los módulos en un solo lugar. Todo sale de `flujoIntegral`, así que
// nada se cuenta dos veces y el total es el mismo «Sale» del Balance. Aquí viven las cifras que la vista muestra
// (resumen, comparación con el periodo anterior, "¿te alcanza?", desgloses, hormigas y el pago de varios a la vez):
// la vista solo las formatea. Puro: sin React ni reloj.
import { addDays, iso, MESL, parseDate } from "./dates"
import { MODULOS, periodo, type FlujoIntegral, type Mov, type Periodo, type PeriodoTipo } from "./flujo-integral"
import { hormigas, liquidez } from "./totals"
import type { BookData, DateInput } from "./types"

/** Periodos de la bandeja: los del Balance más "Próximos 7 días" (hoy y los 6 días que siguen). */
export type TipoBandeja = Exclude<PeriodoTipo, "rango"> | "proximos"

const pad = (n: number) => String(n).padStart(2, "0")
const isoOf = (d: DateInput) => iso(parseDate(d))

/** Rango de la bandeja. `ref` es un día del periodo que se está viendo ('YYYY-MM-DD'); en "proximos" no se usa. */
export function periodoBandeja(b: Pick<BookData, "settings">, tipo: TipoBandeja, ref: string, today: DateInput): Periodo {
  if (tipo === "proximos") { const hoy = parseDate(today); return { a: iso(hoy), b: iso(addDays(hoy, 6)), tipo: "rango" } }
  const [y, m, d] = ref.split("-").map(Number)
  return periodo(b, tipo, y, m - 1, d)
}

/** Mueve el día de referencia `d` periodos (semana de 7 en 7, quincena y mes de a un mes, semestre de a 6, año de a 12). */
export function moverRef(tipo: TipoBandeja, ref: string, d: number): string {
  const x = parseDate(ref)
  if (tipo === "semana" || tipo === "proximos") return iso(addDays(x, d * 7))
  const step = tipo === "anio" ? 12 : tipo === "semestre" ? 6 : 1
  return iso(new Date(x.getFullYear(), x.getMonth() + d * step, 1))
}

/** El periodo de antes, del mismo tipo (la quincena 1 de octubre para la quincena 1 de noviembre). */
export function periodoAnterior(b: Pick<BookData, "settings">, tipo: TipoBandeja, ref: string, today: DateInput): Periodo {
  if (tipo === "proximos") { const hoy = parseDate(today); return { a: iso(addDays(hoy, -7)), b: iso(addDays(hoy, -1)), tipo: "rango" } }
  return periodoBandeja(b, tipo, moverRef(tipo, ref, -1), today)
}

/** Nombre corto del periodo para los textos: "noviembre", "la 1ª quincena de noviembre", "2026"… */
export function nombrePeriodo(tipo: TipoBandeja, P: Periodo): string {
  const a = parseDate(P.a), b = parseDate(P.b)
  const mes = MESL[a.getMonth()]
  switch (tipo) {
    case "mes": return mes
    case "q1": return `la 1ª quincena de ${mes}`
    case "q2": return `la 2ª quincena de ${mes}`
    case "semana": return `la semana del ${a.getDate()} de ${mes}`
    case "semestre": return `el ${a.getMonth() < 6 ? "1er" : "2º"} semestre de ${a.getFullYear()}`
    case "anio": return String(a.getFullYear())
    case "proximos": return "los próximos 7 días"
  }
  return `${a.getDate()} de ${mes} al ${b.getDate()} de ${MESL[b.getMonth()]}`
}

/** Título del periodo para el selector con flechas: "Noviembre de 2026", "Semana del 9 al 15 de noviembre"… */
export function tituloPeriodo(tipo: TipoBandeja, P: Periodo): string {
  const a = parseDate(P.a), b = parseDate(P.b)
  const mesA = MESL[a.getMonth()], cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  switch (tipo) {
    case "mes": return `${cap(mesA)} de ${a.getFullYear()}`
    case "q1": return `1ª quincena de ${mesA} ${a.getFullYear()}`
    case "q2": return `2ª quincena de ${mesA} ${a.getFullYear()}`
    case "semana": return a.getMonth() === b.getMonth() ? `Semana del ${a.getDate()} al ${b.getDate()} de ${mesA}` : `Semana del ${a.getDate()} de ${mesA} al ${b.getDate()} de ${MESL[b.getMonth()]}`
    case "semestre": return `${a.getMonth() < 6 ? "1er" : "2º"} semestre de ${a.getFullYear()}`
    case "anio": return `Año ${a.getFullYear()}`
    case "proximos": return "Próximos 7 días"
  }
  return `${P.a} a ${P.b}`
}

/**
 * Gastos registrados (ids de `expenses`) que son del día a día: los que el flujo deja como "Gastos del día a día".
 * Fuera quedan los que ya tienen su propia pestaña: pagos de fijos, cobros de suscripción (enlazados o con su
 * nombre), compras con tarjeta, cuotas de deudas y aportes a metas. Así "Del día a día" y "Todos" no se contradicen.
 */
export function idsDiaADia(F: Pick<FlujoIntegral, "movs">): Set<string> {
  return new Set(F.movs.filter((m) => m.modulo === "gastos" && m.ref?.tabla === "expenses").map((m) => m.ref!.id))
}

/**
 * Regla directa (sin el flujo) para un gasto recién registrado: ¿es suelto, del día a día? No lo es si es el pago de un
 * fijo, el cobro de una suscripción, una compra con tarjeta, una cuota o un aporte a una meta.
 */
export const esGastoSuelto = (g: { fixed_expense_id?: string | null; subscription_id?: string | null; origen?: string | null }): boolean =>
  !g.fixed_expense_id && !g.subscription_id && !["tarjeta", "prestamo", "aporte"].includes(g.origen ?? "")

/** Lo que la bandeja cuenta como "sale": consumo y deudas (= `tot.sale`). Ahorrar no es gastar: solo si se pide. */
export function movsBandeja(F: Pick<FlujoIntegral, "movs">, conAhorro = false): Mov[] {
  return F.movs.filter((m) => m.dir === "sale" && (m.clase === "gasto" || m.clase === "deuda" || (conAhorro && m.clase === "ahorro")))
}

export interface ResumenBandeja {
  /** Todo lo del periodo (pagado + por pagar). Sin ahorro es igual a `tot.sale`. */
  total: number
  pagado: number
  /** Lo que falta: vencido + lo que viene + lo estimado. */
  porPagar: number
  vencido: number
  /** Lo que todavía no llega (programado y estimado). */
  viene: number
  /** Intereses dentro de las cuotas y los pagos de tarjeta. */
  intereses: number
  n: number
  nPagados: number
  nVencidos: number
  /** Pagos cuya fecha pasó sin registro (Mirai los cuenta como hechos): conviene confirmarlos. */
  nPorConfirmar: number
}

export function resumenBandeja(movs: Mov[]): ResumenBandeja {
  const s = (f: (m: Mov) => boolean) => movs.filter(f).reduce((a, m) => a + m.v, 0)
  return {
    total: s(() => true),
    pagado: s((m) => m.estado === "hecho"),
    porPagar: s((m) => m.estado !== "hecho"),
    vencido: s((m) => m.estado === "vencido"),
    viene: s((m) => m.estado === "programado" || m.estado === "estimado"),
    intereses: movs.reduce((a, m) => a + (m.interes ?? 0), 0),
    n: movs.length,
    nPagados: movs.filter((m) => m.estado === "hecho").length,
    nVencidos: movs.filter((m) => m.estado === "vencido").length,
    nPorConfirmar: movs.filter((m) => m.estado === "hecho" && m.supuesto).length,
  }
}

export interface Cambio {
  ahora: number
  antes: number
  dif: number
  /** Cambio en % frente a lo de antes; null si antes era 0 (no hay con qué comparar). */
  pct: number | null
  dir: "sube" | "baja" | "igual"
}

/** Cuánto cambió una cifra frente al periodo anterior. Menos de $1 o del 0,5 % se toma como igual. */
export function cambio(ahora: number, antes: number): Cambio {
  const dif = ahora - antes
  const pct = antes > 0 ? (dif / antes) * 100 : null
  const igual = Math.abs(dif) < 1 || (pct != null && Math.abs(pct) < 0.5)
  return { ahora, antes, dif, pct, dir: igual ? "igual" : dif > 0 ? "sube" : "baja" }
}

export interface ParteBandeja { k: string; label: string; icon: string; v: number; pct: number; n: number }

/**
 * De dónde sale cada peso de la bandeja, por módulo o por categoría, de mayor a menor. Un desglose siempre suma su
 * total: la suma de las partes es el `total` de `resumenBandeja` de la misma lista.
 */
export function desglose(movs: Mov[], por: "modulo" | "cat"): ParteBandeja[] {
  const m = new Map<string, ParteBandeja>()
  for (const x of movs) {
    const k = por === "modulo" ? x.modulo : x.cat
    const p = m.get(k) ?? { k, label: por === "modulo" ? MODULOS[x.modulo].label : x.cat, icon: por === "modulo" ? MODULOS[x.modulo].icon : x.icon, v: 0, pct: 0, n: 0 }
    p.v += x.v
    p.n++
    m.set(k, p)
  }
  const tot = movs.reduce((a, x) => a + x.v, 0)
  return [...m.values()].map((p) => ({ ...p, pct: tot ? p.v / tot : 0 })).sort((p, q) => q.v - p.v)
}

/**
 * Gastos hormiga del periodo (ids de `expenses`), con la misma regla de Inicio, Gastos y los avisos (`hormigas`): por
 * monto pequeño, palabra clave o porque se repite. Se calcula mes a mes para los periodos largos.
 */
export function idsHormiga(b: Pick<BookData, "expenses" | "categories" | "settings">, today: DateInput, P: Periodo): Set<string> {
  const out = new Set<string>()
  const a = parseDate(P.a)
  for (let d = new Date(a.getFullYear(), a.getMonth(), 1); iso(d) <= P.b; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
    for (const g of hormigas(b, today, k).mes) if (g.fecha >= P.a && g.fecha <= P.b) out.add(g.id)
  }
  return out
}

export interface TeAlcanza {
  /**
   * "alcanza": te sobra; "justo": te sobra menos del 10 % de lo que debes pagar; "falta": no te alcanza;
   * "sin-cuentas": no hay cuentas registradas (no sabemos cuánto tienes); "no-aplica": el periodo ya pasó.
   */
  estado: "alcanza" | "justo" | "falta" | "sin-cuentas" | "no-aplica"
  /** Plata disponible hoy en tus cuentas y efectivo (la misma «Disponible ya» del Balance). */
  disponible: number
  /** Lo que te falta recibir en el periodo (ingresos y cobros que aún no llegan; sin préstamos que te den). */
  porEntrar: number
  /** Lo que te falta pagar en el periodo (vencido + lo que viene + lo estimado). */
  porPagar: number
  /** Parte de `porPagar` que es lo que te queda por gastar según tu presupuesto (mercado, transporte…: estimado). */
  presupuesto: number
  /** Lo que tienes programado para ahorrar y aún no apartas. */
  ahorro: number
  /** disponible + porEntrar − porPagar − ahorro. */
  queda: number
}

/**
 * ¿Te alcanza para lo que falta pagar? Solo para el periodo de hoy o uno que viene: la plata que tienes hoy, más lo que
 * te falta recibir, menos lo que te falta pagar y apartar. Lo que debía entrarte y no llegó (vencido) no se cuenta:
 * no es seguro. Tampoco la plata de un préstamo: no es tuya.
 */
export function teAlcanza(b: Pick<BookData, "assets" | "investments" | "settings">, F: Pick<FlujoIntegral, "movs" | "b">, today: DateInput): TeAlcanza {
  const hoy = isoOf(today)
  const s = (f: (m: Mov) => boolean) => F.movs.filter(f).reduce((a, m) => a + m.v, 0)
  const pend = (m: Mov) => m.estado === "programado" || m.estado === "estimado"
  const porEntrar = s((m) => m.dir === "entra" && (m.clase === "ingreso" || m.clase === "cobro") && pend(m))
  const porPagar = s((m) => m.dir === "sale" && (m.clase === "gasto" || m.clase === "deuda") && m.estado !== "hecho")
  const presupuesto = s((m) => m.modulo === "presupuesto" && m.estado !== "hecho")
  const ahorro = s((m) => m.dir === "sale" && m.clase === "ahorro" && m.estado !== "hecho")
  const hayCuentas = b.assets.some((a) => /^11/.test(String(a.cod)))
  const disponible = hayCuentas ? liquidez(b.assets, b.investments, b.settings.trm, today) : 0
  const queda = disponible + porEntrar - porPagar - ahorro
  const estado: TeAlcanza["estado"] = F.b < hoy ? "no-aplica" : !hayCuentas ? "sin-cuentas" : queda < 0 ? "falta" : queda < porPagar * 0.1 ? "justo" : "alcanza"
  return { estado, disponible, porEntrar, porPagar, presupuesto, ahorro, queda }
}

export type TipoPago = "fijo" | "suscripcion" | "tarjeta" | "prestamo"

export interface PagoLote {
  tipo: TipoPago
  /** Id del registro dueño (fijo, suscripción, tarjeta o préstamo). */
  id: string
  /** Periodo del gasto fijo ('YYYY-MM', 'YYYY-MM-Q1'…). */
  per?: string
  /** Lo que se registra como pagado, en pesos (lo que falta del pago). */
  valor: number
  /** Préstamos: cuántas cuotas (las seleccionadas de un mismo préstamo van juntas). */
  cuotas?: number
  movs: Mov[]
}

export interface PlanLote {
  pagar: PagoLote[]
  omitidos: { mov: Mov; razon: string }[]
  /** Lo que suma lo que se va a registrar. */
  total: number
}

const TIPO: Record<string, TipoPago> = { fixed_expenses: "fijo", subscriptions: "suscripcion", credit_cards: "tarjeta", loans: "prestamo" }

/** ¿Este movimiento se puede pagar (o confirmar) desde la bandeja? */
export const sePuedePagar = (m: Mov): boolean => (m.estado !== "hecho" || !!m.supuesto) && !!m.ref && m.ref.tabla in TIPO

/**
 * Qué se registra al pagar varios a la vez: cada fila con su valor (lo que falta), las cuotas de un mismo préstamo
 * juntas, y lo que no se puede pagar desde aquí aparte con su razón (ya pagado, un gasto ya registrado, el
 * presupuesto, un impuesto o una mesada, que se registran en su sección). Lo que Mirai da por pagado porque pasó su
 * fecha ("Ya pasó") tampoco: se confirma uno por uno.
 */
export function planPagoLote(movs: Mov[]): PlanLote {
  const pagar: PagoLote[] = []
  const omitidos: PlanLote["omitidos"] = []
  const prestamos = new Map<string, PagoLote>()
  for (const m of movs) {
    if (m.estado === "hecho" && !m.supuesto) { omitidos.push({ mov: m, razon: "Ya está pagado" }); continue }
    // Su fecha pasó y Mirai lo da por pagado: confirmarlo es una decisión de cada uno (registrarlo dos veces sumaría de más).
    if (m.supuesto) { omitidos.push({ mov: m, razon: "Por confirmar: confírmalo desde su fila" }); continue }
    if (!m.ref || !(m.ref.tabla in TIPO)) {
      omitidos.push({ mov: m, razon: m.ref?.tabla === "expenses" ? "Ya es un gasto registrado" : m.modulo === "presupuesto" ? "Es un estimado de tu presupuesto, no un pago" : `Se registra en ${MODULOS[m.modulo].label}` })
      continue
    }
    const tipo = TIPO[m.ref.tabla]
    if (tipo === "prestamo") {
      const p = prestamos.get(m.ref.id) ?? { tipo, id: m.ref.id, valor: 0, cuotas: 0, movs: [] }
      p.valor += m.v
      p.cuotas = (p.cuotas ?? 0) + 1
      p.movs.push(m)
      if (!prestamos.has(m.ref.id)) { prestamos.set(m.ref.id, p); pagar.push(p) }
      continue
    }
    if (tipo === "fijo" && !m.ref.per) { omitidos.push({ mov: m, razon: "No sabemos de qué mes o quincena es: págalo desde su fila" }); continue }
    pagar.push({ tipo, id: m.ref.id, per: m.ref.per, valor: Math.round(m.v), movs: [m] })
  }
  return { pagar, omitidos, total: pagar.reduce((a, p) => a + p.valor, 0) }
}

const fmtCOP = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n)

/**
 * Archivo .ics (Google Calendar, Outlook, el calendario del celular) con un pago de la bandeja y una alarma
 * `diasAntes` días antes a las 8 a. m. (0 = el mismo día).
 */
export function icsDeMov(m: Pick<Mov, "id" | "fecha" | "n" | "v" | "modulo">, diasAntes: number): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, " ")
  const d = (s: string) => s.replace(/-/g, "")
  const next = iso(addDays(parseDate(m.fecha), 1))
  const trigger = diasAntes > 0 ? `-P${diasAntes}DT16H` : "PT8H"
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mirai//Finanzas//ES", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${m.id.replace(/[^a-zA-Z0-9:-]/g, "")}@mirai`, `DTSTART;VALUE=DATE:${d(m.fecha)}`, `DTEND;VALUE=DATE:${d(next)}`,
    `SUMMARY:${esc(`Pagar: ${m.n} (${fmtCOP(m.v)})`)}`, `DESCRIPTION:${esc(`${MODULOS[m.modulo].label} - Mirai`)}`,
    "BEGIN:VALARM", `TRIGGER:${trigger}`, "ACTION:DISPLAY", `DESCRIPTION:${esc(`Pagar ${m.n}`)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n")
}
