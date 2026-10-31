import { describe, expect, it } from "vitest"
import { catId, expenseOf, rulesOf, scenario } from "./__tests__/adapt"
import { RICO } from "./__tests__/fixtures"
import { isHormiga, localCat, localHormiga, norm, vecesMes } from "./hormiga"

const HOY = "2026-10-31"
const sc = scenario(HOY).mutate(RICO + "S.cfg.reglas.push({k:'farmacia',cat:'Categoría borrada'});")
const b = sc.book
const ctx = { rules: rulesOf(sc.S), expenses: b.expenses, categories: b.categories }

const DESCS = [
  "COMPRA EXITO CALLE 80", "RAPPI*RESTAURANTE", "Juan Valdez Café", "UBER TRIP", "TERPEL EDS", "Cuota de manejo", "FARMACIA",
  "Tinto y pandebono", "Mercado quincenal", "Almuerzo en restaurante", "pago predial", "Se dañó la nevera", "Netflix",
  "spotify family", "Gasolina", "Matrícula colegio", "Pasaje bus", "x", "", "Tarifa de domicilio", "Regalo para mamá",
  "Ropa niña", "Paquete y gaseosa", "Salud oral", "Educación financiera", "Algo que no existe en ningún lado",
]

describe("localCat = v4", () => {
  it.each(DESCS)("%s", (d) => {
    const v4 = sc.plain(`localCat(${JSON.stringify(d)})`)
    const v5 = localCat(d, ctx)
    expect(v5 && { cat: b.categories.find((c) => c.id === v5.category_id)?.nombre, src: v5.src }).toEqual(v4 ?? null)
  })
})

describe("localHormiga / isHormiga = v4 (todos los gastos del ejemplo + casos)", () => {
  it("cada gasto del libro", () => {
    sc.S.gastos.forEach((g: { id: string }, i: number) => {
      const v5 = b.expenses[i]
      expect(v5.id).toBe(g.id)
      expect(localHormiga(v5, b.categories, b.settings.umbral), `local ${i}`).toBe(sc.ev(`localHormiga(S.gastos[${i}])`))
      expect(isHormiga(v5, b.categories, b.settings.umbral), `is ${i}`).toBe(sc.ev(`isHormiga(S.gastos[${i}])`))
    })
  })
  it.each([
    ["Tinto", "Café", 3000], ["Tinto", "Café", 60000], ["Cosa", "Restaurantes", 20000], ["Cosa", "Restaurantes", 30000],
    ["Cosa", "Inexistente", 10000], ["Cosa", "Inexistente", 30000], ["taxi al médico", "Salud", 10000], ["Bolsillo", "Ahorro", 5000],
    ["Recarga celular", "Servicios públicos", 10000], ["Cerveza", "Entretenimiento", 50000], ["Cerveza", "Entretenimiento", 50001],
  ])("%s · %s · %d", (desc, cat, valor) => {
    const g = { id: "t", fecha: HOY, desc, cat, valor }
    const v4 = sc.ev(`localHormiga(${JSON.stringify(g)})`)
    expect(localHormiga(expenseOf(sc.S, g), b.categories, b.settings.umbral)).toBe(v4)
  })
  it("un gasto de un fijo nunca es hormiga, aunque esté marcado", () => {
    expect(isHormiga({ descripcion: "Tinto", valor: 3000, category_id: catId(sc.S, "Café"), fixed_expense_id: "f1", hormiga: true, hormiga_src: "manual" }, b.categories, 25000)).toBe(false)
  })
})

describe("norm y vecesMes", () => {
  it("norm quita tildes y espacios", () => expect(norm("  Café   Juan  VALDÉZ ")).toBe(sc.ev("norm('  Café   Juan  VALDÉZ ')")))
  it.each(["Tinto y pandebono", "Mercado quincenal", "Nada"])("vecesMes(%s)", (d) => expect(vecesMes(d, b.expenses, HOY)).toBe(sc.ev(`vecesMes(${JSON.stringify(d)})`)))
})
