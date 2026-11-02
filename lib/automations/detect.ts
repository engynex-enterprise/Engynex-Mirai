// Cuándo se dispara cada automatización: eventos de la cola (gasto, ingreso, pago), fechas programadas y estados del
// libro (presupuesto, pagos próximos, fondo bajo, metas, día de pago). Puro: recibe el libro y "hoy".
import { agenda } from "@/lib/domain/agenda"
import { lastDay, mkey } from "@/lib/domain/dates"
import { isHormiga } from "@/lib/domain/hormiga"
import { formatCOP } from "@/lib/domain/money"
import { quincena } from "@/lib/domain/quincena"
import { incomePagos, quincenaDeDia } from "@/lib/domain/reparto"
import { metaFondo, payDays } from "@/lib/domain/savings"
import { gastosBasicos, gastosMesK } from "@/lib/domain/totals"
import type { BookData } from "@/lib/domain/types"
import { addDaysIso } from "./engine"
import type { EventData, FlowNode, TriggerEvent } from "./types"

const day = (hoy: string) => new Date(`${hoy}T12:00:00`)
const num = (v: unknown) => Number(v ?? 0) || 0

/** Datos extra del libro que no están en BookData. */
export type BookExtras = { fondo: { activo: boolean; saldo: number } }

/** Fila de la cola de eventos (automation_events). */
export type QueuedEvent = { id: string; tipo: "gasto" | "ingreso" | "pago_fijo" | string; tabla: string; row_id: string | null; datos: Record<string, unknown> }

/** Resumen de la semana en una frase (para el aviso de los lunes). */
export function resumenSemana(b: BookData, hoy: string): string {
  const desde = addDaysIso(hoy, -7)
  const g = b.expenses.filter((e) => e.fecha > desde && e.fecha <= hoy)
  const total = g.reduce((a, e) => a + num(e.valor), 0)
  const porCat = new Map<string, number>()
  for (const e of g) porCat.set(e.category_id ?? "", (porCat.get(e.category_id ?? "") ?? 0) + num(e.valor))
  const top = [...porCat.entries()].sort((a, c) => c[1] - a[1])[0]
  const topName = top && (b.categories.find((c) => c.id === top[0])?.nombre ?? "Sin categoría")
  const d = day(hoy)
  const disp = quincena(b, d.getFullYear(), d.getMonth(), "mes", hoy).disp
  if (!g.length) return `En los últimos 7 días no registraste gastos. Este mes te quedan cerca de ${formatCOP(disp)}.`
  return `En los últimos 7 días gastaste ${formatCOP(total)} en ${g.length} movimiento${g.length === 1 ? "" : "s"}; lo que más: ${topName} (${formatCOP(top![1])}). Este mes te quedan cerca de ${formatCOP(disp)}.`
}

/** Gastos fijos sin pagar e ingresos de la quincena de hoy. */
export function datosQuincena(b: BookData, hoy: string) {
  const d = day(hoy)
  const which = quincenaDeDia(d.getDate(), num(b.settings.corte_q) || 15)
  const q = quincena(b, d.getFullYear(), d.getMonth(), which, hoy)
  const fijos = q.sal.filter((s) => s.s.startsWith("Gasto fijo") && !s.paid).reduce((a, s) => a + s.v, 0)
  const ingreso = b.incomes.flatMap((x) => incomePagos(x, d.getFullYear(), d.getMonth())).filter((p) => p.fecha >= q.a && p.fecha <= q.b).reduce((a, p) => a + num(p.v), 0)
  return { which, fijos: Math.round(fijos), ingreso: Math.round(ingreso), disponible: Math.round(q.disp) }
}

/** Variables comunes a cualquier evento (resumen, fijos de la quincena…). */
export function baseData(b: BookData, hoy: string): EventData {
  const q = datosQuincena(b, hoy)
  return { fecha: hoy, corte_q: num(b.settings.corte_q) || 15, resumen: resumenSemana(b, hoy), fijos: q.fijos, ingreso: q.ingreso, disponible: formatCOP(q.disponible) }
}

/**
 * ¿Toca correr hoy (y a esta hora) una automatización programada? Con el cron diario (`daily`) no se mira la hora.
 * La clave es por día: corre como máximo una vez al día.
 */
export function scheduledEvent(trigger: FlowNode, b: BookData, now: { hoy: string; hora: number; daily?: boolean }): TriggerEvent | null {
  if (trigger.kind !== "programado") return null
  const d = trigger.data
  if (!now.daily && now.hora < num(d.hora)) return null
  const t = day(now.hoy)
  const dia = t.getDate()
  const ld = lastDay(t.getFullYear(), t.getMonth())
  const corte = Math.min(Math.max(num(b.settings.corte_q) || 15, 1), 27)
  let toca = false
  let monto: number | undefined
  if (d.frecuencia === "diario") toca = true
  else if (d.frecuencia === "semanal") toca = t.getDay() === num(d.dia_semana)
  else if (d.frecuencia === "mensual") toca = dia === Math.min(num(d.dia_mes) || 1, ld)
  else if (d.frecuencia === "quincena") toca = dia === corte || dia === ld
  else if (d.frecuencia === "dia_pago") {
    if (!b.incomes.length) return null
    const pd = payDays(b.incomes)
    const dias = (pd.frec === "quincenal" ? [pd.dia, pd.dia2] : [pd.dia]).map((x) => Math.min(x, ld))
    toca = dias.includes(dia)
  }
  if (!toca) return null
  const base = baseData(b, now.hoy)
  if (d.frecuencia === "quincena" || d.frecuencia === "dia_pago") {
    const hoyPagos = b.incomes.flatMap((x) => incomePagos(x, t.getFullYear(), t.getMonth())).filter((p) => p.fecha === now.hoy).reduce((a, p) => a + num(p.v), 0)
    monto = d.frecuencia === "dia_pago" ? Math.round(hoyPagos) : num(base.ingreso)
  }
  return { kind: "programado", clave: `prog:${now.hoy}`, hoy: now.hoy, data: { ...base, ...(monto !== undefined ? { monto, descripcion: d.frecuencia === "dia_pago" ? "Día de pago" : "Quincena" } : {}) } }
}

/** Eventos por el estado del libro (se revisan en el cron y después de cada movimiento). Claves por periodo: sin repetidos. */
export function stateEvents(trigger: FlowNode, b: BookData, hoy: string, extras: BookExtras): TriggerEvent[] {
  const d = trigger.data
  const base = () => baseData(b, hoy)
  const out: TriggerEvent[] = []
  const k = mkey(day(hoy))
  if (trigger.kind === "presupuesto") {
    const delMes = gastosMesK(b.expenses, k)
    for (const c of b.categories.filter((c) => num(c.tope) > 0 && c.grupo !== "a" && (!d.category_id || c.id === d.category_id))) {
      const spent = delMes.filter((g) => g.category_id === c.id).reduce((a, g) => a + num(g.valor), 0)
      const p = (spent / num(c.tope)) * 100
      if (p >= num(d.pct)) out.push({ kind: "presupuesto", clave: `pres:${c.id}:${k}:${num(d.pct)}`, hoy, data: { ...base(), monto: spent, descripcion: c.nombre, category_id: c.id, pct: Math.round(p), tope: formatCOP(num(c.tope)) } })
    }
  }
  if (trigger.kind === "pago_proximo") {
    const tipos = Array.isArray(d.tipos) ? (d.tipos as string[]) : []
    for (const x of agenda(b, hoy)) {
      if (x.dir !== "pagar" || !tipos.includes(x.k) || x.d < 0 || x.d > num(d.dias)) continue
      out.push({ kind: "pago_proximo", clave: `pago:${x.k}:${x.id}:${x.fecha}`, hoy, data: { ...base(), monto: Math.round(x.monto), descripcion: x.titulo, pago: x.titulo, fecha: x.fecha, dias: x.d, cuando: x.lbl.toLowerCase() } })
    }
  }
  if (trigger.kind === "saldo_bajo") {
    if (d.tipo === "disponible") {
      const t = day(hoy)
      const disp = quincena(b, t.getFullYear(), t.getMonth(), "mes", hoy).disp
      if (disp < num(d.valor)) out.push({ kind: "saldo_bajo", clave: `disp:${k}`, hoy, data: { ...base(), monto: Math.round(disp), descripcion: "Lo que te queda del mes" } })
    } else if (extras.fondo.activo) {
      const meta = metaFondo(gastosBasicos(b, hoy), num(b.settings.emerg_meta) || 3)
      const saldo = num(extras.fondo.saldo)
      if (meta > 0 && saldo < (meta * num(d.pct)) / 100)
        out.push({ kind: "saldo_bajo", clave: `fondo:${k}`, hoy, data: { ...base(), monto: saldo, descripcion: "Fondo de emergencia", pct: Math.round((saldo / meta) * 100), meta: formatCOP(meta) } })
    }
  }
  if (trigger.kind === "meta_alcanzada") {
    for (const g of b.goals.filter((g) => num(g.objetivo) > 0 && num(g.ahorrado) >= num(g.objetivo) && (!d.goal_id || g.id === d.goal_id)))
      out.push({ kind: "meta_alcanzada", clave: `meta:${g.id}`, hoy, data: { ...base(), monto: num(g.ahorrado), descripcion: g.nombre, meta: g.nombre } })
  }
  if (trigger.kind === "ingreso" && d.fuente !== "extras") {
    const t = day(hoy)
    for (const i of b.incomes)
      for (const p of incomePagos(i, t.getFullYear(), t.getMonth()).filter((p) => p.fecha === hoy && num(p.v) > 0))
        out.push({ kind: "ingreso", clave: `ing:${i.id}:${hoy}`, hoy, data: { ...base(), monto: Math.round(num(p.v)), descripcion: i.concepto, member_id: i.member_id ?? null, category_id: null, tabla: "incomes" } })
  }
  return out
}

/** Convierte un evento de la cola en el evento de una automatización (o null si no le corresponde). */
export function queuedEventFor(trigger: FlowNode, q: QueuedEvent, b: BookData, hoy: string): TriggerEvent | null {
  const x = q.datos
  const data: EventData = {
    ...baseData(b, hoy),
    monto: num(x.valor),
    descripcion: String(x.descripcion ?? ""),
    category_id: (x.category_id as string | null) ?? null,
    member_id: (x.member_id as string | null) ?? null,
    fecha: String(x.fecha ?? hoy),
    row_id: q.row_id,
    tabla: q.tabla,
  }
  const ev = (kind: TriggerEvent["kind"]): TriggerEvent => ({ kind, clave: `ev:${q.id}`, hoy, data })
  if (q.tipo === "gasto" && trigger.kind === "gasto") return ev("gasto")
  if (q.tipo === "gasto" && trigger.kind === "hormiga") {
    const g = { id: q.row_id ?? "", fecha: data.fecha!, descripcion: data.descripcion!, valor: num(x.valor), category_id: data.category_id, hormiga: x.hormiga === true, hormiga_src: null }
    return isHormiga(g, b.categories, num(b.settings.umbral)) ? ev("hormiga") : null
  }
  if (q.tipo === "ingreso" && trigger.kind === "ingreso" && trigger.data.fuente !== "nomina") return ev("ingreso")
  if (q.tipo === "pago_fijo" && trigger.kind === "pago_fijo") return ev("pago_fijo")
  return null
}

/** Evento de ejemplo para "Probar": usa el último movimiento real del libro o datos de muestra. */
export function sampleEvent(trigger: FlowNode, b: BookData, hoy: string, extras: BookExtras): TriggerEvent {
  const base = baseData(b, hoy)
  const real = (): TriggerEvent | null => {
    if (trigger.kind === "programado") return { kind: "programado", clave: "prueba", hoy, data: { ...base, ...(["quincena", "dia_pago"].includes(String(trigger.data.frecuencia)) ? { monto: num(base.ingreso), descripcion: "Quincena" } : {}) } }
    if (trigger.kind === "gasto" || trigger.kind === "hormiga") {
      const list = [...b.expenses].sort((a, c) => (a.fecha < c.fecha ? 1 : -1))
      const g = trigger.kind === "hormiga" ? list.find((e) => isHormiga(e, b.categories, num(b.settings.umbral))) : list[0]
      if (g) return { kind: trigger.kind, clave: "prueba", hoy, data: { ...base, monto: num(g.valor), descripcion: g.descripcion, category_id: g.category_id ?? null, member_id: g.member_id ?? null, fecha: g.fecha, row_id: g.id } }
    }
    if (trigger.kind === "ingreso") {
      const x = [...b.extraIncomes].sort((a, c) => (a.fecha < c.fecha ? 1 : -1))[0]
      if (x) return { kind: "ingreso", clave: "prueba", hoy, data: { ...base, monto: num(x.valor), descripcion: x.descripcion, fecha: x.fecha } }
      const i = b.incomes[0]
      if (i) return { kind: "ingreso", clave: "prueba", hoy, data: { ...base, monto: num(i.valor), descripcion: i.concepto, member_id: i.member_id ?? null } }
    }
    if (trigger.kind === "pago_fijo") {
      const f = b.fixedExpenses[0]
      if (f) return { kind: "pago_fijo", clave: "prueba", hoy, data: { ...base, monto: num(f.valor), descripcion: f.nombre, category_id: f.category_id ?? null } }
    }
    const s = stateEvents(trigger, b, hoy, extras)[0]
    return s ? { ...s, clave: "prueba" } : null
  }
  const ejemplo: Record<string, EventData> = {
    gasto: { monto: 250_000, descripcion: "Mercado del mes (ejemplo)" },
    hormiga: { monto: 4_500, descripcion: "Tinto (ejemplo)" },
    ingreso: { monto: 1_500_000, descripcion: "Quincena (ejemplo)" },
    pago_fijo: { monto: 900_000, descripcion: "Arriendo (ejemplo)" },
    presupuesto: { monto: 400_000, descripcion: "Mercado (ejemplo)", pct: 82 },
    pago_proximo: { monto: 120_000, descripcion: "Internet (ejemplo)", pago: "Internet (ejemplo)", dias: 3, cuando: "en 3 días" },
    saldo_bajo: { monto: 150_000, descripcion: "Fondo de emergencia (ejemplo)", pct: 12 },
    meta_alcanzada: { monto: 2_000_000, descripcion: "Viaje (ejemplo)", meta: "Viaje (ejemplo)" },
    programado: {},
  }
  return real() ?? { kind: trigger.kind as TriggerEvent["kind"], clave: "prueba", hoy, data: { ...base, ...ejemplo[trigger.kind] } }
}
