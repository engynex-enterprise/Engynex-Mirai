import { describe, expect, it } from "vitest"
import { parseEntry } from "./parse-entry"

describe("parseEntry", () => {
  it("gasto con 'mil' y 'ayer'", () => {
    expect(parseEntry("gasté 15 mil en almuerzo ayer", "2026-10-31")).toEqual({ tipo: "gasto", valor: 15000, descripcion: "Almuerzo", fecha: "2026-10-30" })
  })
  it("pagué con puntos de miles", () => {
    expect(parseEntry("pagué 120.000 de la luz", "2026-10-31")).toMatchObject({ tipo: "gasto", valor: 120000, descripcion: "Luz" })
  })
  it("ingreso", () => {
    expect(parseEntry("me pagaron 300 mil por un trabajo", "2026-10-31")).toMatchObject({ tipo: "ingreso", valor: 300000, descripcion: "Trabajo" })
  })
  it("millones", () => expect(parseEntry("compré nevera 1,5 millones", "2026-10-31")).toMatchObject({ valor: 1500000, descripcion: "Nevera" }))
  it("sin valor → null", () => expect(parseEntry("almuerzo")).toBeNull())
})
