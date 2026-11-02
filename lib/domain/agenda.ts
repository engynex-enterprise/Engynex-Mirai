// Agenda de pagos y cobros próximos y avisos (equivalente a `agenda()` y `notifs()` de b_core.js,
// más el aviso de empeños que agrega j_loans.js en la v4).
import { days, fdate, iso, mkey, parseDate, proxDia, relTime, toDay } from "./dates"
import { tarjetaPagoMes } from "./cards"
import { fijoStatus } from "./fixed"
import { fijoValor } from "./reparto"
import { inv } from "./investments"
import { loanEngine, loanName } from "./loans"
import { conv, formatCOP as $, pct } from "./money"
import { catIcon } from "./quincena"
import { gastosMesK, hormigas } from "./totals"
import type { BookData, DateInput } from "./types"

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
}

/** Pagos y cobros: vencidos y próximos (fijos ≤ 45 días, cuotas, tarjetas, suscripciones, calendario ≤ 45 días). */
export function agenda(b: BookData, today: DateInput): AgendaItem[] {
  const t = toDay(today)
  const ti = iso(t)
  const A = +b.settings.anticipo || 5
  const items: Omit<AgendaItem, "d" | "st" | "lbl">[] = []
  for (const f of b.fixedExpenses) {
    const st = fijoStatus(f, t)
    const base = { k: "fijo" as const, id: f.id, icon: catIcon(b.categories, f.category_id), titulo: f.nombre, sub: "Gasto fijo", monto: +f.valor, dir: "pagar" as const, go: "fijos" }
    st.venc.forEach((p) => items.push({ ...base, per: p.per, fecha: p.due, monto: fijoValor(f, p.per) }))
    if (st.prox && days(t, parseDate(st.prox.due)) <= 45) items.push({ ...base, per: st.prox.per, fecha: st.prox.due, monto: fijoValor(f, st.prox.per) })
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
  for (const c of b.calendarEvents) {
    const d = parseDate(c.fecha)
    let f = new Date(t.getFullYear(), d.getMonth(), d.getDate())
    if (f < t) f = new Date(t.getFullYear() + 1, d.getMonth(), d.getDate())
    if (days(t, f) <= 45) items.push({ k: "cal", id: c.id, icon: "calendar", titulo: c.titulo, sub: "Calendario fiscal", monto: +c.monto, fecha: iso(f), dir: c.tipo === "ingreso" ? "cobrar" : "pagar", go: "calendario" })
  }
  const out: AgendaItem[] = items.map((x) => {
    const fd = parseDate(x.fecha)
    const d = days(t, fd)
    return { ...x, d, st: d < 0 ? "bad" : d <= A ? "warn" : "ok", lbl: relTime(fd, t) }
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

const ORD = { bad: 0, warn: 1, info: 2, ok: 3 } as const
const sortNotifs = (N: Notif[]) => N.sort((a, b) => ORD[a.lvl] - ORD[b.lvl] || (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))

/**
 * Avisos del libro según `settings.notif`: cobros, pagos, hormiga, presupuesto, inversiones, metas
 * y empeños. Orden: graves, advertencias, informativos y luego por fecha.
 * (El filtrado por canal —app, correo, WhatsApp— va aparte, en el módulo de notificaciones.)
 */
export function notifs(b: BookData, today: DateInput): Notif[] {
  const N: Notif[] = []
  const t = toDay(today)
  const ti = iso(t)
  const nf = b.settings.notif ?? {}
  const A = +b.settings.anticipo || 5
  for (const x of agenda(b, t)) {
    if (x.k === "cobrar") {
      if (!nf.cobros) continue
      if (x.d < 0) N.push({ id: `c:${x.id}:${x.fecha}`, lvl: "bad", icon: "hand-coins", bg: "b-red", t: `${x.titulo.replace("Cobrar cuota", "La cuota")} está atrasada`, b: `Debían pagarte ${$(x.monto)} ${x.lbl.toLowerCase()}.`, fecha: x.fecha, go: x.go })
      else if (x.d <= A) N.push({ id: `c:${x.id}:${x.fecha}`, lvl: "info", icon: "hand-coins", bg: "b-green", t: x.titulo, b: `Te deben pagar ${$(x.monto)} ${x.lbl.toLowerCase()}.`, fecha: x.fecha, go: x.go })
      continue
    }
    if (!nf.pagos) continue
    if (x.d < 0) N.push({ id: `p:${x.k}:${x.id}:${x.fecha}`, lvl: "bad", icon: x.icon, bg: "b-red", t: `Pago vencido: ${x.titulo}`, b: `${$(x.monto)} · venció ${x.lbl.toLowerCase()}.`, fecha: x.fecha, go: x.go })
    else if (x.d <= A) N.push({ id: `p:${x.k}:${x.id}:${x.fecha}`, lvl: "warn", icon: x.icon, bg: "b-amber", t: `${x.lbl}: ${x.titulo}`, b: `Ten listos ${$(x.monto)}.`, fecha: x.fecha, go: x.go })
  }
  if (nf.hormiga) {
    const H = hormigas(b, t)
    if (H.over) N.push({ id: `h:${mkey(t)}`, lvl: "warn", icon: "coffee", bg: "b-amber", t: "Los gastos hormiga se están saliendo de control", b: `Vas camino a ${$(H.proy)} este mes y tu límite es ${$(b.settings.limite)}.`, fecha: ti, go: "gastos" })
  }
  if (nf.presupuesto) {
    const k = mkey(t)
    const delMes = gastosMesK(b.expenses, k)
    for (const c of b.categories.filter((c) => c.tope > 0 && c.grupo !== "a")) {
      const r = delMes.filter((g) => g.category_id === c.id).reduce((a, g) => a + +g.valor, 0)
      if (r >= (c.tope * (+b.settings.alerta_pres || 100)) / 100)
        N.push({ id: `b:${c.id}:${k}`, lvl: "warn", icon: c.icon, bg: "b-amber", t: r > c.tope ? `Te pasaste del presupuesto en ${c.nombre}` : `Vas en el ${pct(r / c.tope, 0)} del presupuesto de ${c.nombre}`, b: `Llevas ${$(r)} de ${$(c.tope)}.`, fecha: ti, go: "presupuesto" })
    }
  }
  if (nf.inversiones)
    for (const x of b.investments) {
      const r = inv(x, t)
      if (r.venc) {
        const vd = parseDate(r.venc)
        const dd = days(t, vd)
        if (dd >= 0 && dd <= 10) N.push({ id: `i:${x.id}`, lvl: "info", icon: "trending-up", bg: "b-teal", t: `Tu ${x.nombre} vence ${relTime(vd, t).toLowerCase()}`, b: `Recibirás cerca de ${$(r.final)}. Decide si lo renuevas.`, fecha: r.venc, go: "inversiones" })
      }
    }
  if (nf.metas)
    for (const m of b.goals) {
      if (!m.fecha) continue
      const dd = days(t, parseDate(m.fecha))
      if (dd >= 0 && dd <= 30 && m.ahorrado < m.objetivo) N.push({ id: `m:${m.id}`, lvl: "info", icon: "target", bg: "b-violet", t: `Tu meta "${m.nombre}" vence pronto`, b: `Te faltan ${$(m.objetivo - m.ahorrado)} y quedan ${dd} días.`, fecha: iso(parseDate(m.fecha)), go: "metas" })
    }
  sortNotifs(N)
  // Empeños / garantías con fecha límite a 15 días o menos (j_loans.js).
  const conPrenda = [...b.loans.filter((L) => L.kind === "pagar"), ...b.loans.filter((L) => L.kind === "cobrar")]
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
