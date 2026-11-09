import { describe, expect, it } from "vitest"
import { scenario } from "./__tests__/adapt"
import { resumenIngresos } from "./ingresos-resumen"
import type { IncomeIn } from "./types"

const HOY = "2026-10-15"
const base = (p: Partial<IncomeIn>): IncomeIn => ({ id: "i1", concepto: "Ingreso", valor: 1_000_000, frec: "mensual", dia: 30, currency: "COP", ...p } as IncomeIn)
const libro = (incomes: IncomeIn[]) => ({ incomes, settings: { trm: { USD: 4000 }, corte_q: 15 } }) as never

describe("tarjetas de la pantalla Ingresos", () => {
  it("quien cobra quincenal ve sus dos quincenas", () => {
    const r = resumenIngresos(libro([base({ frec: "quincenal", valor: 900_000, reparto: { n1: 900_000, n2: 800_000 } })]), HOY)
    expect(r.map((x) => x.id)).toEqual(["mes", "q1", "q2", "anio"])
    expect(r[1].valor).toBe(900_000)
    expect(r[2].valor).toBe(800_000)
  })

  it("quien cobra mensual ve su próximo pago, no quincenas", () => {
    const r = resumenIngresos(libro([base({ valor: 3_000_000, dia: 30 })]), HOY)
    expect(r.map((x) => x.id)).toEqual(["mes", "proximo", "anio"])
    expect(r[1].valor).toBe(3_000_000)
    expect(r[1].sub).toMatch(/En 15 días|15 de octubre|30 de octubre/)
  })

  it("quien cobra por días o por semana ve lo de cada día y cada semana", () => {
    const sem = resumenIngresos(libro([base({ frec: "semanal", valor: 400_000 })]), HOY)
    expect(sem.some((x) => x.id === "semana" && x.valor === 400_000)).toBe(true)
    const dia = resumenIngresos(libro([base({ frec: "diario", valor: 60_000, reparto: { dias: 24 } })]), HOY)
    const d = dia.find((x) => x.id === "dia")!
    expect(d.valor).toBe(60_000)
    expect(d.sub).toBe("24 días al mes")
  })

  it("un pago una vez al año dice cuándo llega el siguiente", () => {
    const r = resumenIngresos(libro([base({ frec: "anual", valor: 5_000_000, dia: 20, reparto: { mes: 12 } })]), HOY)
    const a = r.find((x) => x.id === "anual")!
    expect(a.valor).toBe(5_000_000)
    expect(a.sub).toBe("El siguiente, el 20 de diciembre")
  })

  it("sin ingresos solo quedan las tarjetas generales, en cero", () => {
    const r = resumenIngresos(libro([]), HOY)
    expect(r[0].valor).toBe(0)
    expect(r.every((x) => x.valor === 0)).toBe(true)
  })

  it("nunca pasa de cuatro tarjetas y la primera es lo que llega al mes", () => {
    const r = resumenIngresos(libro([
      base({ id: "a", frec: "quincenal", valor: 900_000 }), base({ id: "b", frec: "semanal", valor: 100_000 }),
      base({ id: "c", frec: "diario", valor: 50_000 }), base({ id: "d", frec: "anual", valor: 2_000_000, reparto: { mes: 6 } }),
    ]), HOY)
    expect(r.length).toBe(4)
    expect(r[0].id).toBe("mes")
  })

  it("el total del mes es el mismo que el del libro de ejemplo", () => {
    const sc = scenario("2026-10-31")
    const r = resumenIngresos(sc.book, "2026-10-31")
    expect(Math.round(r[0].valor)).toBe(Math.round(sc.ev("ingresoMensual()")))
  })
})
