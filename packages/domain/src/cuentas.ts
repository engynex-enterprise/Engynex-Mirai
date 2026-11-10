// Cuentas con saldo ("el libro mayor"): el saldo de una cuenta (bancos, Nequi, efectivo) se CALCULA con lo que
// registras, en vez de escribirlo a mano. Puro: sin React, Supabase ni reloj.
//
// saldo = saldo_base + entradas − salidas desde el momento en que cuadraste la cuenta con tu banco (saldo_fecha y
// saldo_at), por los medios de pago ligados a esa cuenta (payment_methods.asset_id). Solo aplica a las cuentas con
// saldo_base; las demás siguen con su valor manual (assets.valor, que es el que lee la versión publicada).
//
// Qué mueve una cuenta (cada peso UNA sola vez):
// 1. Gastos con un medio ligado (también los que salen de pagar un fijo, "Ya se cobró" de una suscripción o una cuota
//    registrada como gasto: el gasto es el registro real de la plata que salió). Las compras con tarjeta de crédito
//    (`origen="tarjeta"`) NO mueven la cuenta: la plata sale cuando pagas la tarjeta.
// 2. Pagos de la tarjeta con un medio ligado (`card_payments`, opcional).
// 3. Cuotas y abonos de préstamos con un medio ligado (`loan_payments.payment_method_id`, opcional), salvo que ya
//    tengan su gasto (`expense_id`): Le debo sale, Me deben entra.
// 4. Ingresos extra con un medio ligado (`extra_incomes.payment_method_id`, opcional) y los pagos de tus ingresos fijos
//    que ya llegaron (`incomes.payment_method_id`, en su fecha de pago).
// 5. Abonos a metas y aportes programados: salen de la cuenta del medio y, si la meta (o el fondo) está en otra de
//    tus cuentas, entran a esa. Si están en la misma cuenta, no mueven nada (la plata no se movió).
//
// Cuándo cuenta un movimiento: si su fecha es posterior a la del cuadre (y no es futura); si es del mismo día, solo si
// se registró después de cuadrar (created_at > saldo_at). Lo que pasó antes ya estaba en el saldo de tu banco.
import { pagoDeGasto } from "./gasto-pago"
import { addMonths, iso, parseDate, toDay } from "./dates"
import { loanEngine, loanName } from "./loans"
import { conv } from "./money"
import { incomePagos } from "./reparto"
import type { AssetIn, BookData, DateInput } from "./types"

/** Medio de pago (`payment_methods`) y la cuenta a la que está ligado. */
export interface MedioIn { id: string; nombre: string; icon?: string | null; asset_id?: string | null }
/** Abono o retiro de una meta (`goal_movements`). */
export interface GoalMovIn { id: string; goal_id: string; tipo: string; valor: number | string; fecha: string; nota?: string | null; payment_method_id?: string | null; created_at?: string | null }
/** Fondo de emergencia (`emergency_funds`). */
export interface FondoIn { activo: boolean; saldo: number | string; asset_id?: string | null }

/** Cuenta o bien con lo que necesita el saldo calculado. */
export type CuentaRow = AssetIn & { id?: string; nombre?: string; saldo_base?: number | string | null; saldo_fecha?: string | null; saldo_at?: string | null }

/** Libro con lo que no viaja en `BookData` y usan las cuentas (todo opcional). */
export type LibroCuentas = BookData & { paymentMethods?: MedioIn[]; goalMovements?: GoalMovIn[]; fund?: FondoIn | null }

export interface MovCuenta {
  id: string
  fecha: string
  /** En COP: positivo entra, negativo sale. */
  v: number
  n: string
  s: string
  icon: string
  href: string
}

export interface SaldoCuenta {
  /** ¿La cuenta lleva el saldo con los movimientos? (tiene saldo_base) */
  vivo: boolean
  /** Saldo al cuadrar, en la moneda de la cuenta. */
  base: number
  /** Fecha del cuadre ('YYYY-MM-DD'). */
  desde: string | null
  /** En COP. */
  entra: number
  sale: number
  /** Saldo de hoy, en la moneda de la cuenta. */
  saldo: number
  /** Movimientos desde el cuadre, del más reciente al más antiguo. */
  movs: MovCuenta[]
  /** Ids de los medios de pago ligados. */
  medios: string[]
}

/** Cuenta de dinero (PUC 11xx: caja, bancos, billeteras): las únicas que pueden llevar el saldo solas. */
export const esCuentaDinero = (a: { cod?: string | null }) => /^11/.test(String(a.cod ?? ""))

type RawExp = { id: string; fecha: string; descripcion: string; valor: number | string; pagado?: number | string | null; pagar_el?: string | null; currency?: string | null; payment_method_id?: string | null; origen?: string | null; created_at?: string | null; fixed_expense_id?: string | null; aporte?: { t?: string; id?: string } | null }
type RawExtra = { id?: string; fecha: string; descripcion: string; valor: number | string; currency?: string | null; payment_method_id?: string | null; created_at?: string | null }
type RawLoanPay = { id?: string; payment_method_id?: string | null; expense_id?: string | null; created_at?: string | null }
type RawCardPay = { id?: string; fecha: string; valor: number | string; payment_method_id?: string | null; created_at?: string | null; deleted_at?: string | null }
type RawIncome = BookData["incomes"][number] & { payment_method_id?: string | null; created_at?: string | null }
type RawGoal = BookData["goals"][number] & { asset_id?: string | null }

const isoOf = (d: DateInput) => iso(toDay(d))
const num = (v: unknown) => Number(v ?? 0) || 0

/**
 * Saldo de todas las cuentas que lo llevan solas (las que tienen `saldo_base`), por id de la cuenta.
 * Ver las reglas arriba del archivo.
 */
export function saldosCuentas(b: LibroCuentas, today: DateInput): Map<string, SaldoCuenta> {
  const hoy = isoOf(today)
  const trm = b.settings.trm
  const out = new Map<string, SaldoCuenta>()
  const vivas = (b.assets as CuentaRow[]).filter((a) => a.id && a.saldo_base != null && a.saldo_base !== "")
  if (!vivas.length) return out
  const medios = b.paymentMethods ?? []
  const cuentaDe = new Map(medios.filter((m) => m.asset_id).map((m) => [m.id, m.asset_id as string]))
  const desdeDe = new Map<string, { f: string; at: string | null }>()
  for (const a of vivas) {
    const f = a.saldo_fecha ? isoOf(a.saldo_fecha) : hoy
    desdeDe.set(a.id!, { f, at: a.saldo_at ?? null })
    out.set(a.id!, { vivo: true, base: num(a.saldo_base), desde: f, entra: 0, sale: 0, saldo: num(a.saldo_base), movs: [], medios: medios.filter((m) => m.asset_id === a.id).map((m) => m.id) })
  }
  /** ¿El movimiento ya pasó y es posterior al cuadre de la cuenta? */
  const cuenta = (asset: string, fecha: string, created?: string | null) => {
    const d = desdeDe.get(asset)
    if (!d || fecha > hoy || fecha < d.f) return false
    if (fecha > d.f) return true
    return !!created && !!d.at && created > d.at
  }
  const add = (asset: string | null | undefined, m: MovCuenta, created?: string | null) => {
    if (!asset || !(Math.abs(m.v) > 0) || !cuenta(asset, m.fecha, created)) return
    const s = out.get(asset)!
    s.movs.push(m)
    if (m.v > 0) s.entra += m.v
    else s.sale -= m.v
  }
  const goalAsset = new Map((b.goals as RawGoal[]).map((g) => [g.id, g.asset_id ?? null]))
  const goalName = new Map(b.goals.map((g) => [g.id, g.nombre]))
  const fondoAsset = b.fund?.asset_id ?? null
  /** Cuenta donde está la meta o el fondo de un aporte (null si es ahorro apartado). */
  const destinoAporte = (e: RawExp): string | null => {
    const ap = e.aporte
    if (ap?.t === "fondo") return fondoAsset
    if (ap?.t === "meta" && ap.id) return goalAsset.get(ap.id) ?? null
    const f = e.fixed_expense_id ? b.fixedExpenses.find((x) => x.id === e.fixed_expense_id) : undefined
    if (f?.link_type === "fondo") return fondoAsset
    if (f?.link_type === "meta" && f.link_id) return goalAsset.get(f.link_id) ?? null
    return null
  }

  // 1. Gastos (sin compras con tarjeta) y aportes programados.
  for (const e of b.expenses as unknown as RawExp[]) {
    if (e.origen === "tarjeta") continue
    const from = e.payment_method_id ? cuentaDe.get(e.payment_method_id) : undefined
    const fecha = isoOf(e.fecha)
    // Solo baja lo que de verdad se pagó (un gasto por pagar o abonado no ha salido completo de la cuenta).
    const v = conv(pagoDeGasto(e).pagado, e.currency, trm)
    if (!(v > 0)) continue
    const esAporte = e.origen === "aporte" || !!e.aporte
    const to = esAporte ? destinoAporte(e) : null
    if (esAporte && from && to === from) continue
    add(from, { id: `exp:${e.id}`, fecha, v: -v, n: e.descripcion, s: esAporte ? "Aporte a tu ahorro" : "Gasto", icon: esAporte ? "piggy-bank" : "receipt", href: esAporte ? "/metas" : "/gastos" }, e.created_at)
    if (to) add(to, { id: `exp:${e.id}:entra`, fecha, v, n: e.descripcion, s: "Aporte a tu ahorro", icon: "piggy-bank", href: "/metas" }, e.created_at)
  }

  // 2. Pagos de tarjetas (opcional: tabla card_payments).
  for (const t of b.creditCards as (BookData["creditCards"][number] & { pagos?: RawCardPay[]; card_payments?: RawCardPay[] })[]) {
    for (const p of t.pagos ?? t.card_payments ?? []) {
      if (p.deleted_at || !p.payment_method_id) continue
      add(cuentaDe.get(p.payment_method_id), { id: `cardpay:${p.id ?? p.fecha}`, fecha: isoOf(p.fecha), v: -num(p.valor), n: `Pago de la tarjeta ${t.nombre}`, s: "Tarjeta de crédito", icon: "credit-card", href: "/tarjetas" }, p.created_at)
    }
  }

  // 3. Cuotas y abonos de préstamos con medio (sin los que ya tienen su gasto).
  const gastoVivo = new Set(b.expenses.map((e) => e.id))
  for (const L of b.loans) {
    const pays = L.payments as (BookData["loans"][number]["payments"][number] & RawLoanPay)[]
    if (!pays.some((p) => p.payment_method_id)) continue
    const e = loanEngine(L, today)
    const nm = loanName(L as never, b.contacts, b.entities)
    const cobrar = L.kind === "cobrar"
    for (const p of pays) {
      if (!p.payment_method_id || (p.expense_id && gastoVivo.has(p.expense_id))) continue
      const h = e.hist.find((x) => x.id === p.id)
      if (!h) continue
      add(cuentaDe.get(p.payment_method_id), {
        id: `loanpay:${p.id}`, fecha: h.fecha, v: cobrar ? h.valor : -h.valor, n: h.tipo === "cuota" ? `Cuota ${h.n} · ${nm}` : cobrar ? `Abono de ${nm}` : `Abono a ${nm}`,
        s: cobrar ? "Te pagaron" : "Pagaste", icon: cobrar ? "hand-coins" : "landmark", href: cobrar ? "/me-deben" : "/le-debo",
      }, p.created_at)
    }
  }

  // 4. Ingresos extra e ingresos fijos (en su fecha de pago, desde el cuadre hasta hoy).
  for (const x of b.extraIncomes as RawExtra[]) {
    if (!x.payment_method_id) continue
    add(cuentaDe.get(x.payment_method_id), { id: `ext:${x.id ?? x.fecha}`, fecha: isoOf(x.fecha), v: conv(num(x.valor), x.currency, trm), n: x.descripcion, s: "Ingreso extra", icon: "coins", href: "/ingresos" }, x.created_at)
  }
  const minDesde = [...desdeDe.values()].reduce((m, d) => (d.f < m ? d.f : m), hoy)
  for (const x of b.incomes as RawIncome[]) {
    const asset = x.payment_method_id ? cuentaDe.get(x.payment_method_id) : undefined
    if (!asset) continue
    const creado = x.created_at ? x.created_at.slice(0, 10) : ""
    for (let d = parseDate(`${minDesde.slice(0, 7)}-01`); iso(d) <= hoy; d = addMonths(d, 1))
      for (const p of incomePagos(x, d.getFullYear(), d.getMonth())) {
        if (creado && p.fecha < creado) continue
        add(asset, { id: `ing:${x.id}:${p.fecha}:${p.parte ?? ""}`, fecha: p.fecha, v: conv(p.v, x.currency, trm), n: x.concepto, s: "Te pagaron", icon: "briefcase", href: "/ingresos" })
      }
  }

  // 5. Abonos y retiros de metas: de la cuenta del medio a la cuenta donde está la meta.
  for (const m of b.goalMovements ?? []) {
    const from = m.payment_method_id ? cuentaDe.get(m.payment_method_id) ?? null : null
    const to = goalAsset.get(m.goal_id) ?? null
    if (from === to) continue
    const v = num(m.valor), fecha = isoOf(m.fecha), n = goalName.get(m.goal_id) ?? "Meta"
    const retiro = m.tipo === "retiro"
    const base = { fecha, n: retiro ? `Retiro de ${n}` : `Abono a ${n}`, s: "Meta de ahorro", icon: "piggy-bank", href: "/metas" }
    add(from, { ...base, id: `goalmov:${m.id}`, v: retiro ? v : -v }, m.created_at)
    add(to, { ...base, id: `goalmov:${m.id}:meta`, v: retiro ? -v : v }, m.created_at)
  }

  for (const a of vivas) {
    const s = out.get(a.id!)!
    const rate = a.currency && a.currency !== "COP" ? conv(1, a.currency, trm) || 1 : 1
    s.saldo = s.base + (s.entra - s.sale) / rate
    s.movs.sort((p, q) => (p.fecha < q.fecha ? 1 : p.fecha > q.fecha ? -1 : 0))
  }
  return out
}

/** Saldo de una cuenta. Sin `saldo_base`, el saldo es su valor manual y no lleva movimientos. */
export function saldoCuenta(a: CuentaRow, b: LibroCuentas, today: DateInput): SaldoCuenta {
  const s = a.id ? saldosCuentas({ ...b, assets: [a] }, today).get(a.id) : undefined
  return s ?? { vivo: false, base: num(a.valor), desde: null, entra: 0, sale: 0, saldo: num(a.valor), movs: [], medios: (b.paymentMethods ?? []).filter((m) => m.asset_id && m.asset_id === a.id).map((m) => m.id) }
}

/**
 * El libro con el saldo de hoy en las cuentas que lo llevan solas: `valor` pasa a ser el saldo calculado (así lo usan
 * totales, liquidez, Balance, Dashboard, Flujo, consejero y chat) y el valor del último cuadre queda en `valor_manual`.
 */
export function conSaldos<T extends LibroCuentas>(b: T, today: DateInput): T {
  const S = saldosCuentas(b, today)
  if (!S.size) return b
  return {
    ...b,
    assets: (b.assets as CuentaRow[]).map((a) => {
      const s = a.id ? S.get(a.id) : undefined
      return s ? { ...a, valor: s.saldo, valor_manual: num(a.valor), cuenta: s } : a
    }),
  }
}

export interface LineaAhorro {
  k: string
  n: string
  s: string
  v: number
  icon: string
  href: string
  /**
   * Parte de esta línea que puede estar contada dos veces: lo que guardaste sin decir de qué cuenta salió, teniendo
   * cuentas que llevan su saldo solas (el saldo de la cuenta no bajó y además suma aquí).
   */
  dudoso?: number
}

/** Movimiento del fondo de emergencia (`fund_movements`) con lo que hace falta para saber de dónde salió la plata. */
export type FondoMovIn = { tipo: string; valor: number | string; fecha: string; payment_method_id?: string | null; expense_id?: string | null }

export interface AhorroApartado {
  lineas: LineaAhorro[]
  total: number
  /** Suma de lo dudoso de todas las líneas: plata que puede estar contada dos veces en tu patrimonio. */
  dudoso: number
}

/**
 * Ahorro apartado: lo que llevas en tus metas y en tu fondo de emergencia que NO está dentro de una de tus cuentas
 * (alcancía, un bolsillo o un CDT que no registraste). Si dijiste "esta plata está en la cuenta X", ya suma en esa
 * cuenta y no se cuenta otra vez.
 *
 * `dudoso`: si tienes cuentas que llevan su saldo solas y guardaste sin decir de qué cuenta salió (ni en qué cuenta
 * está la meta), esa plata sigue dentro del saldo de la cuenta y además suma aquí: se cuenta dos veces. No se
 * descuenta sola (Mirai no adivina de dónde salió): la app lo avisa para que digas en qué cuenta está.
 * `fondoMovs`: movimientos del fondo (`fund_movements`), para la misma cuenta del fondo de emergencia.
 */
export function ahorroApartado(b: LibroCuentas, fondoMovs?: FondoMovIn[]): AhorroApartado {
  const lineas: LineaAhorro[] = []
  const hayVivas = (b.assets as CuentaRow[]).some((a) => a.id && a.saldo_base != null && a.saldo_base !== "")
  /** Lo guardado sin medio de pago (no bajó ninguna cuenta), hasta el saldo de la línea. */
  const sinOrigen = (movs: { tipo: string; valor: number | string; payment_method_id?: string | null }[], saldo: number) =>
    !hayVivas ? 0 : Math.min(saldo, movs.filter((m) => m.tipo !== "retiro" && m.tipo !== "usar" && !m.payment_method_id).reduce((a, m) => a + num(m.valor), 0))
  for (const g of b.goals as RawGoal[]) {
    const v = num(g.ahorrado)
    if (!(v > 0) || g.asset_id) continue
    const dudoso = sinOrigen((b.goalMovements ?? []).filter((m) => m.goal_id === g.id), v)
    lineas.push({ k: `goal:${g.id}`, n: g.nombre, s: "Meta de ahorro", v, icon: "target", href: "/metas", ...(dudoso > 0 ? { dudoso } : {}) })
  }
  const f = b.fund
  if (f?.activo && num(f.saldo) > 0 && !f.asset_id) {
    const v = num(f.saldo)
    // Un aporte programado ya salió como el pago de su gasto fijo (tiene `expense_id`): ese no se cuenta dos veces.
    const dudoso = sinOrigen((fondoMovs ?? []).filter((m) => !m.expense_id), v)
    lineas.push({ k: "fondo", n: "Fondo de emergencia", s: "Ahorro para imprevistos", v, icon: "umbrella", href: "/metas", ...(dudoso > 0 ? { dudoso } : {}) })
  }
  return { lineas, total: lineas.reduce((a, l) => a + l.v, 0), dudoso: lineas.reduce((a, l) => a + (l.dudoso ?? 0), 0) }
}

const normTxt = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()

/** Medios de pago que parecen de esta cuenta por el nombre ("Nequi" ↔ "Nequi / Daviplata"), para sugerirlos. */
export function mediosSugeridos(nombreCuenta: string, medios: MedioIn[]): string[] {
  const words = normTxt(nombreCuenta).split(" ").filter((w) => w.length >= 4 && !["cuenta", "ahorros", "ahorro", "corriente", "banco"].includes(w))
  if (!words.length) return []
  return medios.filter((m) => !m.asset_id && words.some((w) => normTxt(m.nombre).split(" ").includes(w))).map((m) => m.id)
}
