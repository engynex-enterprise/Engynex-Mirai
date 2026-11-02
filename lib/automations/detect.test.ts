import { describe, expect, it } from "vitest"
import type { BookData } from "@/lib/domain/types"
import { formatCOP } from "@/lib/domain/money"
import { CATALOG } from "./catalog"
import { queuedEventFor, resumenSemana, sampleEvent, scheduledEvent, stateEvents } from "./detect"
import type { FlowNode, NodeKind } from "./types"

const n = (kind: NodeKind, data: Record<string, unknown> = {}): FlowNode => ({ id: "t", type: CATALOG[kind].group, kind, data: { ...CATALOG[kind].defaults, ...data }, position: { x: 0, y: 0 } })

const book = (over: Partial<BookData> = {}): BookData => ({
  settings: { umbral: 15000, limite: 200000, trm: {}, emerg_meta: 3, anticipo: 5, corte_q: 15, alerta_pres: 80, notif: {} },
  categories: [
    { id: "merc", nombre: "Mercado", icon: "shopping-cart", tope: 500_000, grupo: "n" },
    { id: "cafe", nombre: "Café", icon: "coffee", tope: 0, grupo: "g" },
  ],
  incomes: [{ id: "sal", concepto: "Salario", valor: 2_000_000, frec: "quincenal", dia: 30, reparto: null }],
  extraIncomes: [],
  expenses: [
    { id: "g1", fecha: "2026-11-03", descripcion: "Mercado D1", valor: 300_000, category_id: "merc" },
    { id: "g2", fecha: "2026-11-08", descripcion: "Mercado Éxito", valor: 120_000, category_id: "merc" },
    { id: "g3", fecha: "2026-11-09", descripcion: "Tinto", valor: 3_000, category_id: "cafe" },
  ],
  fixedExpenses: [{ id: "arr", nombre: "Arriendo", valor: 900_000, frec: "mensual", dia: 13, category_id: null, payments: [], desde: "2026-01" }],
  subscriptions: [],
  loans: [],
  creditCards: [],
  assets: [],
  liabilities: [],
  investments: [],
  goals: [{ id: "viaje", nombre: "Viaje", objetivo: 1_000_000, ahorrado: 1_000_000, fecha: null }, { id: "carro", nombre: "Carro", objetivo: 5_000_000, ahorrado: 10, fecha: null }],
  calendarEvents: [],
  contacts: [],
  entities: [],
  ...over,
}) as unknown as BookData

const fondo = { fondo: { activo: true, saldo: 100_000 } }

describe("disparadores programados", () => {
  it("semanal: solo el día elegido y desde la hora elegida (con cron horario)", () => {
    const t = n("programado", { frecuencia: "semanal", dia_semana: 1, hora: 7 })
    expect(scheduledEvent(t, book(), { hoy: "2026-11-09", hora: 6 })).toBeNull() // lunes, antes de las 7
    const ev = scheduledEvent(t, book(), { hoy: "2026-11-09", hora: 8 })
    expect(ev).toMatchObject({ kind: "programado", clave: "prog:2026-11-09" })
    expect(String(ev?.data.resumen)).toMatch(/En los últimos 7 días gastaste/)
    expect(scheduledEvent(t, book(), { hoy: "2026-11-10", hora: 8 })).toBeNull() // martes
    expect(scheduledEvent(t, book(), { hoy: "2026-11-09", hora: 0, daily: true })).not.toBeNull() // cron diario: sin hora
  })
  it("mensual con día 31 corre el último día de meses cortos", () => {
    const t = n("programado", { frecuencia: "mensual", dia_mes: 31, hora: 0 })
    expect(scheduledEvent(t, book(), { hoy: "2026-11-30", hora: 9 })).not.toBeNull()
    expect(scheduledEvent(t, book(), { hoy: "2026-11-29", hora: 9 })).toBeNull()
  })
  it("quincena: el día de corte y el último del mes, con el ingreso y los fijos de la quincena", () => {
    const t = n("programado", { frecuencia: "quincena", hora: 0 })
    const ev = scheduledEvent(t, book(), { hoy: "2026-11-15", hora: 9 })
    expect(ev?.data.monto).toBe(2_000_000)
    expect(ev?.data.fijos).toBe(900_000) // el arriendo vence el 13: está en la primera quincena
    expect(scheduledEvent(t, book(), { hoy: "2026-11-30", hora: 9 })).not.toBeNull()
    expect(scheduledEvent(t, book(), { hoy: "2026-11-16", hora: 9 })).toBeNull()
  })
  it("día de pago según el ingreso principal", () => {
    const t = n("programado", { frecuencia: "dia_pago", hora: 0 })
    expect(scheduledEvent(t, book(), { hoy: "2026-11-15", hora: 9 })?.data.monto).toBe(2_000_000)
    expect(scheduledEvent(t, book({ incomes: [] }), { hoy: "2026-11-15", hora: 9 })).toBeNull()
  })
})

describe("disparadores por estado", () => {
  it("presupuesto: avisa cuando una categoría pasa el porcentaje, una vez por mes", () => {
    const [ev] = stateEvents(n("presupuesto", { pct: 80 }), book(), "2026-11-10", fondo)
    expect(ev).toMatchObject({ kind: "presupuesto", clave: "pres:merc:2026-11:80", data: { monto: 420_000, pct: 84, descripcion: "Mercado" } })
    expect(stateEvents(n("presupuesto", { pct: 90 }), book(), "2026-11-10", fondo)).toHaveLength(0)
  })
  it("pago próximo: dentro de los días elegidos y con clave por fecha", () => {
    const evs = stateEvents(n("pago_proximo", { dias: 3, tipos: ["fijo"] }), book(), "2026-11-10", fondo)
    expect(evs).toHaveLength(1)
    expect(evs[0]).toMatchObject({ clave: "pago:fijo:arr:2026-11-13", data: { monto: 900_000, dias: 3 } })
    expect(stateEvents(n("pago_proximo", { dias: 2, tipos: ["fijo"] }), book(), "2026-11-10", fondo)).toHaveLength(0)
  })
  it("fondo bajo y meta cumplida", () => {
    expect(stateEvents(n("saldo_bajo", { tipo: "fondo", pct: 30 }), book(), "2026-11-10", fondo)[0]?.clave).toBe("fondo:2026-11")
    expect(stateEvents(n("saldo_bajo", { tipo: "fondo", pct: 30 }), book(), "2026-11-10", { fondo: { activo: false, saldo: 0 } })).toHaveLength(0)
    const metas = stateEvents(n("meta_alcanzada"), book(), "2026-11-10", fondo)
    expect(metas.map((m) => m.clave)).toEqual(["meta:viaje"])
  })
  it("ingreso de nómina el día de pago", () => {
    const evs = stateEvents(n("ingreso", { fuente: "todos" }), book(), "2026-11-15", fondo)
    expect(evs[0]).toMatchObject({ clave: "ing:sal:2026-11-15", data: { monto: 2_000_000, descripcion: "Salario" } })
    expect(stateEvents(n("ingreso", { fuente: "extras" }), book(), "2026-11-15", fondo)).toHaveLength(0)
  })
})

describe("eventos de la cola", () => {
  const q = (tipo: string, datos: Record<string, unknown>) => ({ id: "q1", tipo, tabla: "expenses", row_id: "g9", datos })
  it("gasto y gasto hormiga", () => {
    expect(queuedEventFor(n("gasto"), q("gasto", { valor: 250_000, descripcion: "TV" }), book(), "2026-11-10")).toMatchObject({ kind: "gasto", clave: "ev:q1", data: { monto: 250_000, row_id: "g9" } })
    expect(queuedEventFor(n("hormiga"), q("gasto", { valor: 4_000, descripcion: "Tinto en la esquina" }), book(), "2026-11-10")?.kind).toBe("hormiga")
    expect(queuedEventFor(n("hormiga"), q("gasto", { valor: 900_000, descripcion: "Nevera" }), book(), "2026-11-10")).toBeNull()
    expect(queuedEventFor(n("ingreso"), q("gasto", { valor: 1 }), book(), "2026-11-10")).toBeNull()
  })
  it("ingreso extra solo si el disparador incluye extras", () => {
    expect(queuedEventFor(n("ingreso", { fuente: "nomina" }), q("ingreso", { valor: 1 }), book(), "2026-11-10")).toBeNull()
    expect(queuedEventFor(n("ingreso", { fuente: "extras" }), q("ingreso", { valor: 1 }), book(), "2026-11-10")?.kind).toBe("ingreso")
  })
})

describe("simulación y resumen", () => {
  it("usa el último gasto real del libro o un ejemplo", () => {
    expect(sampleEvent(n("gasto"), book(), "2026-11-10", fondo).data.descripcion).toBe("Tinto")
    expect(sampleEvent(n("gasto"), book({ expenses: [] }), "2026-11-10", fondo).data.descripcion).toMatch(/ejemplo/)
  })
  it("resumen de la semana", () => {
    expect(resumenSemana(book(), "2026-11-10")).toContain(`gastaste ${formatCOP(123_000)} en 2 movimientos; lo que más: Mercado`)
  })
})
