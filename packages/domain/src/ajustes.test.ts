import { describe, expect, it } from "vitest"
import { contactosConRelacion, cuadrarReparto, eaAMensual, moverRelacion, quincenasDelMes, repartoDe, repartoMontos, usoRelaciones } from "./ajustes"

describe("reparto del ingreso", () => {
  it("reconoce los repartos conocidos", () => {
    expect(repartoDe({ n: 50, g: 30, a: 20 })).toBe("50-30-20")
    expect(repartoDe({ n: 70, g: 20, a: 10 })).toBe("70-20-10")
    expect(repartoDe({ n: 55, g: 25, a: 20 })).toBeNull()
  })

  it("reparte en pesos y el ahorro se lleva el redondeo", () => {
    const m = repartoMontos(3_333_333, { n: 50, g: 30, a: 20 })
    expect(m.n + m.g + m.a).toBe(3_333_333)
    expect(m).toEqual({ n: 1_666_667, g: 1_000_000, a: 666_666 })
    expect(repartoMontos(0, { n: 50, g: 30, a: 20 })).toEqual({ n: 0, g: 0, a: 0 })
  })

  it("cuadra a 100 % moviendo primero el ahorro", () => {
    expect(cuadrarReparto({ n: 60, g: 30, a: 20 }, "n")).toEqual({ n: 60, g: 30, a: 10 })
    expect(cuadrarReparto({ n: 90, g: 30, a: 20 }, "n")).toEqual({ n: 90, g: 10, a: 0 })
    expect(cuadrarReparto({ n: 50, g: 30, a: 40 }, "a")).toEqual({ n: 50, g: 10, a: 40 })
    expect(cuadrarReparto({ n: 40, g: 30, a: 20 }, "g")).toEqual({ n: 40, g: 30, a: 30 })
    const r = cuadrarReparto({ n: 120, g: 0, a: 0 }, "n")
    expect(r.n + r.g + r.a).toBe(100)
  })
})

describe("quincenas y tasas", () => {
  it("días de cada quincena según el corte", () => {
    expect(quincenasDelMes(15, 2026, 2)).toEqual({ q1: [1, 15], q2: [16, 28] })
    expect(quincenasDelMes(14, 2026, 1)).toEqual({ q1: [1, 14], q2: [15, 31] })
    expect(quincenasDelMes(99, 2026, 4).q1).toEqual([1, 27])
  })

  it("tasa mensual equivalente a la E.A.", () => {
    expect(eaAMensual(12.68)).toBe(1)
    expect(eaAMensual(0)).toBe(0)
  })
})

describe("relaciones", () => {
  const contacts = [
    { relacion: "Amigo" }, { relacion: "amigo " }, { relacion: "Cliente" }, { relacion: "Compadre" }, { relacion: "compadre" },
    { relacion: "" }, { relacion: null }, { relacion: "Amigo", deleted_at: "2026-01-01" },
  ]

  it("cuenta contactos por relación, las que faltan en la lista y los que no tienen", () => {
    const u = usoRelaciones(contacts, ["Amigo", "Cliente", "Vecino"])
    expect(Object.fromEntries(u.porRel)).toEqual({ Amigo: 2, Cliente: 1, Vecino: 0 })
    expect(u.fuera).toEqual([{ nombre: "Compadre", n: 2 }])
    expect(u.sin).toBe(2)
  })

  it("mueve una relación y encuentra los contactos para renombrar", () => {
    expect(moverRelacion(["A", "B", "C"], 2, -1)).toEqual(["A", "C", "B"])
    expect(moverRelacion(["A", "B"], 0, -1)).toEqual(["A", "B"])
    expect(contactosConRelacion(contacts, "AMIGO")).toHaveLength(2)
  })
})
