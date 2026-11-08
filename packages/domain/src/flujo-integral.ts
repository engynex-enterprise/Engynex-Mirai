// Flujo integral: TODAS las entradas y salidas del libro en un periodo (de todos los módulos), sin contar nada dos
// veces, y el estado de lo que tienes y lo que debes. Lo usan Balance y Dashboard. Puro: sin React, Supabase ni reloj.
//
// Reglas para no contar dos veces (cada peso sale UNA sola vez):
// 1. Un gasto ligado a un gasto fijo (`fixed_expense_id`, también los aportes `origen="aporte"`) no sale como gasto:
//    sale el pago del fijo (con el valor y la fecha en que se pagó).
// 2. Tarjeta de crédito, base CAJA: la plata sale de tu bolsillo cuando pagas la tarjeta, no cuando compras.
//    Por eso las compras con tarjeta (`origen="tarjeta"`) NO salen en el flujo; sale el pago del mes de cada tarjeta
//    (las cuotas de sus compras, `tarjetaPagoMes`). Las compras sí cuentan en "en qué se va la plata" (`porCategoria`)
//    y contra el presupuesto, porque ahí importa en qué gastaste, no cuándo pagaste.
// 3. Una cuota de préstamo registrada también como gasto (`origen="prestamo"`) no sale como gasto: sale la cuota del
//    plan del préstamo (`loanEngine`), con su parte de intereses.
// 4. El cobro de una suscripción registrado con "Ya se cobró" crea un gasto con el nombre de la suscripción: ese gasto
//    se empareja con el cobro del mismo mes (por nombre o proveedor) y cuenta una vez, como cobro hecho.
// 5. Usar el fondo de emergencia crea un gasto (cuenta como gasto) y saca plata del ahorro (entra como retiro de
//    ahorro); guardar en el fondo con un aporte programado ya sale como el pago de ese fijo.
// 6. Un impuesto del calendario sin valor que también es un gasto fijo (p. ej. "Predial" anual) no se estima dos veces.
// 8. Un abono directo a una meta (`goal_movements`) es ahorro; el aporte programado ya sale como el pago de su fijo.
// 7. El presupuesto "Por gastar" solo cubre lo que falta del periodo: tope − lo que ya gastaste en esas categorías.
//
// Fechas: ingresos por su fecha real de pago (`incomePagos`), cuotas por la fecha del plan (las pagadas, en la fecha
// en que se pagaron), fijos y suscripciones por su día de cobro, impuestos por la fecha del calendario.
// Estados: hecho (registrado o ya pasó), programado (viene), vencido (pasó sin registrar el pago), estimado (cálculo).
import { addMonths, fdate, iso, lastDay, parseDate, toDay } from "./dates"
import { cuentaEnVariable, gastoYaContado } from "./balance"
import { deudaTarjeta, tarjetaFlujoMes } from "./cards"
import { ahorroApartado, type GoalMovIn, type LibroCuentas } from "./cuentas"
import { fijoPeriods, pagoPeriodo } from "./fixed"
import { inv } from "./investments"
import { loanEngine, loanName } from "./loans"
import { loanTipo, tipoDef, type LoanTipo } from "./loan-tipos"
import { conv, formatCOP as fmtCOP } from "./money"
import { catIcon } from "./quincena"
import { fijoValor, incomePagos } from "./reparto"
import { gastoDeCobro, subOcc } from "./subscriptions"
import { fixedCategoryIds, liquidez, totales, variableMes, type Totales } from "./totals"
import type { BookData, DateInput, ExpenseIn } from "./types"

export type Modulo =
  | "ingresos" | "gastos" | "fijos" | "suscripciones" | "tarjetas" | "le-debo" | "me-deben"
  | "impuestos" | "calendario" | "metas" | "inversiones" | "mesadas" | "presupuesto"

/** Nombre, ícono y sección de cada módulo (en el orden en que se muestran). */
export const MODULOS: Record<Modulo, { label: string; icon: string; href: string }> = {
  ingresos: { label: "Ingresos", icon: "arrow-down-to-line", href: "/ingresos" },
  "me-deben": { label: "Me deben", icon: "hand-coins", href: "/me-deben" },
  gastos: { label: "Gastos del día a día", icon: "receipt", href: "/gastos" },
  fijos: { label: "Gastos fijos", icon: "house", href: "/fijos" },
  suscripciones: { label: "Suscripciones", icon: "repeat", href: "/suscripciones" },
  tarjetas: { label: "Tarjetas de crédito", icon: "credit-card", href: "/tarjetas" },
  "le-debo": { label: "Deudas (Le debo)", icon: "landmark", href: "/le-debo" },
  impuestos: { label: "Impuestos", icon: "file-check", href: "/calendario" },
  calendario: { label: "Fechas del calendario", icon: "calendar", href: "/calendario" },
  mesadas: { label: "Mesadas", icon: "baby", href: "/mesadas" },
  metas: { label: "Metas y fondo de emergencia", icon: "piggy-bank", href: "/metas" },
  inversiones: { label: "Inversiones", icon: "trending-up", href: "/inversiones" },
  presupuesto: { label: "Por gastar (presupuesto)", icon: "shopping-cart", href: "/presupuesto" },
}
export const MODULO_ORDEN = Object.keys(MODULOS) as Modulo[]

/**
 * Para qué es la plata: ingreso (sueldo, extras), cobro (te pagan un préstamo), credito (te prestaron o prestaste),
 * gasto (consumo: gastos, fijos, suscripciones, impuestos, mesadas), deuda (cuotas, abonos, pago de tarjeta) y
 * ahorro (aportes a metas, fondo de emergencia e inversiones; distinto de gastar).
 */
export type Clase = "ingreso" | "cobro" | "credito" | "gasto" | "deuda" | "ahorro"
export type Estado = "hecho" | "programado" | "vencido" | "estimado"

export const ESTADOS: Record<Estado, { label: string; hint: string }> = {
  hecho: { label: "Hecho", hint: "Ya está registrado como pagado o recibido, o su fecha ya pasó." },
  programado: { label: "Programado", hint: "Todavía no llega su fecha." },
  vencido: { label: "Vencido", hint: "Su fecha ya pasó y no está registrado el pago." },
  estimado: { label: "Estimado", hint: "Mirai lo calculó con tus datos: puede cambiar." },
}

export interface Mov {
  /** Id estable (módulo, registro y periodo). */
  id: string
  dir: "entra" | "sale"
  modulo: Modulo
  clase: Clase
  /** 'YYYY-MM-DD' */
  fecha: string
  n: string
  s: string
  icon: string
  /** Valor en COP. */
  v: number
  /** Categoría en palabras ("Mercado", "Ingresos", "Impuestos"…). */
  cat: string
  catId?: string | null
  estado: Estado
  /** Pasó sin que Mirai tenga cómo saber si se pagó (sueldo, suscripción, pago de tarjeta): se supone hecho. */
  supuesto?: boolean
  href: string
  /** Parte de intereses (cuotas de deudas y pago de tarjetas). */
  interes?: number
}

/** Datos que no están en `BookData` y que la vista carga aparte (todos opcionales). */
export interface ExtrasIntegral {
  /** Valor estimado de las fechas del calendario sin monto (impuestos), por id del evento. */
  estimados?: Record<string, { v: number; how?: string }>
  /** Mesadas: lo que se le da a cada hijo (movimientos positivos) y la mesada pactada. */
  mesadas?: { id: string; nombre: string; mesada: number; frec: string; movs: { fecha: string; valor: number }[] }[]
  /** Movimientos del fondo de emergencia. */
  fondo?: { fecha: string; valor: number; tipo: string; expense_id?: string | null }[]
  /** Abonos y retiros directos de metas (si no vienen, se leen de `goalMovements` del libro). */
  metas?: GoalMovIn[]
}

export type PeriodoTipo = "q1" | "q2" | "mes" | "anio" | "rango"
export interface Periodo { a: string; b: string; tipo: PeriodoTipo }

const pad = (n: number) => String(n).padStart(2, "0")
const corteDe = (b: Pick<BookData, "settings">) => Math.min(Math.max(+b.settings.corte_q || 15, 1), 27)

/** Rango de un periodo: quincena, mes (m en base 0) o año, con el corte de quincena del libro. */
export function periodo(b: Pick<BookData, "settings">, tipo: Exclude<PeriodoTipo, "rango">, y: number, m = 0): Periodo {
  if (tipo === "anio") return { a: `${y}-01-01`, b: `${y}-12-31`, tipo }
  const cq = corteDe(b)
  const ld = lastDay(y, m)
  const k = `${y}-${pad(m + 1)}`
  if (tipo === "q1") return { a: `${k}-01`, b: `${k}-${pad(cq)}`, tipo }
  if (tipo === "q2") return { a: `${k}-${pad(cq + 1)}`, b: `${k}-${pad(ld)}`, tipo }
  return { a: `${k}-01`, b: `${k}-${pad(ld)}`, tipo }
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()
const isoOf = (d: DateInput) => iso(toDay(d))
const ym = (f: string) => f.slice(0, 7)
const monthStart = (f: string | null | undefined) => (f ? `${f.slice(0, 7)}-01` : "")
type Raw = { created_at?: string | null; currency?: string | null; provider_id?: string | null; category_id?: string | null; origen?: string | null }
const raw = (x: unknown) => x as Raw

/** ¿La fecha del calendario es un impuesto (renta, predial, vehicular…)? El SOAT y la técnico-mecánica no lo son. */
export const esImpuesto = (c: { titulo: string; template_key?: string | null; cat?: string | null }) =>
  /^(renta|activos|pred_|veh_)/.test(c.template_key ?? "") || c.cat === "dian" || /renta|dian|predial|vehicular|impuesto|\bica\b|retenci/i.test(c.titulo)
/** Impuestos que ya debes aunque no hayan vencido (renta del año pasado, predial y vehicular del año). */
const esImpuestoCausado = (c: { titulo: string; template_key?: string | null }) => /^(renta|pred_|veh_)/.test(c.template_key ?? "") || /renta|predial|vehicular/i.test(c.titulo)
const PALABRA_IMP = /predial|vehicular|soat|renta|t[eé]cnico/i

/** Tipos de deuda en que te entregan plata (te prestaron dinero): su desembolso entra. Fiado y compras a cuotas no. */
const TIPOS_DESEMBOLSO_PAGAR: LoanTipo[] = ["banco", "empeno", "persona", "gota"]

type CalRow = BookData["calendarEvents"][number] & { anual?: boolean | null; template_key?: string | null; cat?: string | null }

/** Fechas de un evento del calendario entre `a` y `b`: anual → cada año desde su año; si no, su fecha. */
function calOcc(c: CalRow, a: string, b: string): string[] {
  const f = isoOf(c.fecha)
  if (!c.anual) return f >= a && f <= b ? [f] : []
  const out: string[] = []
  const md = f.slice(5)
  for (let y = Math.max(+a.slice(0, 4), +f.slice(0, 4)); y <= +b.slice(0, 4); y++) {
    const [mm, dd] = md.split("-").map(Number)
    const d = iso(new Date(y, mm - 1, Math.min(dd, lastDay(y, mm - 1))))
    if (d >= a && d <= b) out.push(d)
  }
  return out
}

export interface GrupoModulo {
  modulo: Modulo
  label: string
  icon: string
  href: string
  entra: number
  sale: number
  n: number
  /** Por categoría dentro del módulo, de mayor a menor. */
  cats: { cat: string; v: number; n: number }[]
}

export interface CategoriaGasto { cat: string; catId?: string | null; icon: string; v: number; pct: number }

export interface FlujoIntegral extends Periodo {
  momento: "pasado" | "actual" | "futuro"
  movs: Mov[]
  ent: Mov[]
  sal: Mov[]
  tot: {
    /** Lo que entra (ingresos, cobros y préstamos que te dieron), sin contar retiros de tu ahorro. */
    entra: number
    /** Consumo: gastos, fijos, suscripciones, impuestos, mesadas y préstamos que hiciste. */
    gasto: number
    /** Cuotas, abonos y pagos de tarjeta. */
    deuda: number
    /** Lo que sale para pagar o gastar (gasto + deuda). */
    sale: number
    /** Ahorro neto: aportes, fondo e inversiones menos lo que sacaste del fondo. */
    ahorro: number
    /** entra − sale − ahorro (sin préstamos: lo que te sobra de verdad). */
    queda: number
    /** Plata en mano: `queda` + lo que te prestaron − lo que prestaste. */
    caja: number
    /** Intereses dentro de las cuotas y pagos de tarjeta. */
    intereses: number
    /** Préstamos que te dieron y que hiciste: plata prestada, no ingreso ni consumo (NO están en `entra` ni en `gasto`). */
    credEntra: number
    credSale: number
    pendienteEntra: number
    pendienteSale: number
    vencidoEntra: number
    vencidoSale: number
    nVencidos: number
  }
  porModulo: GrupoModulo[]
  /** En qué se va la plata (consumo): gastos por categoría, con las compras con tarjeta y sin cuotas de deudas. */
  porCategoria: CategoriaGasto[]
  /** Impuestos del calendario del periodo que no tienen valor ni cómo estimarse. */
  sinValor: { id: string; titulo: string; fecha: string }[]
  // Campos compatibles con QuincenaBalance (Tu mes y los hallazgos del Balance).
  E: number
  Sa: number
  disp: number
  gastado: number
  nGastos: number
  /** Gasto contra el presupuesto (categorías variables): lo registrado + lo comprado con tarjeta (la base de porGastar). */
  gastadoPres: number
  /** Compras con tarjeta del periodo: aún no salen de tu cuenta, pero la tarjeta te las cobrará. */
  conTarjetaPer: number
  presupuesto: number
  porGastar: number
}

/**
 * Todas las entradas y salidas del libro entre `P.a` y `P.b` (incluidos). Ver las reglas arriba del archivo.
 * `X` trae lo que no viaja en `BookData` (estimados de impuestos, mesadas y fondo de emergencia).
 */
export function flujoIntegral(b: BookData, P: Periodo, today: DateInput, X: ExtrasIntegral = {}): FlujoIntegral {
  const hoy = isoOf(today)
  const trm = b.settings.trm
  const inR = (d: string) => d >= P.a && d <= P.b
  const movs: Mov[] = []
  const seen = new Set<string>()
  const push = (m: Mov) => {
    if (!inR(m.fecha) || !(m.v > 0) || seen.has(m.id)) return
    seen.add(m.id)
    movs.push(m)
  }
  const catName = (id: string | null | undefined) => (id && b.categories.find((c) => c.id === id)?.nombre) || "Sin categoría"
  /** Sin registro de pago (sueldo, suscripción, tarjeta): si ya pasó, se supone hecho. */
  const sinRegistro = (fecha: string): Pick<Mov, "estado" | "supuesto"> => (fecha <= hoy ? { estado: "hecho", supuesto: true } : { estado: "programado" })
  /** Con registro de pago (fijo, cuota): si ya pasó sin pago, vencido. */
  const conRegistro = (fecha: string, pagado: boolean): Estado => (pagado ? "hecho" : fecha < hoy ? "vencido" : "programado")

  // Meses que tocan el periodo, con uno de margen a cada lado (pagos hechos antes o después de su periodo).
  const meses: [number, number][] = []
  for (let d = addMonths(parseDate(monthStart(P.a)), -1), fin = addMonths(parseDate(monthStart(P.b)), 1); d <= fin; d = addMonths(d, 1)) meses.push([d.getFullYear(), d.getMonth()])

  // 1. Ingresos por su fecha real de pago (desde el mes en que se registraron, si se sabe).
  for (const x of b.incomes) {
    const desde = monthStart(raw(x).created_at)
    for (const [y, m] of meses)
      for (const p of incomePagos(x, y, m)) {
        if (desde && p.fecha < desde) continue
        push({
          id: `ing:${x.id}:${p.fecha}:${p.parte ?? ""}`, dir: "entra", modulo: "ingresos", clase: "ingreso", fecha: p.fecha, n: x.concepto,
          s: x.frec === "diario" ? `${p.dias} días de pago` : x.frec === "quincenal" ? "Ingreso de la quincena" : x.frec === "semanal" ? "Pago semanal" : x.frec === "anual" ? "Ingreso anual" : "Ingreso del mes",
          icon: "briefcase", v: conv(p.v, x.currency, trm), cat: "Ingresos", ...sinRegistro(p.fecha), href: "/ingresos",
        })
      }
  }
  for (const x of b.extraIncomes) {
    const f = isoOf(x.fecha)
    push({ id: `ext:${x.id ?? `${f}:${x.descripcion}`}`, dir: "entra", modulo: "ingresos", clase: "ingreso", fecha: f, n: x.descripcion, s: "Ingreso extra", icon: "coins", v: conv(+x.valor, raw(x).currency, trm), cat: "Ingresos extra", estado: "hecho", href: "/ingresos" })
  }

  // 2. Préstamos: cuotas por la fecha del plan (las pagadas, cuando se pagaron), abonos y el desembolso.
  for (const L of b.loans) {
    const e = loanEngine(L, today)
    const nm = loanName(L as never, b.contacts, b.entities)
    const tipo = loanTipo(L as never)
    const td = tipoDef(tipo)
    const cobrar = L.kind === "cobrar"
    const base = cobrar
      ? { dir: "entra" as const, modulo: "me-deben" as const, clase: "cobro" as const, icon: "hand-coins", href: "/me-deben", cat: "Te pagan préstamos" }
      : { dir: "sale" as const, modulo: "le-debo" as const, clase: "deuda" as const, icon: td?.icon ?? "landmark", href: "/le-debo", cat: td?.corto ?? "Deudas" }
    const det = L.concepto ? ` · ${L.concepto}` : ""
    for (const h of e.hist) {
      if (h.tipo === "cuota") push({ ...base, id: `loan:${L.id}:c${h.n}`, fecha: h.fecha, n: `Cuota ${h.n} · ${nm}`, s: (cobrar ? "Te pagaron" : "Pagaste") + det, v: h.valor, estado: "hecho", interes: cobrar ? undefined : h.int })
      else push({ ...base, id: `loan:${L.id}:a${h.id ?? h.fecha}`, fecha: h.fecha, n: cobrar ? `Abono de ${nm}` : `Abono a ${nm}`, s: "Abono a capital" + det, v: h.valor, estado: "hecho" })
    }
    for (const r of e.plan) {
      if (r.fecha > P.b) break
      push({ ...base, id: `loan:${L.id}:c${r.n}`, fecha: r.fecha, n: `Cuota ${r.n} · ${nm}`, s: (cobrar ? "Te pagan" : "Crédito") + det, v: r.valor, estado: conRegistro(r.fecha, false), interes: cobrar ? undefined : r.int })
    }
    const ini = L.inicio ? isoOf(L.inicio) : ""
    if (ini && +L.monto > 0) {
      const st = ini <= hoy ? ("hecho" as const) : ("programado" as const)
      if (!cobrar && TIPOS_DESEMBOLSO_PAGAR.includes(tipo))
        push({ id: `loan:${L.id}:desembolso`, dir: "entra", modulo: "le-debo", clase: "credito", fecha: ini, n: `Te prestaron · ${nm}`, s: (td?.corto ?? "Préstamo") + det, icon: td?.icon ?? "landmark", v: +L.monto, cat: "Préstamos que recibiste", estado: st, href: "/le-debo" })
      if (cobrar && tipo === "presto")
        push({ id: `loan:${L.id}:desembolso`, dir: "sale", modulo: "me-deben", clase: "credito", fecha: ini, n: `Le prestaste a ${nm}`, s: "Préstamo" + det, icon: "hand-coins", v: +L.monto, cat: "Préstamos que hiciste", estado: st, href: "/me-deben" })
    }
  }

  // 3. Gastos fijos y aportes programados (metas y fondo de emergencia).
  for (const f of b.fixedExpenses) {
    const ini = f.inicio ? isoOf(f.inicio) : ""
    // Sin "desde" ni "inicio" (fijos viejos): desde el mes en que se registró, como los ingresos (no salen vencidos
    // los meses antes de usar Mirai).
    const desde = f.desde ? `${f.desde.slice(0, 7)}-01` : ini ? "" : monthStart(raw(f).created_at)
    const aporte = !!f.link_type
    const cur = raw(f).currency
    for (const [y, m] of meses)
      for (const p of fijoPeriods(f, y, m, today)) {
        if ((ini && p.due < ini) || (desde && p.due < desde)) continue
        // Abonos: lo pagado sale como hecho (en la fecha del último pago) y, si falta, lo que falta sale aparte
        // (programado o vencido). La moto: $70.000 la quincena, pagaste $40.000 → $40.000 hecho y $30.000 por pagar.
        const PP = pagoPeriodo(f, p.per, f.payments)
        const ult = PP.pagos.reduce<string>((a, x) => (x.fecha && isoOf(x.fecha) > a ? isoOf(x.fecha) : a), "")
        const tipo = aporte
          ? { modulo: "metas" as const, clase: "ahorro" as const, n: f.nombre, s: f.link_type === "fondo" ? "Aporte al fondo de emergencia" : "Aporte a una meta", icon: "piggy-bank", cat: "Ahorro programado", href: "/metas" }
          : { modulo: "fijos" as const, clase: "gasto" as const, n: f.nombre, s: "Gasto fijo", icon: catIcon(b.categories, f.category_id), cat: f.category_id ? catName(f.category_id) : "Gastos fijos", catId: f.category_id ?? null, href: "/fijos" }
        if (PP.pagos.length) {
          const fecha = ult || p.due
          push({ id: `fijo:${f.id}:${p.per}`, dir: "sale", fecha, estado: "hecho", v: PP.pagado, ...tipo, ...(PP.parcial ? { s: `${tipo.s} · abono` } : {}) })
          if (PP.parcial && PP.falta > 0.5)
            push({ id: `fijo:${f.id}:${p.per}:falta`, dir: "sale", fecha: p.due, estado: conRegistro(p.due, false), v: conv(PP.falta, cur, trm), ...tipo, s: `Falta de ${f.nombre} (ya abonaste ${fmtCOP(PP.pagado)})` })
        } else {
          push({ id: `fijo:${f.id}:${p.per}`, dir: "sale", fecha: p.due, estado: conRegistro(p.due, false), v: conv(fijoValor(f, p.per), cur, trm), ...tipo })
        }
      }
  }

  // 4. Suscripciones por su día de cobro; el gasto de "Ya se cobró" del mismo mes se empareja con el cobro.
  const usados = new Set<string>()
  const expRows = b.expenses as (ExpenseIn & Raw)[]
  for (const s of b.subscriptions) {
    const desde = monthStart(raw(s).created_at)
    const parte = +(s.comparte ?? 0) > 1 ? +(s.comparte as number) : 1
    const prov = raw(s).provider_id
    const sCat = raw(s).category_id
    for (const [y, m] of meses) {
      const a = new Date(y, m, 1), bb = new Date(y, m, lastDay(y, m))
      for (const d of subOcc(s, a, bb)) {
        const fecha = iso(d)
        if (desde && fecha < desde) continue
        const g = gastoDeCobro({ id: s.id, nombre: s.nombre, provider_id: prov }, expRows, ym(fecha), usados, (x) => !gastoYaContado(x))
        if (g) usados.add(g.id)
        const base = { id: `sub:${s.id}:${ym(fecha)}`, dir: "sale" as const, modulo: "suscripciones" as const, clase: "gasto" as const, n: s.nombre, icon: "repeat", cat: sCat ? catName(sCat) : "Suscripciones", catId: sCat ?? null, href: "/suscripciones" }
        if (g) push({ ...base, fecha: g.fecha, s: "Suscripción · ya se cobró", v: conv(+g.valor, g.currency, trm), estado: "hecho" })
        else push({ ...base, fecha, s: s.ciclo === "anual" ? "Suscripción anual" : "Suscripción", v: conv(s.valor, s.currency, trm) / parte, ...sinRegistro(fecha) })
      }
    }
  }

  // 5. Tarjetas: el pago del mes (cuotas de sus compras) en el día de pago. Sus compras no salen aparte (regla 2).
  //    Si registraste pagos de la tarjeta ese mes (card_payments), salen esos pagos con su fecha y valor (lo real).
  for (const t of b.creditCards) {
    const base = { dir: "sale" as const, modulo: "tarjetas" as const, clase: "deuda" as const, n: `Tarjeta ${t.nombre}`, icon: "credit-card", cat: "Tarjetas de crédito", href: "/tarjetas" }
    for (const [y, m] of meses) {
      const fecha = iso(new Date(y, m, Math.min(+t.pago || 15, lastDay(y, m))))
      const fm = tarjetaFlujoMes(t, y, m, today)
      fm.pagos.forEach((p, ix) => push({ ...base, id: `card:${t.id}:pago:${p.id ?? `${p.fecha}:${ix}`}`, fecha: isoOf(p.fecha), s: p.tipo === "total" ? "Pagaste el total de la tarjeta" : "Pagaste la tarjeta", v: +p.valor, estado: "hecho", interes: ix ? 0 : Math.min(fm.interes, +p.valor) }))
      if (!fm.pagos.length && inR(fecha)) push({ ...base, id: `card:${t.id}:${ym(fecha)}`, fecha, s: "Pago del mes (cuotas de tus compras)", v: fm.estimado, ...sinRegistro(fecha), interes: fm.interes })
    }
  }

  // 6. Gastos registrados que no salen ya por otro lado (reglas 1 a 4).
  const contados: (ExpenseIn & Raw)[] = []
  const conTarjeta: (ExpenseIn & Raw)[] = []
  for (const g of expRows) {
    if (!inR(g.fecha)) continue
    if (g.origen === "tarjeta") { conTarjeta.push(g); continue }
    if (gastoYaContado(g) || g.origen === "aporte" || usados.has(g.id)) continue
    contados.push(g)
    const cat = catName(g.category_id)
    push({ id: `exp:${g.id}`, dir: "sale", modulo: "gastos", clase: "gasto", fecha: g.fecha, n: g.descripcion, s: g.origen === "compartido" ? `Gasto compartido · ${cat}` : `Gasto · ${cat}`, icon: catIcon(b.categories, g.category_id), v: conv(+g.valor, g.currency, trm), cat, catId: g.category_id ?? null, estado: "hecho", href: "/gastos" })
  }

  // 7. Calendario: ingresos con valor; egresos con valor o, si es un impuesto, con su estimado.
  const sinValor: FlujoIntegral["sinValor"] = []
  for (const c of b.calendarEvents as CalRow[]) {
    const imp = esImpuesto(c)
    for (const fecha of calOcc(c, P.a, P.b)) {
      const monto = +c.monto || 0
      if (c.tipo === "ingreso") {
        if (monto > 0) push({ id: `cal:${c.id}:${fecha}`, dir: "entra", modulo: "calendario", clase: "ingreso", fecha, n: c.titulo, s: "Fecha del calendario", icon: "calendar", v: monto, cat: /prima|cesant/i.test(c.titulo) ? "Primas y cesantías" : "Otros ingresos", ...sinRegistro(fecha), href: "/calendario" })
        continue
      }
      const est = monto > 0 ? 0 : imp ? +(X.estimados?.[c.id]?.v ?? 0) : 0
      const kw = c.titulo.match(PALABRA_IMP)?.[0]
      // Regla 6: si ya es un gasto fijo (p. ej. "Predial" anual), no se estima otra vez.
      if (!monto && kw && b.fixedExpenses.some((f) => norm(f.nombre).includes(norm(kw)))) continue
      const v = monto || est
      if (!v) { if (imp) sinValor.push({ id: c.id, titulo: c.titulo, fecha }); continue }
      push({
        id: `cal:${c.id}:${fecha}`, dir: "sale", modulo: imp ? "impuestos" : "calendario", clase: "gasto", fecha, n: c.titulo,
        s: monto ? (imp ? "Impuesto" : "Fecha del calendario") : `Estimado${X.estimados?.[c.id]?.how ? ` · ${X.estimados[c.id].how}` : ""}`,
        icon: imp ? "file-check" : "calendar", v, cat: imp ? "Impuestos" : "Fechas del calendario",
        ...(monto ? sinRegistro(fecha) : fecha <= hoy ? { estado: "hecho" as const, supuesto: true } : { estado: "estimado" as const }),
        href: /renta/i.test(c.titulo) && !monto ? "/renta" : "/calendario",
      })
    }
  }

  // 8. Mesadas: lo que les diste a tus hijos y lo que falta darles en lo que queda del mes.
  const VECES: Record<string, number> = { semanal: 4, quincenal: 2, mensual: 1 }
  for (const a of X.mesadas ?? []) {
    if (!a.movs.length) continue
    a.movs.forEach((mv, ix) => mv.valor > 0 && push({ id: `mes:${a.id}:${mv.fecha}:${ix}`, dir: "sale", modulo: "mesadas", clase: "gasto", fecha: isoOf(mv.fecha), n: `Mesada de ${a.nombre}`, s: "Se la diste", icon: "baby", v: mv.valor, cat: "Mesadas", estado: "hecho", href: "/mesadas" }))
    for (const [y, m] of meses) {
      const ms = `${y}-${pad(m + 1)}-01`, me = `${y}-${pad(m + 1)}-${pad(lastDay(y, m))}`
      const a0 = P.a > ms ? P.a : ms, b0 = P.b < me ? P.b : me
      if (a0 > b0 || b0 < hoy) continue
      const frac = (+b0.slice(8) - +a0.slice(8) + 1) / lastDay(y, m)
      const dado = a.movs.filter((x) => x.valor > 0 && isoOf(x.fecha) >= a0 && isoOf(x.fecha) <= b0).reduce((s, x) => s + x.valor, 0)
      const falta = Math.max(0, a.mesada * (VECES[a.frec] ?? 1) * frac - dado)
      push({ id: `mes:${a.id}:${ym(ms)}:falta`, dir: "sale", modulo: "mesadas", clase: "gasto", fecha: b0, n: `Mesada de ${a.nombre}`, s: "Lo que falta darle este mes", icon: "baby", v: falta, cat: "Mesadas", estado: "programado", href: "/mesadas" })
    }
  }

  // 9. Fondo de emergencia (regla 5) e inversiones nuevas: ahorro, no gasto.
  ;(X.fondo ?? []).forEach((mv, ix) => {
    const fecha = isoOf(mv.fecha)
    if (mv.tipo === "guardar" && !mv.expense_id) push({ id: `fondo:${fecha}:${ix}`, dir: "sale", modulo: "metas", clase: "ahorro", fecha, n: "Fondo de emergencia", s: "Guardaste en tu fondo", icon: "umbrella", v: +mv.valor, cat: "Ahorro", estado: "hecho", href: "/metas" })
    if (mv.tipo === "usar") push({ id: `fondo:${fecha}:${ix}`, dir: "entra", modulo: "metas", clase: "ahorro", fecha, n: "Fondo de emergencia", s: "Sacaste de tu fondo para un imprevisto", icon: "umbrella", v: +mv.valor, cat: "Retiro de ahorro", estado: "hecho", href: "/metas" })
  })
  // Regla 8: abonos directos a metas (con su fecha); un retiro de la meta entra como retiro de ahorro.
  const metaNombre = new Map(b.goals.map((g) => [g.id, g.nombre]))
  for (const mv of X.metas ?? (b as LibroCuentas).goalMovements ?? []) {
    const fecha = isoOf(mv.fecha)
    const n = metaNombre.get(mv.goal_id)
    if (!n) continue
    const retiro = mv.tipo === "retiro"
    push({ id: `meta:${mv.id}`, dir: retiro ? "entra" : "sale", modulo: "metas", clase: "ahorro", fecha, n, s: retiro ? "Sacaste de tu meta" : "Abono a tu meta", icon: "target", v: +mv.valor, cat: retiro ? "Retiro de ahorro" : "Ahorro", estado: fecha <= hoy ? "hecho" : "programado", href: "/metas" })
  }
  for (const x of b.investments) {
    if (!x.inicio) continue
    const fecha = isoOf(x.inicio)
    push({ id: `inv:${x.id}`, dir: "sale", modulo: "inversiones", clase: "ahorro", fecha, n: x.nombre, s: "Inversión nueva", icon: "trending-up", v: conv(+x.capital, x.currency, trm), cat: "Inversiones", estado: fecha <= hoy ? "hecho" : "programado", href: "/inversiones" })
  }

  // 10. Presupuesto: lo que falta por gastar en lo que queda del periodo (regla 7).
  const vm = variableMes(b.categories, b.fixedExpenses)
  const fc = fixedCategoryIds(b.fixedExpenses)
  let presupuesto = 0
  let porGastar = 0
  if (vm > 0)
    for (const [y, m] of meses) {
      const ms = `${y}-${pad(m + 1)}-01`, me = `${y}-${pad(m + 1)}-${pad(lastDay(y, m))}`
      const a0 = P.a > ms ? P.a : ms, b0 = P.b < me ? P.b : me
      if (a0 > b0) continue
      const pm = P.tipo === "q1" || P.tipo === "q2" ? vm / 2 : (vm * (+b0.slice(8) - +a0.slice(8) + 1)) / lastDay(y, m)
      presupuesto += pm
      if (b0 < hoy) continue
      const enVar = [...contados, ...conTarjeta].filter((g) => g.fecha >= a0 && g.fecha <= b0 && cuentaEnVariable(g, b.categories, b.fixedExpenses, fc)).reduce((s, g) => s + conv(+g.valor, g.currency, trm), 0)
      const falta = Math.max(0, pm - enVar)
      porGastar += falta
      push({
        id: `pres:${ym(ms)}`, dir: "sale", modulo: "presupuesto", clase: "gasto", fecha: b0, n: "Por gastar según tu presupuesto",
        s: enVar > 0 ? "Tu presupuesto menos lo que ya gastaste" : "Mercado, transporte, gustos… según tu presupuesto",
        icon: "shopping-cart", v: falta, cat: "Por gastar (presupuesto)", estado: "estimado", href: "/presupuesto",
      })
    }

  movs.sort((p, q) => (p.fecha < q.fecha ? -1 : p.fecha > q.fecha ? 1 : p.dir === q.dir ? 0 : p.dir === "entra" ? -1 : 1))
  const ent = movs.filter((x) => x.dir === "entra")
  const sal = movs.filter((x) => x.dir === "sale")
  const sum = (l: Mov[]) => l.reduce((a, x) => a + x.v, 0)
  // Préstamos que te dieron o que hiciste: plata prestada, no ingreso ni consumo. Van aparte (credEntra/credSale) para
  // que "te sobra" no cuente como tuya la plata de un crédito (igual que el Dashboard).
  const entra = sum(ent.filter((x) => x.clase !== "ahorro" && x.clase !== "credito"))
  const gasto = sum(sal.filter((x) => x.clase === "gasto"))
  const deuda = sum(sal.filter((x) => x.clase === "deuda"))
  const ahorro = sum(sal.filter((x) => x.clase === "ahorro")) - sum(ent.filter((x) => x.clase === "ahorro"))
  const pend = (l: Mov[]) => sum(l.filter((x) => x.estado === "programado" || x.estado === "estimado"))
  const venc = (l: Mov[]) => sum(l.filter((x) => x.estado === "vencido"))

  const porModulo: GrupoModulo[] = MODULO_ORDEN.flatMap((k) => {
    const l = movs.filter((x) => x.modulo === k)
    if (!l.length) return []
    const cats = new Map<string, { cat: string; v: number; n: number }>()
    for (const x of l) { const c = cats.get(x.cat) ?? { cat: x.cat, v: 0, n: 0 }; c.v += x.v; c.n++; cats.set(x.cat, c) }
    return [{ modulo: k, ...MODULOS[k], entra: sum(l.filter((x) => x.dir === "entra")), sale: sum(l.filter((x) => x.dir === "sale")), n: l.length, cats: [...cats.values()].sort((p, q) => q.v - p.v) }]
  })

  // Consumo por categoría (regla 2): gastos de consumo del flujo + compras con tarjeta; sin el estimado del presupuesto.
  const cm = new Map<string, CategoriaGasto>()
  const addCat = (cat: string, catId: string | null | undefined, icon: string, v: number) => { const c = cm.get(cat) ?? { cat, catId, icon, v: 0, pct: 0 }; c.v += v; cm.set(cat, c) }
  for (const x of sal) if (x.clase === "gasto" && x.modulo !== "presupuesto") addCat(x.cat, x.catId, x.icon, x.v)
  for (const g of conTarjeta) addCat(catName(g.category_id), g.category_id, catIcon(b.categories, g.category_id), conv(+g.valor, g.currency, trm))
  const totCat = [...cm.values()].reduce((a, c) => a + c.v, 0)
  const porCategoria = [...cm.values()].map((c) => ({ ...c, pct: totCat ? c.v / totCat : 0 })).sort((p, q) => q.v - p.v)

  const queda = entra - gasto - deuda - ahorro
  const gastado = contados.reduce((a, g) => a + conv(+g.valor, g.currency, trm), 0)
  const fcAll = fixedCategoryIds(b.fixedExpenses)
  const gastadoPres = [...contados, ...conTarjeta].filter((g) => cuentaEnVariable(g, b.categories, b.fixedExpenses, fcAll)).reduce((a, g) => a + conv(+g.valor, g.currency, trm), 0)
  const conTarjetaPer = conTarjeta.reduce((a, g) => a + conv(+g.valor, g.currency, trm), 0)
  return {
    ...P,
    momento: P.b < hoy ? "pasado" : P.a > hoy ? "futuro" : "actual",
    movs, ent, sal,
    tot: {
      entra, gasto, deuda, sale: gasto + deuda, ahorro, queda, intereses: sal.reduce((a, x) => a + (x.interes ?? 0), 0),
      credEntra: sum(ent.filter((x) => x.clase === "credito")), credSale: sum(sal.filter((x) => x.clase === "credito")),
      caja: queda + sum(ent.filter((x) => x.clase === "credito")) - sum(sal.filter((x) => x.clase === "credito")),
      pendienteEntra: pend(ent), pendienteSale: pend(sal), vencidoEntra: venc(ent), vencidoSale: venc(sal), nVencidos: movs.filter((x) => x.estado === "vencido").length,
    },
    porModulo, porCategoria, sinValor,
    E: entra, Sa: gasto + deuda + ahorro, disp: queda, gastado, nGastos: contados.length, gastadoPres, conTarjetaPer, presupuesto, porGastar,
  }
}

// ——— Lo que tienes y lo que debes ———

export type GrupoTengo = "dinero" | "ahorro" | "bienes" | "inversiones" | "me-deben"
export type GrupoDebo = "creditos" | "tarjetas" | "impuestos" | "otras"

export interface LineaEstado {
  k: string
  grupo: GrupoTengo | GrupoDebo
  n: string
  s: string
  icon: string
  v: number
  href?: string
  /** Valor calculado (p. ej. un impuesto que aún no se declara). */
  estimado?: boolean
  /** Cuenta o deuda propia del Balance (se edita ahí). */
  ref?: { table: "assets" | "liabilities"; id: string }
}

export const GRUPOS: Record<GrupoTengo | GrupoDebo, { label: string; icon: string; href?: string }> = {
  dinero: { label: "Dinero en cuentas y efectivo", icon: "landmark" },
  ahorro: { label: "Ahorro apartado (metas y fondo)", icon: "piggy-bank", href: "/metas" },
  bienes: { label: "Casa, carro y otros bienes", icon: "house" },
  inversiones: { label: "Inversiones", icon: "trending-up", href: "/inversiones" },
  "me-deben": { label: "Lo que te deben", icon: "hand-coins", href: "/me-deben" },
  creditos: { label: "Créditos y préstamos", icon: "landmark", href: "/le-debo" },
  tarjetas: { label: "Tarjetas de crédito", icon: "credit-card", href: "/tarjetas" },
  impuestos: { label: "Impuestos por pagar", icon: "file-check", href: "/calendario" },
  otras: { label: "Otras deudas", icon: "hand-coins" },
}

export interface EstadoIntegral {
  T: Totales
  tengo: LineaEstado[]
  debo: LineaEstado[]
  /** Lo que tengo: `totales().A` + el ahorro apartado de metas y fondo que no está en una cuenta. */
  A: number
  /** Ahorro apartado (metas y fondo de emergencia que no están dentro de una de tus cuentas). */
  apartado: number
  /** Lo que debo: `totales().P` + impuestos que ya debes (estimados). */
  P: number
  pat: number
  /** Impuestos ya causados que vencen en los próximos 12 meses (renta, predial, vehicular). */
  impuestos: number
  liquidez: number
}

/**
 * Todo lo que tienes y lo que debes, línea por línea y de cada módulo: cuentas y bienes del Balance, inversiones,
 * préstamos que te deben, créditos de Le debo (con su tipo y cuándo terminan), tarjetas, deudas propias y los
 * impuestos que ya debes aunque no hayan vencido (renta del año pasado, predial y vehicular: estimados).
 */
export function estadoIntegral(b: BookData, today: DateInput, X: ExtrasIntegral = {}): EstadoIntegral {
  const hoy = isoOf(today)
  const trm = b.settings.trm
  const T = totales(b, today)
  const tengo: LineaEstado[] = []
  const debo: LineaEstado[] = []
  for (const a of b.assets as (BookData["assets"][number] & { nombre?: string; cuenta?: { vivo: boolean } })[]) {
    const v = conv(a.valor, a.currency, trm)
    tengo.push({ k: `asset:${a.id}`, grupo: /^11/.test(String(a.cod)) ? "dinero" : "bienes", n: a.nombre ?? "Cuenta", s: a.cuenta?.vivo ? "Se actualiza con tus movimientos" : "", icon: /^11/.test(String(a.cod)) ? "landmark" : "house", v, ref: a.id ? { table: "assets", id: a.id } : undefined })
  }
  const ap = ahorroApartado(b as LibroCuentas)
  for (const l of ap.lineas) tengo.push({ k: l.k, grupo: "ahorro", n: l.n, s: l.s, icon: l.icon, v: l.v, href: l.href })
  for (const x of b.investments) {
    const v = conv(inv(x, today).valor, x.currency, trm)
    if (v > 0) tengo.push({ k: `inv:${x.id}`, grupo: "inversiones", n: x.nombre, s: "Inversión", icon: "trending-up", v, href: "/inversiones" })
  }
  for (const L of b.loans) {
    const e = loanEngine(L, today)
    if (e.saldo <= 0.5) continue
    const nm = loanName(L as never, b.contacts, b.entities)
    const td = tipoDef(loanTipo(L as never))
    const fin = e.plan.at(-1)?.fecha
    const s = [td?.corto, L.concepto, e.vencidas.length ? `${e.vencidas.length} cuota${e.vencidas.length === 1 ? "" : "s"} atrasada${e.vencidas.length === 1 ? "" : "s"}` : fin ? `termina el ${fdate(parseDate(fin))}` : ""].filter(Boolean).join(" · ")
    if (L.kind === "cobrar") tengo.push({ k: `loan:${L.id}`, grupo: "me-deben", n: nm, s, icon: "hand-coins", v: e.saldo, href: "/me-deben" })
    else debo.push({ k: `loan:${L.id}`, grupo: "creditos", n: nm, s, icon: td?.icon ?? "landmark", v: e.saldo, href: "/le-debo" })
  }
  for (const t of b.creditCards) {
    const v = deudaTarjeta(t, today)
    if (v > 0.5) debo.push({ k: `card:${t.id}`, grupo: "tarjetas", n: `Tarjeta ${t.nombre}`, s: `Saldo de tus compras · ${+t.tasa || 0} % mensual`, icon: "credit-card", v, href: "/tarjetas" })
  }
  for (const p of b.liabilities as (BookData["liabilities"][number] & { nombre?: string; cod?: string })[]) {
    const cod = String(p.cod ?? "")
    debo.push({ k: `liab:${p.id}`, grupo: cod === "2380" ? "tarjetas" : cod === "2408" ? "impuestos" : "otras", n: p.nombre ?? "Deuda", s: "", icon: cod === "2408" ? "file-check" : "hand-coins", v: conv(p.valor, p.currency, trm), ref: p.id ? { table: "liabilities", id: p.id } : undefined })
  }
  // Impuestos ya causados que vencen en los próximos 12 meses, si no hay ya una deuda de impuestos registrada a mano.
  const fin = iso(addMonths(toDay(today), 12))
  let impuestos = 0
  // Deudas de impuestos escritas a mano (PUC 2408): con el mismo impuesto en el nombre, no se suma el del calendario.
  const impManual = b.liabilities.filter((p) => String((p as { cod?: string }).cod ?? "") === "2408").map((p) => norm((p as { nombre?: string }).nombre ?? ""))
  for (const c of b.calendarEvents as CalRow[]) {
    if (c.tipo !== "egreso" || !esImpuestoCausado(c)) continue
    const kw = c.titulo.match(PALABRA_IMP)?.[0]
    if (impManual.length && (!kw || impManual.some((n) => n.includes(norm(kw)) || n === "" || /impuesto/.test(n) && !PALABRA_IMP.test(n)))) continue
    if (kw && b.fixedExpenses.some((f) => norm(f.nombre).includes(norm(kw)))) continue
    const fecha = calOcc(c, hoy, fin)[0]
    if (!fecha) continue
    const v = +c.monto || +(X.estimados?.[c.id]?.v ?? 0)
    if (!(v > 0)) continue
    impuestos += v
    debo.push({ k: `cal:${c.id}`, grupo: "impuestos", n: c.titulo, s: `${+c.monto ? "Vence" : "Estimado · vence"} el ${fdate(parseDate(fecha))}`, icon: "file-check", v, href: /renta/i.test(c.titulo) ? "/renta" : "/calendario", estimado: !+c.monto })
  }
  tengo.sort((p, q) => q.v - p.v)
  debo.sort((p, q) => q.v - p.v)
  const P = T.P + impuestos
  const A = T.A + ap.total
  return { T, tengo, debo, A, apartado: ap.total, P, pat: A - P, impuestos, liquidez: liquidez(b.assets, b.investments, trm, today) }
}

/** Foto del patrimonio del mes (tabla `net_worth_snapshots`): la guarda el Balance al abrirse y el cron el día 1. */
export function snapshotMes(b: BookData, today: DateInput, X: ExtrasIntegral = {}): { mes: string; activos: number; deudas: number; patrimonio: number } {
  const E = estadoIntegral(b, today, X)
  const r = (v: number) => Math.round(v * 100) / 100
  return { mes: isoOf(today).slice(0, 7), activos: r(E.A), deudas: r(E.P), patrimonio: r(E.pat) }
}

export interface ParteEstado { k: string; label: string; icon: string; v: number; pct: number; href?: string }

/** Suma las líneas por grupo (para la barra "¿Dónde está tu plata?"), de mayor a menor y sin grupos vacíos. */
export function partesEstado(lines: LineaEstado[]): ParteEstado[] {
  const m = new Map<string, number>()
  for (const l of lines) m.set(l.grupo, (m.get(l.grupo) ?? 0) + l.v)
  const tot = [...m.values()].reduce((a, v) => a + Math.max(0, v), 0)
  return [...m.entries()].filter(([, v]) => v > 0).map(([k, v]) => ({ k, label: GRUPOS[k as GrupoTengo].label, icon: GRUPOS[k as GrupoTengo].icon, href: GRUPOS[k as GrupoTengo].href, v, pct: tot ? v / tot : 0 })).sort((a, b) => b.v - a.v)
}
