// Agenda de pagos y cobros próximos y avisos (equivalente a `agenda()` y `notifs()` de b_core.js,
// más el aviso de empeños que agrega j_loans.js en la v4).
// Propio de la v5: recordatorios de una sola vez (`anual: false`), eventos de ingreso como "te llega",
// corte y cupo de tarjetas, fechas DIAN por cédula, mesadas, compartidos e interruptor propio de empeños.
import { addDays, addMonths, days, fdate, iso, mkey, nextOcc, parseDate, proxDia, relTime, toDay } from "./dates"
import { tarjetaPagoMes, tarjetasDeuda } from "./cards"
import { fijoStatus } from "./fixed"
import { fijoValorCOP } from "./reparto"
import { inv } from "./investments"
import { loanEngine, loanName } from "./loans"
import { conv, formatCOP as $, pct } from "./money"
import { catIcon } from "./quincena"
import { balancesGrupo, type SharedExpenseIn } from "./shared"
import { gastosMesK, hormigas } from "./totals"
import type { BookData, CalendarEventIn, DateInput, NotifFlags } from "./types"

export type AgendaKind = "fijo" | "pagar" | "cobrar" | "tarjeta" | "sub" | "cal"

export interface AgendaItem {
  k: AgendaKind
  id: string
  /** Periodo del gasto fijo. */
  per?: string
  icon: string
  titulo: string
  sub: string
  monto: number
  fecha: string
  dir: "pagar" | "cobrar"
  /** Vista a la que lleva. */
  go: string
  /** Días que faltan (negativo = vencido). */
  d: number
  st: "bad" | "warn" | "ok"
  lbl: string
  /** Nota del evento del calendario (se usa como texto del aviso cuando no tiene monto). */
  nota?: string
  /** Días de anticipo propios de este ítem (gasto fijo); sin él, el del libro. */
  aviso?: number
}

/** Pagos y cobros: vencidos y próximos (fijos ≤ 45 días, cuotas, tarjetas, suscripciones, calendario ≤ 45 días). */
export function agenda(b: BookData, today: DateInput): AgendaItem[] {
  const t = toDay(today)
  const ti = iso(t)
  const A = +b.settings.anticipo || 5
  const items: Omit<AgendaItem, "d" | "st" | "lbl">[] = []
  for (const f of b.fixedExpenses) {
    const st = fijoStatus(f, t, b.settings.trm)
    // Un fijo en USD o EUR se convierte con la TRM del libro: la agenda, Inicio y los avisos siempre hablan en pesos.
    const base = { k: "fijo" as const, id: f.id, icon: catIcon(b.categories, f.category_id), titulo: f.nombre, sub: "Gasto fijo", monto: conv(f.valor, f.currency, b.settings.trm), dir: "pagar" as const, go: "fijos", ...(f.aviso == null ? {} : { aviso: +f.aviso }) }
    // Con abonos, lo que falta del periodo (no el valor completo).
    st.venc.forEach((p) => items.push({ ...base, per: p.per, fecha: p.due, monto: p.parcial ? p.falta : fijoValorCOP(f, p.per, b.settings.trm) }))
    if (st.prox && days(t, parseDate(st.prox.due)) <= 45) items.push({ ...base, per: st.prox.per, fecha: st.prox.due, monto: st.prox.parcial ? st.prox.falta : fijoValorCOP(f, st.prox.per, b.settings.trm) })
  }
  for (const L of b.loans.filter((L) => L.kind === "pagar")) {
    const e = loanEngine(L, t)
    const nm = loanName(L, b.contacts, b.entities)
    ;(e.vencidas.length ? e.vencidas : [e.next]).filter((r) => !!r).slice(0, 3).forEach((r) =>
      items.push({ k: "pagar", id: L.id ?? "", icon: "landmark", titulo: `Cuota ${r!.n} · ${nm}`, sub: L.concepto || "Crédito", monto: r!.valor, fecha: r!.fecha, dir: "pagar", go: "le-debo" }),
    )
    if (e.vencidas.length && e.next && e.next.fecha >= ti)
      items.push({ k: "pagar", id: L.id ?? "", icon: "landmark", titulo: `Cuota ${e.next.n} · ${nm}`, sub: L.concepto ?? "", monto: e.next.valor, fecha: e.next.fecha, dir: "pagar", go: "le-debo" })
  }
  for (const L of b.loans.filter((L) => L.kind === "cobrar")) {
    const e = loanEngine(L, t)
    if (e.next) items.push({ k: "cobrar", id: L.id ?? "", icon: "hand-coins", titulo: `Cobrar cuota ${e.next.n} · ${loanName(L, b.contacts, b.entities)}`, sub: L.concepto || "Préstamo", monto: e.next.valor, fecha: e.next.fecha, dir: "cobrar", go: "me-deben" })
  }
  for (const c of b.creditCards) {
    const pm = tarjetaPagoMes(c, t)
    if (pm > 0) items.push({ k: "tarjeta", id: c.id, icon: "credit-card", titulo: "Tarjeta " + c.nombre, sub: "Pago mínimo de la tarjeta", monto: pm, fecha: iso(proxDia(+c.pago || 15, t)), dir: "pagar", go: "tarjetas" })
  }
  for (const s of b.subscriptions)
    items.push({ k: "sub", id: s.id, icon: "repeat", titulo: s.nombre, sub: "Suscripción " + s.ciclo, monto: conv(s.valor, s.currency, b.settings.trm), fecha: iso(parseDate(s.proximo)), dir: "pagar", go: "suscripciones" })
  // Calendario: los anuales se repiten cada año; los de una sola vez (`anual: false`) solo en su fecha y nunca vencidos.
  for (const c of b.calendarEvents) {
    const f = parseDate(nextOcc(c, t, 0))
    const d = days(t, f)
    if (d < 0 || d > 45) continue
    const dian = c.template_key === DIAN_KEY
    items.push({ k: "cal", id: c.id, icon: dian ? "landmark" : "calendar", titulo: c.titulo, sub: dian ? "Calendario DIAN" : "Calendario fiscal", monto: +c.monto || 0, fecha: iso(f), dir: c.tipo === "ingreso" ? "cobrar" : "pagar", go: "calendario", ...(c.nota ? { nota: c.nota } : {}) })
  }
  const out: AgendaItem[] = items.map((x) => {
    const fd = parseDate(x.fecha)
    const d = days(t, fd)
    // Un gasto fijo puede tener sus propios días de aviso (el predial 15, el arriendo 5); sin él, el del libro.
    const av = x.aviso ?? A
    return { ...x, d, st: d < 0 ? "bad" : d <= av ? "warn" : "ok", lbl: relTime(fd, t) }
  })
  return out.sort((p, q) => (p.fecha < q.fecha ? -1 : p.fecha > q.fecha ? 1 : 0))
}

export interface Notif {
  id: string
  lvl: "bad" | "warn" | "info" | "ok"
  icon: string
  /** Clase de color del ícono. */
  bg: string
  /** Título. */
  t: string
  /** Cuerpo. */
  b: string
  fecha: string
  go: string
}

/** ¿Está encendido este tipo de aviso? Sin dato = encendido (igual que el interruptor de Ajustes › Alertas). */
export const avisoOn = (nf: NotifFlags | null | undefined, k: keyof NotifFlags) => nf?.[k] !== false

/** Mesada de un miembro del hogar (`allowances`) con la fecha de su última entrega. */
export interface MesadaAviso { id: string; nombre: string; mesada: number; frec: string; ultima: string | null }
/** Grupo de gastos compartidos con el saldo de quien recibe el aviso (+ le deben, − debe). */
export interface CompartidoAviso { id: string; nombre: string; saldo: number }
/** Datos que no vienen en el libro (`loadBookData`) y que el servidor carga aparte para los avisos. */
export interface AvisoExtras { mesadas?: MesadaAviso[]; compartidos?: CompartidoAviso[] }
export interface NotifOpts {
  /** Interruptores de la persona (notification_rules.notif) que se aplican sobre los del libro. */
  notif?: NotifFlags | null
  extras?: AvisoExtras
}

/** Próxima entrega de una mesada: la última + una semana, una quincena (15 días) o un mes. */
export function mesadaToca(m: Pick<MesadaAviso, "frec" | "ultima">): string | null {
  if (!m.ultima) return null
  const u = parseDate(m.ultima)
  return iso(m.frec === "mensual" ? addMonths(u, 1) : addDays(u, m.frec === "quincenal" ? 15 : 7))
}

/** Saldo de una persona en un grupo (la busca por nombre o primer nombre, sin mayúsculas). */
export function miSaldoGrupo(personas: string[], gastos: SharedExpenseIn[], nombre: string): number | null {
  const n = nombre.trim().toLowerCase()
  if (!n) return null
  const first = n.split(/\s+/)[0]
  const yo = personas.find((p) => p.trim().toLowerCase() === n) ?? personas.find((p) => p.trim().toLowerCase() === first) ?? personas.find((p) => p.trim().toLowerCase().split(/\s+/)[0] === first)
  if (!yo) return null
  return balancesGrupo(personas, gastos).b[yo] ?? 0
}

/** Clave de las fechas DIAN que Mirai pone sola según la cédula (eventos virtuales: no se guardan en la base). */
export const DIAN_KEY = "renta_auto"

/** Fila de `ref_renta_calendar` (y regímenes especiales de `ref_renta_regimenes`). */
export interface RentaFecha { year: number; digitos?: string; regimen: string; fecha: string }
export interface RentaRegimen { key: string; nombre: string; seccionales: string[] }

/**
 * Fechas DIAN de la declaración de renta según los dos últimos dígitos de la cédula, como eventos de calendario virtuales
 * (`dian:<año>`). Usa el plazo especial solo si la ciudad del perfil está en sus seccionales. Si el libro ya tiene la renta
 * en el calendario (la agregó la persona) no se repite.
 */
export function fechasDian(o: { digitos: string | null | undefined; filas: RentaFecha[]; regimenes?: RentaRegimen[]; ciudad?: string | null; eventos?: Pick<CalendarEventIn, "template_key">[] }): CalendarEventIn[] {
  const dig = String(o.digitos ?? "")
  if (!/^\d{2}$/.test(dig) || (o.eventos ?? []).some((e) => e.template_key === "renta")) return []
  const ciudad = String(o.ciudad ?? "").toLowerCase()
  const out: CalendarEventIn[] = []
  const filas = o.filas.filter((f) => !f.digitos || f.digitos === dig)
  for (const y of [...new Set(filas.map((f) => +f.year))].sort()) {
    const gen = filas.find((f) => +f.year === y && f.regimen === "general")
    const esp = filas.find((f) => +f.year === y && f.regimen !== "general" && ciudad && (o.regimenes ?? []).find((r) => r.key === f.regimen)?.seccionales.some((s) => ciudad.includes(s.toLowerCase())))
    const f = esp ?? gen
    if (!f) continue
    const reg = esp ? (o.regimenes ?? []).find((r) => r.key === esp.regimen) : null
    out.push({
      id: `dian:${y}`, titulo: "Declaración de renta (DIAN)", fecha: String(f.fecha).slice(0, 10), tipo: "egreso", monto: 0, anual: false, template_key: DIAN_KEY,
      nota: `Plazo para tu cédula terminada en ${dig}${reg ? ` (${reg.nombre})` : ""}, si te toca declarar.`,
    })
  }
  return out
}

/** El libro con las fechas DIAN de la persona dentro del calendario (para agenda y avisos). */
export const conFechasDian = <B extends BookData>(b: B, eventos: CalendarEventIn[]): B => (eventos.length ? { ...b, calendarEvents: [...b.calendarEvents, ...eventos] } : b)

const ORD = { bad: 0, warn: 1, info: 2, ok: 3 } as const
const sortNotifs = (N: Notif[]) => N.sort((a, b) => ORD[a.lvl] - ORD[b.lvl] || (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))

/**
 * Avisos del libro según `settings.notif` (y los interruptores de la persona en `o.notif`): cobros, pagos, hormiga,
 * presupuesto, inversiones, metas, empeños, tarjetas, mesadas y compartidos. Un tipo sin dato está encendido.
 * Orden: graves, advertencias, informativos y luego por fecha.
 * (El filtrado por canal —app, correo, WhatsApp— va aparte, en el módulo de notificaciones.)
 */
export function notifs(b: BookData, today: DateInput, o: NotifOpts = {}): Notif[] {
  const N: Notif[] = []
  const t = toDay(today)
  const ti = iso(t)
  const nf: NotifFlags = { ...(b.settings.notif ?? {}), ...(o.notif ?? {}) }
  const on = (k: keyof NotifFlags) => avisoOn(nf, k)
  const Ag = +b.settings.anticipo || 5
  for (const x of agenda(b, t)) {
    // Un gasto fijo puede tener sus propios días de aviso (el predial 15, el arriendo 5).
    const A = x.aviso ?? Ag
    // Fechas de ingreso del calendario (prima, cesantías…): te llega, no "ten listos".
    if (x.k === "cal" && x.dir === "cobrar") {
      if (!on("cobros") || x.d > A) continue
      N.push({ id: `c:cal:${x.id}:${x.fecha}`, lvl: "info", icon: "arrow-down-to-line", bg: "b-green", t: `${x.lbl}: te llega ${x.titulo.charAt(0).toLowerCase()}${x.titulo.slice(1)}`, b: x.monto > 0 ? `Te deben pagar cerca de ${$(x.monto)}.` : (x.nota ?? "Revisa que te llegue completo."), fecha: x.fecha, go: x.go })
      continue
    }
    if (x.k === "cobrar") {
      if (!on("cobros")) continue
      if (x.d < 0) N.push({ id: `c:${x.id}:${x.fecha}`, lvl: "bad", icon: "hand-coins", bg: "b-red", t: `${x.titulo.replace("Cobrar cuota", "La cuota")} está atrasada`, b: `Debían pagarte ${$(x.monto)} ${x.lbl.toLowerCase()}.`, fecha: x.fecha, go: x.go })
      else if (x.d <= A) N.push({ id: `c:${x.id}:${x.fecha}`, lvl: "info", icon: "hand-coins", bg: "b-green", t: x.titulo, b: `Te deben pagar ${$(x.monto)} ${x.lbl.toLowerCase()}.`, fecha: x.fecha, go: x.go })
      continue
    }
    if (!on("pagos")) continue
    if (x.d < 0) N.push({ id: `p:${x.k}:${x.id}:${x.fecha}`, lvl: "bad", icon: x.icon, bg: "b-red", t: `Pago vencido: ${x.titulo}`, b: `${$(x.monto)} · venció ${x.lbl.toLowerCase()}.`, fecha: x.fecha, go: x.go })
    else if (x.d <= A) N.push({ id: `p:${x.k}:${x.id}:${x.fecha}`, lvl: "warn", icon: x.icon, bg: "b-amber", t: `${x.lbl}: ${x.titulo}`, b: x.k === "cal" && x.monto <= 0 ? (x.nota ?? "Revisa cuánto te toca pagar.") : `Ten listos ${$(x.monto)}.`, fecha: x.fecha, go: x.go })
  }
  if (on("hormiga")) {
    const H = hormigas(b, t)
    if (H.over) N.push({ id: `h:${mkey(t)}`, lvl: "warn", icon: "coffee", bg: "b-amber", t: H.pasado ? "Pasaste tu límite de gastos hormiga" : "Los gastos hormiga se están saliendo de control", b: H.pasado ? `Llevas ${$(H.totalMes)} este mes y tu límite es ${$(b.settings.limite)}.` : `Llevas ${$(H.totalMes)} y vas camino a ${$(H.proy)} este mes; tu límite es ${$(b.settings.limite)}.`, fecha: ti, go: "gastos" })
  }
  if (on("presupuesto")) {
    const k = mkey(t)
    const delMes = gastosMesK(b.expenses, k)
    for (const c of b.categories.filter((c) => c.tope > 0 && c.grupo !== "a")) {
      const r = delMes.filter((g) => g.category_id === c.id).reduce((a, g) => a + +g.valor, 0)
      if (r >= (c.tope * (+b.settings.alerta_pres || 100)) / 100)
        N.push({ id: `b:${c.id}:${k}`, lvl: "warn", icon: c.icon, bg: "b-amber", t: r > c.tope ? `Te pasaste del presupuesto en ${c.nombre}` : `Vas en el ${pct(r / c.tope, 0)} del presupuesto de ${c.nombre}`, b: `Llevas ${$(r)} de ${$(c.tope)}.`, fecha: ti, go: "presupuesto" })
    }
  }
  if (on("inversiones"))
    for (const x of b.investments) {
      const r = inv(x, t)
      if (r.venc) {
        const vd = parseDate(r.venc)
        const dd = days(t, vd)
        if (dd >= 0 && dd <= 10) N.push({ id: `i:${x.id}:${r.venc}`, lvl: "info", icon: "trending-up", bg: "b-teal", t: `Tu ${x.nombre} vence ${relTime(vd, t).toLowerCase()}`, b: `Recibirás cerca de ${$(r.final)}. Decide si lo renuevas.`, fecha: r.venc, go: "inversiones" })
      }
    }
  if (on("metas"))
    for (const m of b.goals) {
      if (!m.fecha) continue
      const dd = days(t, parseDate(m.fecha))
      if (dd >= 0 && dd <= 30 && m.ahorrado < m.objetivo) N.push({ id: `m:${m.id}:${iso(parseDate(m.fecha))}`, lvl: "info", icon: "target", bg: "b-violet", t: `Tu meta "${m.nombre}" vence pronto`, b: `Te faltan ${$(m.objetivo - m.ahorrado)} y quedan ${dd} días.`, fecha: iso(parseDate(m.fecha)), go: "metas" })
    }
  // Tarjetas: el corte llega (lo que compres después se cobra un mes más tarde) y el uso del cupo pasa del 30 %.
  if (on("tarjetas"))
    for (const c of b.creditCards) {
      const deuda = tarjetasDeuda([c], t)
      if (deuda <= 0) continue
      const corte = proxDia(+c.corte || 25, t)
      const dd = days(t, corte)
      if (dd <= 2) N.push({ id: `t:corte:${c.id}:${iso(corte)}`, lvl: "info", icon: "credit-card", bg: "b-blue", t: dd === 0 ? `Hoy es el corte de tu tarjeta ${c.nombre}` : `${relTime(corte, t)}: corte de tu tarjeta ${c.nombre}`, b: `Lo que compres después del corte se cobra un mes más tarde. Hoy debes ${$(deuda)}.`, fecha: iso(corte), go: "tarjetas" })
      const cupo = +(c.cupo ?? 0)
      const u = cupo > 0 ? deuda / cupo : 0
      if (u >= 0.3) {
        const nivel = u >= 0.8 ? 80 : u >= 0.5 ? 50 : 30
        N.push({ id: `t:cupo:${c.id}:${mkey(t)}:${nivel}`, lvl: u >= 0.8 ? "warn" : "info", icon: "credit-card", bg: u >= 0.8 ? "b-amber" : "b-blue", t: `Tu tarjeta ${c.nombre} va en el ${pct(u, 0)} del cupo`, b: `Debes ${$(deuda)} de ${$(cupo)}. Usar menos del 30 % del cupo cuida tu historial en las centrales de riesgo.`, fecha: ti, go: "tarjetas" })
      }
    }
  // Mesadas: toca entregarla (la última entrega + su frecuencia).
  if (on("mesadas"))
    for (const m of o.extras?.mesadas ?? []) {
      const f = mesadaToca(m)
      if (!f || f > ti || !(+m.mesada > 0)) continue
      N.push({ id: `ms:${m.id}:${f}`, lvl: "info", icon: "piggy-bank", bg: "b-blue", t: f < ti ? `Mesada pendiente: ${m.nombre}` : `Hoy toca la mesada de ${m.nombre}`, b: `${$(+m.mesada)} · la última se la diste el ${fdate(parseDate(m.ultima!))}.`, fecha: f, go: "mesadas" })
    }
  // Compartidos: lo que te deben o debes en cada grupo (un aviso por grupo y mes).
  if (on("compartidos"))
    for (const g of o.extras?.compartidos ?? []) {
      if (Math.abs(g.saldo) <= 1) continue
      const teDeben = g.saldo > 0
      N.push({ id: `sg:${g.id}:${mkey(t)}:${teDeben ? "+" : "-"}`, lvl: "info", icon: "split", bg: teDeben ? "b-green" : "b-amber", t: teDeben ? `En “${g.nombre}” te deben ${$(g.saldo)}` : `En “${g.nombre}” debes ${$(-g.saldo)}`, b: teDeben ? "En Compartidos ves quién te tiene que pagar." : "En Compartidos ves a quién pagarle para quedar a paz y salvo.", fecha: ti, go: "compartidos" })
    }
  sortNotifs(N)
  // Empeños / garantías con fecha límite a 15 días o menos (j_loans.js). Interruptor propio (antes seguía a "pagos").
  const conPrenda = on("empenos") ? [...b.loans.filter((L) => L.kind === "pagar"), ...b.loans.filter((L) => L.kind === "cobrar")] : []
  for (const L of conPrenda) {
    const p = L.prenda
    if (!p || !p.limite) continue
    const e = loanEngine(L, t)
    if (e.done) continue
    const lim = parseDate(p.limite)
    const dd = days(t, lim)
    if (dd > 15) continue
    const isC = L.kind === "cobrar"
    N.push({
      id: `pr:${L.id}:${p.limite}`, lvl: dd < 0 ? "bad" : "warn", icon: "gem", bg: dd < 0 ? "b-red" : "b-amber",
      t: dd < 0 ? `Venció el plazo del empeño: ${p.obj}` : `${isC ? "Plazo de la garantía" : "Recupera tu empeño"}: ${p.obj}`,
      b: dd < 0 ? `La fecha límite fue el ${fdate(lim)}.` : `Quedan ${dd} días (hasta el ${fdate(lim)}). Saldo: ${$(e.saldo)}.`,
      fecha: iso(lim), go: isC ? "me-deben" : "le-debo",
    })
  }
  return sortNotifs(N)
}
