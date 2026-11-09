// Dashboard: números para decidir, a partir del flujo integral (lib/domain/flujo-integral.ts) y de los cálculos que
// ya existen (totales, estrategia de deudas, hormiga, indicadores). Puro: sin React ni reloj.
import { addMonths, iso, lastDay, MES, toDay } from "./dates"
import { compraEstado, deudaTarjeta, tarjetaCuotaMes, tarjetaPagoMes } from "./cards"
import type { MetaEstado } from "./meta"
import { debtStrategy } from "./debt-strategy"
import { posiblesDobles, totalDobles } from "./dobles"
import { fijoMensual } from "./fixed"
import { estadoIntegral, flujoIntegral, type ExtrasIntegral, type Mov } from "./flujo-integral"
import { eaDeMensual, loanEngine, loanName } from "./loans"
import { loanTipo, tipoDef } from "./loan-tipos"
import { formatCOP as $ } from "./money"
import { fondoEstado, metaPlan, type FondoRef } from "./savings"
import type { LibroCuentas } from "./cuentas"
import { subMensual, subsMes } from "./subscriptions"
import { cuotasMes, gastoVariable, hormigas, ingresoMensual } from "./totals"
import type { BookData, DateInput } from "./types"

const pad = (n: number) => String(n).padStart(2, "0")
const isoOf = (d: DateInput) => iso(toDay(d))
const pctTxt = (r: number) => `${Math.round(r * 100)} %`
const mil = (v: number) => Math.round(v / 1000) * 1000

export interface MesSerie {
  /** 'YYYY-MM' */
  k: string
  /** 'nov' (+ ' 26' en enero y en el primero). */
  l: string
  entra: number
  /** Consumo (gastos, fijos, suscripciones, impuestos…). */
  gasto: number
  /** Cuotas y tarjetas. */
  deuda: number
  /** gasto + deuda */
  sale: number
  ahorro: number
  queda: number
  /** Mes en curso: incluye lo programado y lo estimado. */
  parcial: boolean
}

/**
 * Entradas y salidas de los `n` meses que terminan en el mes de hoy (un solo cálculo integral para todo el rango).
 * Sin préstamos que te dieron o que hiciste: son plata prestada, no ingreso ni gasto (en el Balance sí salen).
 */
export function serieMeses(b: BookData, today: DateInput, X: ExtrasIntegral = {}, n = 12): MesSerie[] {
  const t = toDay(today)
  const ini = addMonths(new Date(t.getFullYear(), t.getMonth(), 1), -(n - 1))
  const a = iso(ini)
  const bEnd = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(lastDay(t.getFullYear(), t.getMonth()))}`
  const F = flujoIntegral(b, { a, b: bEnd, tipo: "rango" }, today, X)
  const hoyK = isoOf(today).slice(0, 7)
  const out: MesSerie[] = []
  for (let k = 0; k < n; k++) {
    const d = addMonths(ini, k)
    const key = iso(d).slice(0, 7)
    const l = F.movs.filter((x) => x.fecha.startsWith(key))
    const s = (f: (x: Mov) => boolean) => l.filter(f).reduce((acc, x) => acc + x.v, 0)
    const entra = s((x) => x.dir === "entra" && x.clase !== "ahorro" && x.clase !== "credito")
    const gasto = s((x) => x.dir === "sale" && x.clase === "gasto")
    const deuda = s((x) => x.dir === "sale" && x.clase === "deuda")
    const ahorro = s((x) => x.dir === "sale" && x.clase === "ahorro") - s((x) => x.dir === "entra" && x.clase === "ahorro")
    out.push({ k: key, l: MES[d.getMonth()] + (d.getMonth() === 0 || k === 0 ? " " + String(d.getFullYear()).slice(2) : ""), entra, gasto, deuda, sale: gasto + deuda, ahorro, queda: entra - gasto - deuda - ahorro, parcial: key === hoyK })
  }
  return out
}

export interface MesProyeccion {
  /** 'YYYY-MM' */
  k: string
  l: string
  /** Primer día del mes 'YYYY-MM-DD'. */
  mes: string
  /** Lo que entra (ingresos, cobros y préstamos que te dan). */
  I: number
  /** Lo que sale (gastos, fijos, cuotas, tarjetas, impuestos, presupuesto) y lo que apartas para ahorro. */
  E: number
  neto: number
  /** Saldo acumulado: empieza en tu dinero disponible de hoy. */
  saldo: number
  det: { ing: number; cob: number; cuo: number; fij: number; sub: number; var: number; aho: number }
  /** El mes en curso solo cuenta lo que falta (lo que ya pasó ya está en tu saldo). */
  parcial: boolean
}

const DET_DE: Partial<Record<Mov["modulo"], keyof MesProyeccion["det"]>> = {
  ingresos: "ing", calendario: "fij", "me-deben": "cob", "le-debo": "cuo", tarjetas: "cuo", fijos: "fij", impuestos: "fij", mesadas: "fij",
  suscripciones: "sub", gastos: "var", presupuesto: "var", metas: "aho", inversiones: "aho",
}

/**
 * Flujo de caja de los próximos `n` meses con el flujo integral (las mismas reglas del Balance y el Dashboard: nada se
 * cuenta dos veces). El mes en curso solo suma lo que falta: lo que ya pasó está en tu saldo de hoy (`liq`).
 */
export function proyeccionMeses(b: BookData, today: DateInput, X: ExtrasIntegral = {}, n = 12, liq = estadoIntegral(b, today, X).liquidez): MesProyeccion[] {
  const t = toDay(today)
  const hoy = isoOf(today)
  const ini = new Date(t.getFullYear(), t.getMonth(), 1)
  const fin = addMonths(ini, n - 1)
  const F = flujoIntegral(b, { a: iso(ini), b: `${iso(fin).slice(0, 7)}-${pad(lastDay(fin.getFullYear(), fin.getMonth()))}`, tipo: "rango" }, today, X)
  const out: MesProyeccion[] = []
  let saldo = liq
  for (let k = 0; k < n; k++) {
    const d = addMonths(ini, k)
    const key = iso(d).slice(0, 7)
    const det = { ing: 0, cob: 0, cuo: 0, fij: 0, sub: 0, var: 0, aho: 0 }
    let I = 0, E = 0
    for (const x of F.movs) {
      if (!x.fecha.startsWith(key) || (x.estado === "hecho" && x.fecha <= hoy)) continue
      const sign = x.dir === "entra" ? 1 : -1
      if (x.clase === "ahorro") { det.aho -= sign * x.v; E -= sign * x.v; continue }
      const c = DET_DE[x.modulo] ?? (x.dir === "entra" ? "ing" : "var")
      det[c] += x.v
      if (x.dir === "entra") I += x.v
      else E += x.v
    }
    saldo += I - E
    out.push({ k: key, l: MES[d.getMonth()] + (d.getMonth() === 0 || k === 0 ? " " + String(d.getFullYear()).slice(2) : ""), mes: iso(d), I, E, neto: I - E, saldo, det, parcial: k === 0 })
  }
  return out
}

export interface Compromisos {
  /** Ingreso del mes (lo que llega a la cuenta, promedio). */
  ingreso: number
  fijos: number
  cuotas: number
  tarjetas: number
  subs: number
  /** Aportes programados a metas y fondo (ahorro, no compromiso). */
  aportes: number
  total: number
  /** total / ingreso (0 si no hay ingreso). */
  pct: number
}

/** Lo que pagas sí o sí cada mes (fijos, cuotas, tarjetas y suscripciones) frente a tu ingreso. */
export function compromisos(b: BookData, today: DateInput): Compromisos {
  const ingreso = ingresoMensual(b.incomes, b.settings.trm)
  const fijos = b.fixedExpenses.filter((f) => !f.link_type).reduce((a, f) => a + fijoMensual(f, b.settings.trm), 0)
  const aportes = b.fixedExpenses.filter((f) => f.link_type).reduce((a, f) => a + fijoMensual(f), 0)
  const cuotas = cuotasMes(b.loans, "pagar", today)
  // El plan del mes (no lo que falta pagar): registrar el pago de la tarjeta no baja el compromiso.
  const tarjetas = b.creditCards.reduce((a, c) => a + tarjetaCuotaMes(c, today), 0)
  const subs = subsMes(b.subscriptions, b.settings.trm)
  const total = fijos + cuotas + tarjetas + subs
  return { ingreso, fijos, cuotas, tarjetas, subs, aportes, total, pct: ingreso ? total / ingreso : 0 }
}

export interface Capacidad {
  ingreso: number
  compromisos: number
  /** Lo que sueles gastar en el día a día (`gastoVariable`: meses completos, el presupuesto o sin datos). */
  variable: number
  /** De dónde sale `variable`; con "sin-datos" no se afirma cuánto puedes ahorrar. */
  variableBase: "historial" | "presupuesto" | "sin-datos"
  /** ingreso − compromisos − variable (lo que puedes ahorrar al mes). */
  libre: number
  aportes: number
  /** Dinero disponible hoy (cuentas, efectivo e inversiones de ahorro). */
  liquidez: number
  /** Con qué cuentas para emergencias: el saldo del fondo si está activo, si no tu dinero disponible (`fondoDisponible`). */
  fondo: number
  /** ¿`fondo` es el saldo del fondo de emergencia (true) o tu dinero disponible (false)? */
  enFondo: boolean
  basicos: number
  /** Meses que aguantas sin ingresos con `fondo`. */
  meses: number
  metaMeses: number
  /** Lo que falta para el fondo de emergencia (meta × gastos básicos − fondo). Igual que en Metas. */
  faltaFondo: number
}

/** `fund`: el fondo de emergencia (por defecto el del libro, si viene en `LibroCuentas`). */
export function capacidad(b: BookData, today: DateInput, C = compromisos(b, today), liq = estadoIntegral(b, today).liquidez, fund: FondoRef = (b as LibroCuentas).fund): Capacidad {
  // Sin lo que ya está en los compromisos: compras con tarjeta (van en el pago de la tarjeta), cuotas y cobros de suscripciones.
  const subs = new Set(b.subscriptions.map((x) => x.nombre.trim().toLowerCase()))
  const V = gastoVariable(b.expenses.filter((g) => { const o = (g as { origen?: string | null }).origen; return o !== "tarjeta" && o !== "prestamo" && !subs.has(g.descripcion.trim().toLowerCase()) }), b.categories, b.fixedExpenses, today)
  const variable = V.valor
  const F = fondoEstado(b, today, liq, fund)
  return {
    ingreso: C.ingreso, compromisos: C.total, variable, variableBase: V.base, libre: C.ingreso - C.total - variable, aportes: C.aportes,
    liquidez: liq, fondo: F.tiene, enFondo: F.enFondo, basicos: F.basicos, meses: F.meses, metaMeses: F.metaMeses, faltaFondo: F.falta,
  }
}

export interface DeudaItem {
  id: string
  n: string
  tipo: string
  icon: string
  saldo: number
  /** Cuota del próximo pago. */
  cuota: number
  frec: string
  /** Fecha de la última cuota ('YYYY-MM-DD') o null. */
  fin: string | null
  cuotasFaltan: number
  /** Intereses que faltan por pagar. */
  interesFalta: number
  /** Tasa efectiva anual aproximada (0..1). */
  ea: number
  vencidas: number
  href: string
}

export interface DeudasResumen {
  items: DeudaItem[]
  total: number
  interesFalta: number
  /** Cuándo quedas libre de deudas (la última cuota de todas). */
  libre: string | null
  /** Saldo total proyectado mes a mes hasta llegar a 0 (máx. 60 meses). */
  serie: { k: string; l: string; saldo: number }[]
}


/** Todas tus deudas (Le debo y tarjetas): saldo, cuándo terminan, cuánto pagas de intereses y cómo baja el saldo. */
export function deudas(b: BookData, today: DateInput): DeudasResumen {
  const t = toDay(today)
  const items: DeudaItem[] = []
  const planes: { fecha: string; saldo: number }[][] = []
  for (const L of b.loans) {
    if (L.kind !== "pagar") continue
    const e = loanEngine(L, today)
    if (e.saldo <= 1) continue
    const td = tipoDef(loanTipo(L as never))
    items.push({
      id: L.id ?? "", n: loanName(L as never, b.contacts, b.entities) + (L.concepto ? ` · ${L.concepto}` : ""), tipo: td?.corto ?? "Deuda", icon: td?.icon ?? "landmark",
      saldo: e.saldo, cuota: e.next?.valor ?? 0, frec: L.frec, fin: e.plan.at(-1)?.fecha ?? null, cuotasFaltan: e.plan.length,
      interesFalta: e.plan.reduce((a, r) => a + r.int, 0), ea: L.sistema === "sin" ? 0 : eaDeMensual(+L.tasa), vencidas: e.vencidas.length, href: "/le-debo",
    })
    planes.push([{ fecha: isoOf(today), saldo: e.saldo }, ...e.plan.map((r) => ({ fecha: r.fecha, saldo: r.saldo }))])
  }
  const cardSaldo: ((ref: Date) => number)[] = []
  for (const c of b.creditCards) {
    const saldo = deudaTarjeta(c, today)
    if (saldo <= 1) continue
    const pend = (c.purchases || []).map((p) => ({ p, e: compraEstado(c, p, today) })).filter((x) => x.e.pendiente)
    const interes = pend.reduce((a, x) => a + Math.max(0, x.e.cuota * (x.e.n - x.e.k) - x.e.saldo), 0)
    const ult = pend.reduce((m, x) => Math.max(m, x.e.n - x.e.k), 0)
    const fin = ult ? iso(new Date(t.getFullYear(), t.getMonth() + ult, Math.min(+c.pago || 15, lastDay(t.getFullYear(), t.getMonth() + ult)))) : null
    items.push({ id: c.id, n: `Tarjeta ${c.nombre}`, tipo: "Tarjeta", icon: "credit-card", saldo, cuota: tarjetaPagoMes(c, today), frec: "mensual", fin, cuotasFaltan: ult, interesFalta: interes, ea: eaDeMensual(+c.tasa), vencidas: 0, href: "/tarjetas" })
    cardSaldo.push((ref) => deudaTarjeta(c, ref))
  }
  items.sort((a, b) => b.saldo - a.saldo)
  const libre = items.reduce<string | null>((m, x) => (x.fin && (!m || x.fin > m) ? x.fin : m), null)
  const serie: DeudasResumen["serie"] = []
  for (let k = 0; k <= 60; k++) {
    const d = new Date(t.getFullYear(), t.getMonth() + k, 1)
    const fin = iso(new Date(d.getFullYear(), d.getMonth(), lastDay(d.getFullYear(), d.getMonth())))
    const ref = k === 0 ? t : new Date(d.getFullYear(), d.getMonth(), lastDay(d.getFullYear(), d.getMonth()))
    let saldo = 0
    for (const pl of planes) { let s = pl[0].saldo; for (const r of pl) { if (r.fecha > fin) break; s = r.saldo } saldo += k === 0 ? pl[0].saldo : s }
    for (const f of cardSaldo) saldo += f(ref)
    serie.push({ k: iso(d).slice(0, 7), l: MES[d.getMonth()] + (d.getMonth() === 0 || k === 0 ? " " + String(d.getFullYear()).slice(2) : ""), saldo })
    if (saldo <= 1 && k > 0) break
  }
  return { items, total: items.reduce((a, x) => a + x.saldo, 0), interesFalta: items.reduce((a, x) => a + x.interesFalta, 0), libre, serie }
}

export interface MetaAvance { id: string; nombre: string; objetivo: number; ahorrado: number; progreso: number; fecha: string | null; mensual: number; falta: number }

export const metasAvance = (b: BookData, today: DateInput): MetaAvance[] =>
  b.goals.map((g) => { const p = metaPlan(g, today); return { id: g.id, nombre: g.nombre, objetivo: +g.objetivo, ahorrado: +g.ahorrado, progreso: Math.min(1, p.progreso), fecha: g.fecha, mensual: p.mensual, falta: p.falta } })
    .sort((a, b) => a.progreso - b.progreso)

export interface Decision {
  id: string
  tono: "ok" | "warn" | "bad" | "info"
  icon: string
  titulo: string
  detalle: string
  /** Impacto en pesos (lo que ahorras, liberas o te falta). */
  impacto?: number
  impactoLabel?: string
  href: string
  accion: string
}

/**
 * Recomendaciones accionables, cada una con su impacto en pesos: atrasos, la deuda más cara, compromisos frente al
 * ingreso, cuánto puedes ahorrar, el fondo de emergencia, impuestos que vienen, suscripciones, hormiga y cobros.
 * `proximos` son los movimientos de los próximos meses (flujo integral) para los impuestos.
 */
export function decisiones(b: BookData, today: DateInput, ctx: { comp: Compromisos; cap: Capacidad; deu: DeudasResumen; vencidos: Mov[]; proximos: Mov[]; /** Tu meta principal (Perfil): sube lo que te acerca a ella. */ meta?: MetaEstado | null }): Decision[] {
  const { comp, cap, deu } = ctx
  const out: Decision[] = []
  const hoy = isoOf(today)

  const atrasado = ctx.vencidos.filter((x) => x.dir === "sale").reduce((a, x) => a + x.v, 0)
  if (atrasado > 0)
    out.push({ id: "atrasos", tono: "bad", icon: "circle-alert", titulo: `Tienes ${$(atrasado)} en pagos atrasados`, detalle: "Ponte al día primero: los atrasos cobran intereses de mora y dañan tu historial de crédito. Si ya los pagaste, márcalos como pagados.", impacto: atrasado, impactoLabel: "por pagar ya", href: "/recordatorios", accion: "Ver pagos atrasados" })

  // La deuda más cara: tarjeta o crédito con la tasa más alta.
  const cara = [...deu.items].filter((x) => x.ea > 0 && x.interesFalta > 1000).sort((a, b) => b.ea - a.ea)[0]
  if (cara)
    out.push({ id: "deuda-cara", tono: cara.ea >= 0.3 ? "warn" : "info", icon: cara.icon, titulo: `Paga primero ${cara.n}`, detalle: `Es tu deuda más cara (unos ${pctTxt(cara.ea)} al año). Si la pagas hoy completa (${$(cara.saldo)}) te ahorras unos ${$(cara.interesFalta)} en intereses; cada abono extra va directo a bajarla.`, impacto: cara.interesFalta, impactoLabel: "en intereses", href: cara.href, accion: "Ver esta deuda" })

  // Abonar extra con avalancha / bola de nieve (Salir de deudas).
  const pagar = b.loans.filter((L) => L.kind === "pagar" && loanEngine(L, today).saldo > 1)
  // Solo si de verdad te sobra plata al mes (y lo sabemos): si no, "abona más" contradice "te faltan X al mes".
  if (pagar.length && cap.libre > 0 && cap.variableBase !== "sin-datos") {
    const extra = Math.max(100000, mil(cap.libre * 0.3))
    const S = debtStrategy(pagar, b.contacts, b.entities, extra, today)
    // `fin: false` = ni pagando las cuotas ni con el abono se acaban (la cuota no cubre los intereses): ahí `m` y `ti`
    // son el tope de la simulación, así que no se puede prometer un ahorro ni una fecha.
    if (S && S.base.fin && S[S.recomendado].fin) {
      const r = S[S.recomendado]
      const ahorro = Math.max(0, S.base.ti - r.ti)
      const meses = Math.max(0, S.base.m - r.m)
      if (ahorro > 1000)
        out.push({ id: "abono", tono: "info", icon: "trending-down", titulo: `Abona ${$(extra)} más al mes a tus deudas`, detalle: `Empezando por ${r.names[r.ord[0]]} (método ${S.recomendado === "avalancha" ? "avalancha: primero la más cara" : "bola de nieve: primero la más pequeña"}) te ahorras ${$(ahorro)} en intereses${meses ? ` y terminas ${meses} ${meses === 1 ? "mes" : "meses"} antes` : ""}.`, impacto: ahorro, impactoLabel: "en intereses", href: "/estrategia", accion: "Ver mi plan para salir de deudas" })
    }
  }

  if (comp.ingreso > 0) {
    const sobra = comp.total - comp.ingreso * 0.5
    out.push(comp.pct >= 0.5
      ? { id: "compromisos", tono: comp.pct >= 0.7 ? "bad" : "warn", icon: "lock", titulo: `Tus compromisos fijos son el ${pctTxt(comp.pct)} de tu ingreso`, detalle: `Fijos, cuotas, tarjetas y suscripciones suman ${$(comp.total)} de ${$(comp.ingreso)} al mes. Lo sano es menos del 50 %: bajarlos a la mitad de tu ingreso te liberaría ${$(sobra)} al mes.`, impacto: sobra, impactoLabel: "al mes", href: "/fijos", accion: "Revisar mis gastos fijos" }
      : { id: "compromisos", tono: "ok", icon: "circle-check", titulo: `Tus compromisos fijos son el ${pctTxt(comp.pct)} de tu ingreso`, detalle: `Fijos, cuotas, tarjetas y suscripciones suman ${$(comp.total)} al mes. Está por debajo del 50 %, que es lo sano.`, href: "/fijos", accion: "Ver mis gastos fijos" })
    out.push(cap.variableBase === "sin-datos"
      ? { id: "ahorro", tono: "info", icon: "piggy-bank", titulo: "Aún no sabemos cuánto puedes ahorrar al mes", detalle: `Tus compromisos suman ${$(comp.total)} de ${$(comp.ingreso)}, pero llevas poco tiempo registrando lo que gastas en el día a día. Con un mes completo de gastos (o con topes en tu presupuesto) te decimos cuánto te queda.`, href: "/presupuesto", accion: "Poner topes en mi presupuesto" }
      : cap.libre > 0
      ? { id: "ahorro", tono: "ok", icon: "piggy-bank", titulo: `Puedes ahorrar ${$(mil(cap.libre))} al mes`, detalle: `Es lo que te queda después de tus compromisos y de lo que sueles gastar en el día a día (${$(cap.variable)}). En un año serían ${$(mil(cap.libre * 12))}: prográmalo el día que te pagan.`, impacto: cap.libre * 12, impactoLabel: "en un año", href: "/metas", accion: "Programar un ahorro" }
      : { id: "ahorro", tono: "bad", icon: "wallet", titulo: `Te faltan ${$(mil(-cap.libre))} al mes`, detalle: `Tus compromisos (${$(comp.total)}) y lo que sueles gastar en el día a día (${$(cap.variable)}) pasan tu ingreso (${$(comp.ingreso)}). Recorta gastos variables o busca bajar una cuota.`, impacto: -cap.libre, impactoLabel: "al mes", href: "/presupuesto", accion: "Ajustar mi presupuesto" })
  }

  if (cap.basicos > 0 && cap.meses < cap.metaMeses) {
    const k = cap.libre > 0 && cap.variableBase !== "sin-datos" ? Math.ceil(cap.faltaFondo / cap.libre) : 0
    out.push({ id: "fondo", tono: cap.meses < 3 ? "warn" : "info", icon: "umbrella", titulo: `Te faltan ${$(mil(cap.faltaFondo))} para tu fondo de emergencia`, detalle: `Hoy aguantas ${cap.meses.toFixed(1).replace(".", ",")} meses sin ingresos; la meta es ${cap.metaMeses}.${k ? ` Ahorrando ${$(mil(cap.libre))} al mes lo completas en ${k} ${k === 1 ? "mes" : "meses"}.` : ""}`, impacto: cap.faltaFondo, impactoLabel: "por ahorrar", href: "/metas", accion: "Armar mi fondo" })
  }

  const imp = ctx.proximos.filter((x) => x.modulo === "impuestos" && x.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))[0]
  if (imp) {
    const [y, m] = imp.fecha.split("-").map(Number)
    const t = toDay(today)
    const meses = Math.max(1, (y - t.getFullYear()) * 12 + (m - 1 - t.getMonth()))
    out.push({ id: "impuesto", tono: "info", icon: "file-check", titulo: `Separa ${$(mil(imp.v / meses))} al mes para ${imp.n}`, detalle: `Vence el ${imp.fecha} y es de unos ${$(imp.v)}${imp.estado === "estimado" ? " (estimado con tus datos)" : ""}. Guardándolo mes a mes no te toma por sorpresa.`, impacto: imp.v, impactoLabel: "a pagar", href: imp.href, accion: "Ver la fecha" })
  }

  if (b.subscriptions.length >= 2) {
    const anual = subsMes(b.subscriptions, b.settings.trm) * 12
    const top = [...b.subscriptions].sort((a, c) => subMensual(c, b.settings.trm) - subMensual(a, b.settings.trm))[0]
    out.push({ id: "subs", tono: "info", icon: "repeat", titulo: `Tus suscripciones te cuestan ${$(anual)} al año`, detalle: `Son ${b.subscriptions.length}. Si cancelas la que menos uses (la más cara es ${top.nombre}) ahorras hasta ${$(subMensual(top, b.settings.trm) * 12)} al año.`, impacto: subMensual(top, b.settings.trm) * 12, impactoLabel: "al año", href: "/suscripciones", accion: "Revisar suscripciones" })
  }

  const H = hormigas(b, today)
  // Solo con datos suficientes (proyectarMes): con 3 gastos en los primeros días no se habla del mes ni del año.
  if (H.base !== "pronto" && H.proy > 0 && comp.ingreso > 0 && H.proy / comp.ingreso >= 0.03) {
    const como = H.base === "historial" ? "por lo que sueles gastar" : `a tu ritmo de los últimos ${H.dias} días`
    out.push({ id: "hormiga", tono: H.over ? "warn" : "info", icon: "coffee", titulo: `Los gastos hormiga van para ${$(mil(H.proy))} este mes`, detalle: `Llevas ${$(H.totalMes)} en ${H.mes.length} ${H.mes.length === 1 ? "gasto" : "gastos"} y, ${como}, terminarías el mes en unos ${$(mil(H.proy))}. Si todos los meses fueran así, al año serían ${$(mil(H.anual))}: bajarlos a la mitad te deja ${$(mil(H.anual / 2))} para tus metas.`, impacto: H.anual / 2, impactoLabel: "al año", href: "/gastos", accion: "Ver mis gastos hormiga" })
  }

  // Plata contada dos veces: un gasto suelto que es el mismo pago de un gasto fijo (este mes y el pasado). No se
  // descuenta solo (sería adivinar): se avisa para que la persona lo enlace con un toque.
  const t0 = toDay(today)
  const dob = posiblesDobles(b, iso(new Date(t0.getFullYear(), t0.getMonth() - 1, 1)), iso(new Date(t0.getFullYear(), t0.getMonth() + 1, 0)), today)
  if (dob.length) {
    const sobra = totalDobles(dob)
    const uno = dob.length === 1
    out.push({
      id: "dobles", tono: "warn", icon: "copy", titulo: `${uno ? "Un gasto" : `${dob.length} gastos`} que parece${uno ? "" : "n"} estar contado${uno ? "" : "s"} dos veces`,
      detalle: `${uno ? `“${dob[0].descripcion}” (${$(dob[0].v)}) se parece al pago de tu gasto fijo “${dob[0].fixed.nombre}”` : `Se parecen al pago de un gasto fijo que ya cuenta por su lado (${dob.map((x) => x.fixed.nombre).filter((n, i, l) => l.indexOf(n) === i).slice(0, 3).join(", ")})`}: por eso ${$(sobra)} salen dos veces en tus cuentas. Si es el mismo pago, enlázalo desde Gastos y la cifra queda bien.`,
      impacto: sobra, impactoLabel: "contados de más", href: "/gastos", accion: "Revisar esos gastos",
    })
  }

  const cobrar = ctx.vencidos.filter((x) => x.dir === "entra").reduce((a, x) => a + x.v, 0)
  if (cobrar > 0)
    out.push({ id: "cobrar", tono: "warn", icon: "hand-coins", titulo: `Te deben ${$(cobrar)} en cuotas atrasadas`, detalle: "Recuérdale a quien te debe: desde Me deben le envías el cobro por WhatsApp con tus datos para pagarte.", impacto: cobrar, impactoLabel: "por cobrar", href: "/me-deben", accion: "Cobrar" })

  const rank = { bad: 0, warn: 1, info: 2, ok: 3 }
  const orden = out.sort((a, c) => rank[a.tono] - rank[c.tono] || (c.impacto ?? 0) - (a.impacto ?? 0))

  // Tu meta principal manda: lo que te acerca a ella va primero (después de lo urgente: atrasos y dobles).
  const M = ctx.meta
  if (!M || M.lograda) return orden
  const prefiere: Record<string, string[]> = {
    deudas: ["deuda-cara", "abono", "compromisos"],
    fondo: ["fondo", "ahorro", "hormiga"],
  }
  const ids = prefiere[M.def.tipo] ?? ["ahorro", "hormiga", "subs"]
  const urgente = orden.filter((d) => d.tono === "bad")
  const suyas = orden.filter((d) => d.tono !== "bad" && ids.includes(d.id))
  const resto = orden.filter((d) => d.tono !== "bad" && !ids.includes(d.id))
  const meta: Decision = {
    id: "meta", tono: "info", icon: M.def.icon, titulo: M.lograda ? `Lograste tu meta: ${M.titulo}` : `Tu meta: ${M.titulo}`,
    detalle: M.objetivo > 0
      ? `Vas en el ${Math.round(M.progreso * 100)} %: llevas ${$(M.llevas)} de ${$(M.objetivo)}${M.mensual ? ` y separando ${$(mil(M.mensual))} al mes llegas ${M.meses === 1 ? "el otro mes" : `en ${M.meses} meses`}` : ""}.${M.siguiente ? ` Lo que sigue: ${M.siguiente.t.toLowerCase()}.` : ""}`
      : `Ponle un monto y una fecha a tu meta para saber cuánto separar cada mes.${M.siguiente ? ` Lo que sigue: ${M.siguiente.t.toLowerCase()}.` : ""}`,
    impacto: M.falta || undefined, impactoLabel: M.falta ? "te falta" : undefined, href: "/perfil#meta", accion: "Ver mi meta",
  }
  return [...urgente, meta, ...suyas, ...resto]
}
