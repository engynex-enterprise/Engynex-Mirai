// Consejero antes de gastar (analizar + asAnalyze + interpretación local de o_asesor.js, Mirai 4.0).
import { iso, mkey, toDay } from "./dates"
import { isHormiga, norm } from "./hormiga"
import { annuity, loanEngine, loanName, rateFromCuota } from "./loans"
import { formatCOP as $, pct } from "./money"
import { subsMes } from "./subscriptions"
import { cuotasMes, fijosMes, gastosBasicos, gastoVariableReal, ingresoMensual, liquidez } from "./totals"
import type { BookData, DateInput } from "./types"

export const ATIPOS = {
  comprar: { l: "Comprar algo", d: "Celular, nevera, viaje, muebles…", icon: "shopping-bag", iso: "tarjetas" },
  tarjeta: { l: "Sacar una tarjeta de crédito", d: "Saber si te conviene y cuánto cuesta", icon: "credit-card", iso: "tarjetas" },
  credito: { l: "Pedir un préstamo o crédito", d: "Banco, libranza, vehículo, vivienda", icon: "landmark", iso: "le-debo" },
  prestar: { l: "Prestarle dinero a alguien", d: "Familiar, amigo o cliente", icon: "hand-coins", iso: "me-deben" },
  fijo: { l: "Asumir un gasto mensual", d: "Arriendo, plan, colegio, gimnasio", icon: "repeat", iso: "suscripciones" },
  invertir: { l: "Invertir o ahorrar", d: "CDT, cuenta de ahorro, fondo", icon: "trending-up", iso: "inversiones" },
  abonar: { l: "Abonar a una deuda", d: "Pagar antes para ahorrar intereses", icon: "piggy-bank", iso: "estrategia" },
  empeno: { l: "Empeñar algo", d: "Dejar un objeto a cambio de dinero", icon: "gem", iso: "le-debo" },
} as const
export type Atipo = keyof typeof ATIPOS

export const AEJ = [
  "Quiero sacar una tarjeta de crédito, me aprueban un cupo de 5 millones",
  "Comprar un celular de 3 millones a 12 cuotas con la tarjeta",
  "Prestarle 2 millones a mi hermano y que me pague en 6 meses",
  "Pedir un crédito de libre inversión de 15 millones a 36 meses",
  "Mudarme a un arriendo de 2.300.000 al mes",
  "Meter 10 millones en un CDT a 6 meses",
]

export type Estricto = "prudente" | "equilibrado" | "flexible"
export type Veredicto = "si" | "cuidado" | "no"

/** Datos de la decisión (formulario del consejero). Los montos van en pesos. */
export interface AdvisorInput {
  tipo: Atipo
  desc?: string
  valor?: number | string
  forma?: "contado" | "cuotas"
  cuotas?: number | string
  modoInt?: "no" | "tasa" | "cuota"
  tasa?: number | string
  cuotaV?: number | string
  ea?: number | string
  contactoId?: string
  manejo?: number | string
  uso?: number | string
  pagoModo?: "total" | "cuotas"
  seguros?: number | string
  dias?: number | string
  reemplaza?: number | string
  loanId?: string
  persona?: string
  dudas?: string[]
}

export interface AdvisorMetrics {
  ing: number; libre: number; libreD: number; ratioD: number; liq: number; liqD: number; emergA: number; emergD: number
  cuota: number; total: number; intereses: number; ea: number; n: number; dias: number; valor: number; enCuotas: boolean
  hist: { n: number; mora: number; saldo: number; nombre?: string } | null; varr: number; fij: number; cuo: number; subs: number
}
export interface Analisis { v: Veredicto; R: string[]; m: AdvisorMetrics; X?: Record<string, number> }

const LIMITES: Record<Estricto, [number, number, number, number]> = { prudente: [0.25, 0.35, 4, 0.15], equilibrado: [0.3, 0.4, 3, 0.1], flexible: [0.35, 0.5, 2, 0.05] }

/** Reglas base (analizar de la v4). `cfg.usura` en % E.A. */
export function analizar(b: BookData, d: { tipo: string; valor: number; cuotas: number; forma?: string; modoInt?: string; tasa?: number; cuotaV?: number; contactoId?: string }, cfg: { estricto?: string; usura: number }, today: DateInput): Analisis {
  const trm = b.settings.trm
  const ing = ingresoMensual(b.incomes, trm), fij = fijosMes(b.fixedExpenses), cuo = cuotasMes(b.loans, "pagar", today), subs = subsMes(b.subscriptions, trm)
  const varr = gastoVariableReal(b.expenses, b.categories, b.fixedExpenses, today)
  const libre = ing - fij - cuo - subs - varr, liq = liquidez(b.assets, b.investments, trm, today), bas = gastosBasicos(b, today) || 1
  const valor = +d.valor || 0, n = Math.max(1, +d.cuotas || 1)
  let cuota = 0, total = valor, intereses = 0, ea = 0, tasaM = 0
  const enCuotas = d.tipo === "credito" || d.tipo === "prestar" || (d.tipo === "comprar" && d.forma === "cuotas")
  if (enCuotas) {
    if (d.modoInt === "tasa") { tasaM = +(d.tasa ?? 0) || 0; cuota = annuity(valor, tasaM / 100, n) }
    else if (d.modoInt === "cuota") { cuota = +(d.cuotaV ?? 0) || 0; tasaM = rateFromCuota(valor, cuota, n, "mensual") }
    else cuota = valor / n
    total = cuota * n; intereses = Math.max(total - valor, 0); ea = Math.pow(1 + tasaM / 100, 12) - 1
  }
  let libreD = libre, ratioD = ing ? cuo / ing : 0, liqD = liq
  if (d.tipo === "fijo") libreD = libre - valor
  else if (d.tipo === "prestar") liqD = liq - valor
  else if (enCuotas) { libreD = libre - cuota; ratioD = ing ? (cuo + cuota) / ing : 0 }
  else liqD = liq - valor
  const emergA = liq / bas, emergD = liqD / bas
  let hist: AdvisorMetrics["hist"] = null
  if (d.tipo === "prestar" && d.contactoId) {
    const Ls = b.loans.filter((L) => L.kind === "cobrar" && L.contact_id === d.contactoId)
    hist = { n: Ls.length, mora: Ls.filter((L) => loanEngine(L, today).mora > 0).length, saldo: Ls.reduce((a, L) => a + loanEngine(L, today).saldo, 0), nombre: b.contacts.find((c) => c.id === d.contactoId)?.nombre }
  }
  const R: string[] = []
  let v: Veredicto = "si"
  const LIM = LIMITES[cfg.estricto as Estricto] ?? LIMITES.equilibrado
  const worse = (x: Veredicto) => { if (x === "no" || (x === "cuidado" && v === "si")) v = x }
  if (libreD < 0) { worse("no"); R.push(`Después de esto te faltarían ${$(-libreD)} cada mes para cubrir tus gastos.`) }
  else if (libreD < ing * LIM[3]) { worse("cuidado"); R.push(`Te quedarían solo ${$(libreD)} libres al mes.`) }
  else R.push(`Te seguirían quedando ${$(libreD)} libres al mes.`)
  if (enCuotas && d.tipo !== "prestar") {
    if (ratioD > LIM[1]) { worse("no"); R.push(`Tus deudas se llevarían el ${pct(ratioD, 0)} de tu ingreso (lo sano es menos del ${pct(LIM[0], 0)}).`) }
    else if (ratioD > LIM[0]) { worse("cuidado"); R.push(`Tus deudas pasarían al ${pct(ratioD, 0)} de tu ingreso, por encima del ${pct(LIM[0], 0)} recomendado.`) }
  }
  if (d.tipo === "prestar" || (!enCuotas && d.tipo !== "fijo")) {
    if (liqD < 0) { worse("no"); R.push(`No tienes ${$(valor)} disponibles: te faltan ${$(-liqD)}.`) }
    else if (emergD < 1) { worse("no"); R.push("Te quedarías con menos de un mes de colchón para emergencias.") }
    else if (emergD < LIM[2]) { worse("cuidado"); R.push(`Tu colchón para emergencias bajaría de ${emergA.toFixed(1)} a ${emergD.toFixed(1)} meses.`) }
  }
  if (enCuotas && ea * 100 > cfg.usura) { worse("cuidado"); R.push(`El interés equivale a ${pct(ea, 1)} anual, por encima de la tasa de usura que tienes configurada (${cfg.usura}%).`) }
  if (hist && hist.mora) { worse("cuidado"); R.push(`${hist.nombre} tiene ${hist.mora} préstamo(s) con pagos atrasados.`) }
  if (enCuotas && intereses > 0) R.push(`Pagarías ${$(intereses)} en intereses (en total ${$(total)}).`)
  const dias = ing ? valor / (ing / 30) : 0
  return { v, R, m: { ing, libre, libreD, ratioD, liq, liqD, emergA, emergD, cuota, total, intereses, ea, n, dias, valor, enCuotas, hist, varr, fij, cuo, subs } }
}

/** Análisis completo por tipo de decisión (asAnalyze de la v4). */
export function asAnalyze(b: BookData, d: AdvisorInput, cfg: { estricto?: string; usura: number }, today: DateInput): Analisis {
  const t = d.tipo
  let base: Parameters<typeof analizar>[1] = { tipo: "comprar", valor: +(d.valor ?? 0) || 0, cuotas: +(d.cuotas ?? 0) || 1, forma: "contado", modoInt: d.modoInt || "no", tasa: +(d.tasa ?? 0) || 0, cuotaV: +(d.cuotaV ?? 0) || 0, contactoId: d.contactoId || "" }
  const extra: string[] = []
  const X: Record<string, number> = {}
  const ing = ingresoMensual(b.incomes, b.settings.trm)
  if (t === "comprar") base = { ...base, forma: d.forma || "contado" }
  if (t === "credito") base.tipo = "credito"
  if (t === "prestar") base.tipo = "prestar"
  if (t === "fijo") base = { ...base, tipo: "fijo", valor: Math.max(0, (+(d.valor ?? 0) || 0) - (+(d.reemplaza ?? 0) || 0)) }
  if (t === "tarjeta") {
    const man = +(d.manejo ?? 0) || 0, uso = +(d.uso ?? 0) || 0, tm = (+(d.tasa ?? 0) || 1.9) / 100, n = Math.max(1, +(d.cuotas ?? 0) || 6)
    const intMes = d.pagoModo === "cuotas" && uso ? (annuity(uso, tm, n) * n - uso) / n : 0
    X.manejo = man; X.intMes = intMes; X.costoAnual = (man + intMes) * 12
    base = { ...base, tipo: "fijo", valor: man + intMes }
    extra.push(`El cupo de ${$(+(d.valor ?? 0) || 0)} no es dinero tuyo: es lo máximo que el banco te presta. Todo lo que gastes lo debes devolver.`)
    extra.push(d.pagoModo === "cuotas" ? `Si difieres ${$(uso)} a ${n} cuotas cada mes, pagarías unos ${$(intMes)} al mes solo en intereses.` : `Si pagas el total cada mes no pagas intereses${man ? `; solo la cuota de manejo de ${$(man)} (${$(man * 12)} al año)` : ""}.`)
    if (uso && ing && uso > ing * 0.3) extra.push(`Gastar ${$(uso)} al mes con la tarjeta es más del 30% de tu ingreso: es fácil que se acumule la deuda.`)
  }
  if (t === "invertir") {
    const ea = (+(d.ea ?? 0) || 0) / 100, dias = +(d.dias ?? 0) || 180
    const gan = (+(d.valor ?? 0) || 0) * (Math.pow(1 + ea, dias / 365) - 1)
    X.gan = gan; X.net = gan * 0.96
    extra.push(`En ${dias} días ganarías unos ${$(gan)} (cerca de ${$(gan * 0.96)} después de la retención del 4%).`)
    extra.push("Mientras esté invertido no podrás usar ese dinero: revisa que te quede un colchón para emergencias.")
  }
  if (t === "abonar") {
    const L = b.loans.find((x) => x.kind === "pagar" && x.id === d.loanId)
    if (L) {
      const e0 = loanEngine(L, today)
      const e1 = loanEngine({ ...L, payments: [...L.payments, { id: "x", fecha: iso(toDay(today)), tipo: "abono", valor: +(d.valor ?? 0) || 0, modo: "plazo" }] }, today)
      X.ahorro = Math.max(0, e0.intTotal - e1.intTotal); X.menos = e0.plan.length - e1.plan.length
      extra.push(`Ahorrarías unos ${$(X.ahorro)} en intereses y terminarías ${X.menos} cuota${X.menos === 1 ? "" : "s"} antes.`)
    }
  }
  if (t === "empeno") {
    const im = ((+(d.valor ?? 0) || 0) * (+(d.tasa ?? 0) || 4)) / 100
    X.intMes = im
    base = { ...base, tipo: "fijo", valor: im }
    extra.push(`Pagarías unos ${$(im)} de interés cada mes y al final debes devolver ${$(+(d.valor ?? 0) || 0)} completos para recuperar tu objeto.`)
    if ((+(d.cuotas ?? 0) || 3) > 1) extra.push(`En ${+(d.cuotas ?? 0) || 3} meses pagarías ${$(im * (+(d.cuotas ?? 0) || 3))} solo en intereses.`)
  }
  if (t === "credito" && +(d.seguros ?? 0)) extra.push(`Además de la cuota, pagarías ${$(+(d.seguros ?? 0))} al mes en seguros y otros cobros.`)
  const an = analizar(b, base, cfg, today)
  if (t === "credito" && +(d.seguros ?? 0)) { an.m.libreD -= +(d.seguros ?? 0); an.m.cuota += +(d.seguros ?? 0) }
  if (t === "abonar" && X.ahorro > 0 && an.v === "cuidado" && an.m.emergD >= 1) an.v = "si"
  if (t === "invertir" && an.v === "no" && an.m.liqD >= 0) an.v = "cuidado"
  an.R = [...extra, ...an.R]
  an.X = X
  return an
}

/** Montos escritos en texto ("3 millones", "500 mil", "2.300.000"), solo ≥ 1.000. */
export function moneyIn(t: string): { v: number; i: number; raw: string }[] {
  const n = norm(t)
  const out: { v: number; i: number; raw: string }[] = []
  const re = /(\d+(?:[.,]\d+)*)\s*(millones|millon|mill|mll|m\b|mil|k\b|lucas|palos?)?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(n))) {
    let v = parseFloat(m[1].replace(/\.(?=\d{3}\b)/g, "").replace(",", "."))
    const u = m[2] || ""
    if (/^(millones|millon|mill|mll|m|palo|palos)$/.test(u)) v *= 1e6
    else if (/^(mil|k|lucas)$/.test(u)) v *= 1e3
    if (v >= 1000) out.push({ v, i: m.index, raw: m[0] })
  }
  return out
}

/** Interpretación sin IA de la frase del usuario (localInterp de la v4). */
export function localInterp(t: string): AdvisorInput {
  const n = norm(t)
  let tipo: Atipo = "comprar"
  if (/tarjeta de credito|sacar (una )?tarjeta|cupo de|me aprueban (un )?cupo/.test(n) && !/con la tarjeta|con tarjeta/.test(n)) tipo = "tarjeta"
  else if (/prestar(le)?|le presto|presto a/.test(n)) tipo = "prestar"
  else if (/credito|prestamo|libranza|financiar|financiado/.test(n) && !/comprar/.test(n)) tipo = "credito"
  else if (/arriendo|arrendar|mensualidad|al mes|cada mes|plan de|gimnasio|colegio|suscrip/.test(n)) tipo = "fijo"
  else if (/cdt|invertir|inversion|ahorrar en|fondo de inversion|acciones/.test(n)) tipo = "invertir"
  else if (/abonar|abono|prepagar|pagar antes/.test(n)) tipo = "abonar"
  else if (/empen/.test(n)) tipo = "empeno"
  const am = moneyIn(t)
  const cuo = (n.match(/(\d+)\s*(cuotas|meses)/) || [])[1]
  const tasa = (t.match(/(\d+(?:[.,]\d+)?)\s*%/) || [])[1]
  const dias = (n.match(/(\d+)\s*dias/) || [])[1]
  const d: AdvisorInput = { tipo, desc: t.trim().slice(0, 80), valor: am[0]?.v || "", cuotas: cuo ? +cuo : "" }
  if (tasa) d.tasa = +tasa.replace(",", ".")
  if (tipo === "comprar") d.forma = /cuota|tarjeta|financ/.test(n) ? "cuotas" : "contado"
  if (tipo === "tarjeta") { d.valor = am[0]?.v || ""; d.pagoModo = "total" }
  if (tipo === "invertir") {
    const mm = n.match(/(\d+)\s*meses/)
    if (mm) d.dias = +mm[1] * 30
    if (dias) d.dias = +dias
    d.cuotas = ""
  }
  if (tipo === "fijo") d.cuotas = ""
  const who = t.match(/(?:a mi|a)\s+(hermano|hermana|primo|prima|t[ií]o|t[ií]a|mam[aá]|pap[aá]|amigo|amiga|hijo|hija|cuñado|cuñada|suegro|suegra|[A-ZÁÉÍÓÚ][a-záéíóú]+)/)
  if (tipo === "prestar" && who) d.persona = who[1]
  return d
}

/** Completa lo que falte y pone los valores por defecto del paso 1 → 2 (asInterpret de la v4). */
export function completeInterp(d: AdvisorInput, text: string, ea?: number | null): AdvisorInput {
  const loc = localInterp(text)
  const out: AdvisorInput = { ...d }
  if (!out.valor) out.valor = loc.valor
  if (!out.cuotas && out.tipo !== "fijo" && out.tipo !== "invertir") out.cuotas = loc.cuotas
  if (!out.tasa && loc.tasa) out.tasa = loc.tasa
  if (out.tipo === "tarjeta" && !out.tasa) out.tasa = 1.9
  if (out.tipo === "empeno" && !out.tasa) out.tasa = 4
  if (ea && !out.tasa && out.tipo !== "invertir") out.tasa = +((Math.pow(1 + ea / 100, 1 / 12) - 1) * 100).toFixed(2)
  if (ea && out.tipo === "invertir") out.ea = ea
  if (!out.modoInt) out.modoInt = out.tasa || ea ? "tasa" : out.cuotaV ? "cuota" : out.tipo === "credito" ? "tasa" : "no"
  if (out.tipo === "comprar" && !out.forma) out.forma = out.cuotas ? "cuotas" : "contado"
  return out
}

/** Frases que piden evaluar una decisión: el chat las manda al consejero. */
export const CONS_RE = /(quiero|voy a|pienso|debo|deberia|me conviene|me alcanza|estoy pensando|vale la pena|es buena idea).{0,40}(comprar|sacar|pedir|prestar|financiar|endeudar|tarjeta|credito|prestamo|arrendar|arriendo|invertir|cdt|empen|abonar|cuotas)|me alcanza para|puedo comprar|presto|prestarle/

/** Contexto financiero resumido para la IA (finCtx de la v4). */
export function finCtx(b: BookData & { fund?: { on: boolean; saldo: number } | null }, today: DateInput) {
  const trm = b.settings.trm
  const k = mkey(toDay(today))
  return {
    ingreso_mensual: Math.round(ingresoMensual(b.incomes, trm)),
    gastos_fijos_mes: Math.round(fijosMes(b.fixedExpenses)),
    cuotas_deudas_mes: Math.round(cuotasMes(b.loans, "pagar", today)),
    suscripciones_mes: Math.round(subsMes(b.subscriptions, trm)),
    gasto_variable_mes: Math.round(gastoVariableReal(b.expenses, b.categories, b.fixedExpenses, today)),
    disponible: Math.round(liquidez(b.assets, b.investments, trm, today)),
    fondo_emergencia: Math.round(b.fund?.on ? b.fund.saldo : 0),
    deudas: b.loans.filter((L) => L.kind === "pagar").map((L) => { const e = loanEngine(L, today); return { nombre: loanName(L, b.contacts, b.entities), saldo: Math.round(e.saldo), tasa_mensual: L.tasa, cuota: Math.round(e.next?.valor || 0) } }).slice(0, 8),
    te_deben: Math.round(b.loans.filter((L) => L.kind === "cobrar").reduce((a, L) => a + loanEngine(L, today).saldo, 0)),
    metas: b.goals.map((m) => ({ nombre: m.nombre, objetivo: m.objetivo, ahorrado: m.ahorrado, fecha: m.fecha })).slice(0, 6),
    hormiga_mes: Math.round(b.expenses.filter((g) => g.fecha.startsWith(k) && isHormiga(g, b.categories, b.settings.umbral)).reduce((a, g) => a + +g.valor, 0)),
  }
}
