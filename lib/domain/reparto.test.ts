import { describe, expect, it } from "vitest"
import { dedCalc } from "./payroll"
import { quincena } from "./quincena"
import { fijoValor, incomeCuando, incomePagos, quincenaDeDia, quincenasNetas } from "./reparto"
import type { BookData } from "./types"

const ref = { smmlv: 1750905, uvt: 52374 }
const emp = { tipo: "empleado" as const }

describe("quincenasNetas", () => {
  it("nómina de $9.000.000: la 1ª quincena llega completa y en la 2ª se descuenta todo el mes", () => {
    const r = quincenasNetas(4_500_000, 4_500_000, emp, ref, "q2")
    const mes = dedCalc(9_000_000, "mensual", emp, ref)
    expect(r.n1).toBe(4_500_000)
    expect(r.x1).toBe(0)
    expect(r.total).toBeCloseTo(mes.total, -1)
    expect(r.n2).toBe(4_500_000 - r.total)
    expect(r.items.map((i) => i.n)).toEqual(["Salud", "Pensión", "Fondo de solidaridad pensional", "Retención en la fuente"])
  })
  it("mitad y mitad da lo mismo que un ingreso quincenal de siempre", () => {
    const r = quincenasNetas(4_500_000, 4_500_000, emp, ref, "mitad")
    const q = dedCalc(4_500_000, "quincenal", emp, ref)
    expect(Math.abs(r.n1 - q.neto)).toBeLessThanOrEqual(1)
    expect(Math.abs(r.n2 - q.neto)).toBeLessThanOrEqual(1)
  })
  it("todo en la 1ª quincena", () => {
    const r = quincenasNetas(4_500_000, 4_500_000, emp, ref, "q1")
    expect(r.n2).toBe(4_500_000)
    expect(r.n1).toBe(4_500_000 - r.total)
  })
  it("si una quincena no alcanza, el resto del descuento pasa a la otra", () => {
    const r = quincenasNetas(100_000, 8_900_000, emp, ref, "q1")
    expect(r.n1).toBe(0)
    expect(r.x1).toBe(100_000)
    expect(r.n1 + r.n2).toBe(9_000_000 - r.total)
  })
  it("sin descuentos devuelve los valores escritos (bono de $30.000 en cada quincena)", () => {
    expect(quincenasNetas(30_000, 30_000, null, ref)).toMatchObject({ n1: 30_000, n2: 30_000, total: 0 })
    expect(quincenasNetas(30_000, 0, null, ref)).toMatchObject({ n1: 30_000, n2: 0 })
  })
})

describe("incomePagos", () => {
  it("sin reparto: quincenal el 15 y el último día con el mismo valor (como la v4)", () => {
    expect(incomePagos({ frec: "quincenal", valor: 100, dia: 30 }, 2026, 0)).toEqual([
      { fecha: "2026-01-15", v: 100, parte: "q1" }, { fecha: "2026-01-31", v: 100, parte: "q2" },
    ])
  })
  it("con reparto: valor y día propios de cada quincena", () => {
    const x = { frec: "quincenal", valor: 3_900_000, dia: 30, reparto: { modo: "igual", n1: 4_500_000, n2: 3_300_000, d1: 5, d2: 20 } }
    expect(incomePagos(x, 2026, 1)).toEqual([
      { fecha: "2026-02-05", v: 4_500_000, parte: "q1" }, { fecha: "2026-02-20", v: 3_300_000, parte: "q2" },
    ])
  })
  it("el día 31 se recorta al último día del mes", () => {
    expect(incomePagos({ frec: "quincenal", valor: 1, dia: 30, reparto: { d2: 31 } }, 2026, 1)[1].fecha).toBe("2026-02-28")
  })
  it("semanal: viernes por defecto o el día escogido", () => {
    expect(incomePagos({ frec: "semanal", valor: 1, dia: 30 }, 2026, 0).map((p) => p.fecha)).toEqual(["2026-01-02", "2026-01-09", "2026-01-16", "2026-01-23", "2026-01-30"])
    expect(incomePagos({ frec: "semanal", valor: 1, dia: 30, reparto: { dow: 1 } }, 2026, 0)).toHaveLength(4)
  })
  it("anual: solo en el mes guardado", () => {
    const x = { frec: "anual", valor: 500, dia: 20, reparto: { mes: 12 } }
    expect(incomePagos(x, 2026, 11)).toEqual([{ fecha: "2026-12-20", v: 500 }])
    expect(incomePagos(x, 2026, 5)).toEqual([])
    expect(incomePagos({ frec: "anual", valor: 500, dia: 20 }, 2026, 11)).toEqual([])
  })
})

describe("textos y gastos fijos", () => {
  it("incomeCuando", () => {
    expect(incomeCuando({ frec: "quincenal", dia: 30 })).toBe("Cada quincena (15 y fin de mes)")
    expect(incomeCuando({ frec: "quincenal", dia: 30, reparto: { d1: 10, d2: 25 } })).toBe("Cada quincena (10 y 25)")
    expect(incomeCuando({ frec: "semanal", dia: 30, reparto: { dow: 1 } })).toBe("Cada lunes")
    expect(incomeCuando({ frec: "anual", dia: 20, reparto: { mes: 12 } })).toBe("Cada año el 20 de diciembre")
  })
  it("quincenaDeDia según el corte", () => {
    expect(quincenaDeDia(15)).toBe("q1")
    expect(quincenaDeDia(16)).toBe("q2")
    expect(quincenaDeDia(18, 20)).toBe("q1")
  })
  it("fijoValor: valor distinto por quincena o el de siempre", () => {
    const f = { frec: "quincenal", valor: 750_000, reparto: { modo: "distinto", q1: 1_000_000, q2: 500_000 } }
    expect(fijoValor(f, "2026-01-Q1")).toBe(1_000_000)
    expect(fijoValor(f, "2026-01-Q2")).toBe(500_000)
    expect(fijoValor({ frec: "quincenal", valor: 750_000 }, "2026-01-Q1")).toBe(750_000)
    expect(fijoValor({ frec: "mensual", valor: 80_000, reparto: { modo: "distinto", q1: 1 } }, "2026-01")).toBe(80_000)
  })
})

describe("quincena con reparto", () => {
  const book = {
    settings: { trm: {}, corte_q: 15 },
    incomes: [
      { id: "s", concepto: "Salario", frec: "quincenal", valor: 3_900_000, dia: 30, currency: "COP", reparto: { modo: "igual", b1: 4_500_000, b2: 4_500_000, n1: 4_500_000, n2: 3_300_000, ded: "q2" } },
      { id: "b", concepto: "Bono", frec: "quincenal", valor: 30_000, dia: 30, currency: "COP" },
    ],
    loans: [], calendarEvents: [], fixedExpenses: [
      { id: "a", nombre: "Arriendo", frec: "quincenal", valor: 750_000, dia: 15, dia2: 30, payments: [], reparto: { modo: "distinto", q1: 1_000_000, q2: 500_000 } },
    ],
    subscriptions: [], extraIncomes: [], creditCards: [], categories: [],
  } as unknown as BookData
  it("cada quincena suma lo que de verdad llega y lo que de verdad sale", () => {
    const q1 = quincena(book, 2026, 0, "q1", "2026-01-10")
    const q2 = quincena(book, 2026, 0, "q2", "2026-01-10")
    expect(q1.E).toBe(4_530_000)
    expect(q2.E).toBe(3_330_000)
    expect(q1.Sa).toBe(1_000_000)
    expect(q2.Sa).toBe(500_000)
  })
})
