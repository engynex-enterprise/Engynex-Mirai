// Eventos del calendario de pagos (calEvents de p_calendario.js en la v4).
import { conv, fijoPeriods, fijoValorCOP, incomePagos, inv, iso, loanEngine, loanName, subOcc, tarjetaPagoMes, type BookData } from "@/lib/domain"

export type ECatKey = "fijo" | "pagar" | "cobrar" | "ingreso" | "sub" | "tarjeta" | "cal" | "inv" | "aporte"
export const ECAT: Record<ECatKey, { n: string; color: string; icon: string; go: string }> = {
  fijo: { n: "Gastos fijos", color: "#2F6FED", icon: "house", go: "fijos" },
  pagar: { n: "Cuotas de deudas", color: "#E5484D", icon: "landmark", go: "le-debo" },
  cobrar: { n: "Cobros", color: "#16A34A", icon: "hand-coins", go: "me-deben" },
  ingreso: { n: "Ingresos", color: "#0EA5A4", icon: "arrow-down-to-line", go: "ingresos" },
  sub: { n: "Suscripciones", color: "#8E4EC6", icon: "repeat", go: "suscripciones" },
  tarjeta: { n: "Tarjetas", color: "#F97316", icon: "credit-card", go: "tarjetas" },
  cal: { n: "Calendario fiscal", color: "#A16207", icon: "calendar", go: "calendario" },
  inv: { n: "Inversiones", color: "#0891B2", icon: "trending-up", go: "inversiones" },
  aporte: { n: "Ahorro programado", color: "#3F7A1E", icon: "piggy-bank", go: "metas" },
}

export type CalEvent = {
  id: string; k: ECatKey; fecha: string; titulo: string; monto: number; dir: "pagar" | "cobrar"
  st: "ok" | "pend" | "bad"; go: string; sub?: string; rng?: string; refId?: string; per?: string
}

const fmt = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n)

export function calEvents(b: BookData, a: string, z: string, today: string, off: ECatKey[] = []): CalEvent[] {
  const out: CalEvent[] = []
  const inR = (d: string) => d >= a && d <= z
  const st = (d: string, done: boolean) => (done ? "ok" : d < today ? "bad" : "pend") as CalEvent["st"]
  const ad = new Date(a + "T12:00:00"), zd = new Date(z + "T12:00:00")
  const months: [number, number][] = []
  for (let d = new Date(ad.getFullYear(), ad.getMonth(), 1); d <= zd; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push([d.getFullYear(), d.getMonth()])

  for (const f of b.fixedExpenses) {
    const k: ECatKey = f.link_type ? "aporte" : "fijo"
    for (const [y, m] of months) for (const p of fijoPeriods(f, y, m, today)) {
      if (!inR(p.due) || (f.inicio ? p.due < f.inicio : p.due.slice(0, 7) < (f.desde ?? "0000"))) continue
      const pago = f.payments.find((x) => x.periodo === p.per)
      out.push({ id: `f-${f.id}-${p.per}`, k, fecha: p.due, titulo: f.nombre + (p.per.endsWith("Q1") ? " (1ª quinc.)" : p.per.endsWith("Q2") ? " (2ª quinc.)" : ""), monto: pago ? Number(pago.valor) : fijoValorCOP(f, p.per, b.settings.trm), dir: "pagar", st: st(p.due, !!pago), go: ECAT[k].go, refId: f.id, per: p.per, rng: f.variable && (f as { vmin?: number }).vmin ? `${fmt(conv(Number((f as { vmin?: number }).vmin), f.currency, b.settings.trm))} – ${fmt(conv(Number((f as { vmax?: number }).vmax), f.currency, b.settings.trm))}` : undefined })
    }
  }
  for (const L of b.loans) {
    const kind = L.kind === "cobrar" ? "cobrar" : "pagar"
    const e = loanEngine(L, today)
    const nm = loanName(L, b.contacts, b.entities)
    for (const h of e.hist) if (h.tipo === "cuota" && inR(h.prog)) out.push({ id: `l-${L.id}-${h.n}`, k: kind, fecha: h.prog, titulo: `${kind === "cobrar" ? "Cobro" : "Cuota"} ${h.n} · ${nm}`, monto: h.valor, dir: kind, st: "ok", go: ECAT[kind].go, sub: L.concepto, refId: L.id })
    for (const p of e.plan) if (inR(p.fecha)) out.push({ id: `l-${L.id}-${p.n}`, k: kind, fecha: p.fecha, titulo: `${kind === "cobrar" ? "Cobro" : "Cuota"} ${p.n} · ${nm}`, monto: p.valor, dir: kind, st: st(p.fecha, false), go: ECAT[kind].go, sub: L.concepto, refId: L.id })
  }
  for (const x of b.incomes) {
    for (const [y, m] of months) for (const p of incomePagos(x, y, m)) {
      if (!inR(p.fecha)) continue
      const q = p.parte === "q1" ? " (1ª quinc.)" : p.parte === "q2" ? " (2ª quinc.)" : ""
      out.push({ id: `i-${x.id}-${p.fecha}`, k: "ingreso", fecha: p.fecha, titulo: x.concepto + q, monto: conv(p.v, x.currency, b.settings.trm), dir: "cobrar", st: p.fecha <= today ? "ok" : "pend", go: "ingresos" })
    }
  }
  for (const s of b.subscriptions) for (const d of subOcc(s, ad, zd)) {
    const f = iso(d)
    out.push({ id: `s-${s.id}-${f}`, k: "sub", fecha: f, titulo: s.nombre, monto: conv(s.valor, s.currency, b.settings.trm), dir: "pagar", st: f < today ? "ok" : "pend", go: "suscripciones", refId: s.id })
  }
  const t0 = new Date(today + "T12:00:00")
  for (const c of b.creditCards) for (const [y, m] of months) {
    const f = iso(new Date(y, m, Math.min(c.pago || 15, new Date(y, m + 1, 0).getDate())))
    if (!inR(f)) continue
    const off = (y - t0.getFullYear()) * 12 + m - t0.getMonth()
    const v = tarjetaPagoMes(c, today, off)
    if (v > 0) out.push({ id: `t-${c.id}-${f}`, k: "tarjeta", fecha: f, titulo: `Pago tarjeta ${c.nombre}`, monto: v, dir: "pagar", st: st(f, false), go: "tarjetas", refId: c.id })
  }
  for (const c of b.calendarEvents as (typeof b.calendarEvents[number] & { anual?: boolean; nota?: string })[]) {
    const years = c.anual === false ? [+c.fecha.slice(0, 4)] : Array.from({ length: zd.getFullYear() - ad.getFullYear() + 1 }, (_, i) => ad.getFullYear() + i)
    for (const y of years) {
      const f = `${y}-${c.fecha.slice(5)}`
      if (inR(f)) out.push({ id: `c-${c.id}-${y}`, k: "cal", fecha: f, titulo: c.titulo, monto: Number(c.monto), dir: c.tipo === "ingreso" ? "cobrar" : "pagar", st: f < today ? "ok" : "pend", go: "calendario", sub: c.nota })
    }
  }
  for (const x of b.investments) {
    const v = inv(x, today)
    if (v.venc && inR(v.venc)) out.push({ id: `v-${x.id}`, k: "inv", fecha: v.venc, titulo: `Vence ${x.nombre}`, monto: v.final ?? x.capital, dir: "cobrar", st: v.venc < today ? "ok" : "pend", go: "inversiones" })
  }
  return out.filter((e) => !off.includes(e.k)).sort((x, y) => x.fecha.localeCompare(y.fecha) || (x.dir === "pagar" ? -1 : 1))
}

/** Archivo .ics con los pagos y cobros pendientes (−30 a +365 días), con alarma un día antes. */
export function calIcs(events: CalEvent[]) {
  const esc = (s: string) => s.replace(/[,;]/g, " ")
  const d = (s: string) => s.replace(/-/g, "")
  const next = (s: string) => { const x = new Date(s + "T12:00:00"); x.setDate(x.getDate() + 1); return iso(x).replace(/-/g, "") }
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mirai//Finanzas//ES", "CALSCALE:GREGORIAN"]
  for (const e of events.filter((x) => x.st !== "ok" && x.k !== "ingreso")) {
    lines.push("BEGIN:VEVENT", `UID:${e.id}@mirai`, `DTSTART;VALUE=DATE:${d(e.fecha)}`, `DTEND;VALUE=DATE:${next(e.fecha)}`,
      `SUMMARY:${e.dir === "pagar" ? "Pagar: " : "Cobrar: "}${esc(e.titulo)} (${fmt(e.monto)})`, `DESCRIPTION:${ECAT[e.k].n} - Mirai`,
      "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.titulo)}`, "END:VALARM", "END:VEVENT")
  }
  lines.push("END:VCALENDAR")
  return lines.join("\r\n")
}
