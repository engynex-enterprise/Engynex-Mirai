import { describe, expect, it } from "vitest"
import { gastoVariable, hormigas, proyectarMes } from "./totals"
import { localHormiga } from "./hormiga"

describe("proyectarMes (sin inflar lo de pocos días)", () => {
  it("el caso real: 3 gastos hormiga por $50.000 a inicios de mes, sin historial → no proyecta", () => {
    const p = proyectarMes({ llevas: 50_000, mes: "2026-11", hoy: "2026-11-04", previos: [], desde: "2026-11-02" })
    expect(p).toEqual({ valor: 50_000, base: "pronto", dias: 3 })
  })
  it("sin historial y con 14 días y 4 registros o más: el ritmo desde que empezó a registrar, no desde el día 1", () => {
    // Empezó el 3, hoy 16 (14 días), 6 gastos por 70.000 → 5.000/día × 14 días que faltan = 140.000
    const p = proyectarMes({ llevas: 70_000, mes: "2026-11", hoy: "2026-11-16", previos: [], desde: "2026-11-03", registros: 6 })
    expect(p.base).toBe("ritmo")
    expect(p.valor).toBe(70_000 + 5_000 * 14)
  })
  it("7 días con 3 gastos (el caso del 8 de nov.) todavía es pronto", () => {
    const p = proyectarMes({ llevas: 50_000, mes: "2026-11", hoy: "2026-11-08", previos: [], desde: "2026-11-02", registros: 3 })
    expect(p.base).toBe("pronto")
    expect(p.valor).toBe(50_000)
  })
  it("con historial: lo que lleva + su promedio diario de los meses anteriores", () => {
    const p = proyectarMes({ llevas: 50_000, mes: "2026-11", hoy: "2026-11-04", previos: [152_000, 152_000], desde: "2026-08-01" })
    expect(p.base).toBe("historial")
    expect(p.valor).toBe(Math.round(50_000 + (152_000 / 30.4) * 26))
  })
  it("mes cerrado: es lo que se gastó", () => {
    expect(proyectarMes({ llevas: 80_000, mes: "2026-10", hoy: "2026-11-04", previos: [], desde: null })).toEqual({ valor: 80_000, base: "mes-cerrado", dias: 31 })
  })
})

describe("hormigas: límite y año sin exagerar", () => {
  const cats = [{ id: "c", nombre: "Restaurantes", grupo: "g", tope: 0, icon: "x" }]
  const g = (id: string, fecha: string, valor: number) => ({ id, fecha, valor, descripcion: "Tinto", category_id: "c", fixed_expense_id: null }) as never
  it("pocos días: no se dice que vas a pasar el límite ni se calcula el año", () => {
    const H = hormigas({ expenses: [g("1", "2026-11-02", 18_000), g("2", "2026-11-03", 16_000), g("3", "2026-11-04", 16_000)], categories: cats as never, settings: { umbral: 25_000, limite: 250_000 } }, "2026-11-04")
    expect(H.totalMes).toBe(50_000)
    expect(H.base).toBe("pronto")
    expect(H.proy).toBe(50_000)
    expect(H.anual).toBe(0)
    expect(H.over).toBe(false)
  })
  it("si ya pasó el límite lo dice aunque sea pronto", () => {
    const H = hormigas({ expenses: [g("1", "2026-11-02", 20_000), g("2", "2026-11-03", 20_000)], categories: cats as never, settings: { umbral: 25_000, limite: 30_000 } }, "2026-11-03")
    expect(H.pasado).toBe(true)
    expect(H.over).toBe(true)
  })
})

describe("gastoVariable: lo que sueles gastar en el día a día, sin inventar", () => {
  const cats = [{ id: "c", nombre: "Mercado", grupo: "n", tope: 0, icon: "x" }] as never
  const g = (fecha: string, valor: number) => ({ id: fecha + valor, fecha, valor, descripcion: "x", category_id: "c", fixed_expense_id: null }) as never
  it("empezó a registrar el 30 de oct. con un gasto: sin datos (no afirma que puede ahorrar casi todo el sueldo)", () => {
    expect(gastoVariable([g("2026-10-30", 80_000), g("2026-11-02", 18_000)], cats, [], "2026-11-08")).toEqual({ valor: 0, base: "sin-datos", meses: 0 })
  })
  it("con topes en el presupuesto y sin meses completos: usa el presupuesto", () => {
    const conTope = [{ id: "c", nombre: "Mercado", grupo: "n", tope: 900_000, icon: "x" }] as never
    expect(gastoVariable([g("2026-11-02", 18_000)], conTope, [], "2026-11-08")).toMatchObject({ valor: 900_000, base: "presupuesto" })
  })
  it("con dos meses completos desde que empezó: su promedio", () => {
    const G = [g("2026-08-20", 50_000), g("2026-09-05", 1_000_000), g("2026-10-05", 1_200_000), g("2026-11-02", 30_000)]
    expect(gastoVariable(G, cats, [], "2026-11-08")).toEqual({ valor: 1_100_000, base: "historial", meses: 2 })
  })
})

describe("qué es gasto hormiga", () => {
  const cats = [{ id: "s", nombre: "Suscripciones", grupo: "g", tope: 0, icon: "x" }, { id: "o", nombre: "Otros", grupo: "g", tope: 0, icon: "x" }] as never
  const g = (descripcion: string, valor: number, category_id: string | null) => ({ descripcion, valor, category_id, fixed_expense_id: null })
  it("la tintorería no es un tinto (palabra completa)", () => expect(localHormiga(g("Tintorería La Elegante", 60_000, "o"), cats, 25_000)).toBe(false))
  it("un tinto sí", () => expect(localHormiga(g("Tinto en la oficina", 3_000, null), cats, 25_000)).toBe(true))
  it("Netflix es una suscripción, no hormiga", () => expect(localHormiga(g("Netflix", 17_900, "s"), cats, 25_000)).toBe(false))
  it("la comisión por retiro en cajero sí", () => expect(localHormiga(g("Retiro en cajero", 7_800, null), cats, 25_000)).toBe(true))
})
