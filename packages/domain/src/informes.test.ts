import { describe, expect, it } from "vitest"
import { estadoIntegral, flujoIntegral, periodo } from "./flujo-integral"
import { conceptoDe, informeEstado, informeFlujo, informeMeses, INFORMES } from "./informes"
import { movsBandeja, resumenBandeja } from "./bandeja"
import type { BookData } from "./types"

const HOY = "2026-11-10"

function libro(extra: Partial<BookData> = {}): BookData {
  return {
    settings: { umbral: 25000, limite: 200000, trm: {}, emerg_meta: 6, anticipo: 5, corte_q: 15, alerta_pres: 80 },
    categories: [
      { id: "c-mer", nombre: "Mercado", icon: "shopping-cart", tope: 0, grupo: "n" },
      { id: "c-tra", nombre: "Transporte", icon: "car", tope: 0, grupo: "n" },
    ],
    incomes: [
      { id: "i1", concepto: "Sueldo Ana", valor: 1000000, frec: "quincenal", dia: 15, currency: "COP", member_id: "ana" },
      { id: "i2", concepto: "Arriendo del local", valor: 800000, frec: "mensual", dia: 5, currency: "COP" },
    ],
    extraIncomes: [], expenses: [], fixedExpenses: [], subscriptions: [], loans: [], creditCards: [],
    assets: [{ id: "a1", cod: "1110", valor: 2000000, currency: "COP" }],
    liabilities: [], investments: [], goals: [], calendarEvents: [], contacts: [{ id: "ct1", nombre: "Don Jaime" }], entities: [{ id: "en1", nombre: "Bancolombia" }],
    ...extra,
  }
}
const g = (o: Record<string, unknown>) => ({ id: String(o.id), fecha: "2026-11-08", descripcion: "Mercado D1", valor: 100000, category_id: "c-mer", ...o }) as never
const NOV = periodo(libro(), "mes", 2026, 10)

describe("informes de gastos", () => {
  // Noviembre: mercado en el D1 dos veces ($100.000 + $150.000) pagado por Ana con débito, gasolina $80.000 con
  // efectivo (de Luis) y una cuota de $250.000 al banco.
  const b = libro({
    expenses: [
      g({ id: "g1", member_id: "ana", payment_method_id: "deb", provider_id: "d1" }),
      g({ id: "g2", fecha: "2026-11-09", valor: 150000, member_id: "ana", payment_method_id: "deb", provider_id: "d1", descripcion: "mercado d1" }),
      g({ id: "g3", descripcion: "Gasolina", valor: 80000, category_id: "c-tra", member_id: "luis", payment_method_id: "efe" }),
    ],
    loans: [{ id: "L1", kind: "pagar", tipo: "banco", entity_id: "en1", monto: 3000000, sistema: "frances", tasa: 0, frec: "mensual", plazo: 12, inicio: "2026-10-20", payments: [] } as never],
  })
  const F = flujoIntegral(b, NOV, HOY)
  const N = { member: (id: string) => ({ ana: "Ana", luis: "Luis" })[id], medio: (id: string) => ({ deb: "Débito", efe: "Efectivo" })[id], provider: (id: string) => ({ d1: "Tiendas D1" })[id], entity: (id: string) => ({ en1: "Bancolombia" })[id] }

  it("cada informe suma lo mismo que «Sale» del Balance (nada dos veces)", () => {
    const sale = resumenBandeja(movsBandeja(F)).total
    expect(sale).toBe(F.tot.sale)
    for (const t of ["gastos-categoria", "gastos-persona", "gastos-proveedor", "gastos-producto", "gastos-medio", "gastos-tipo"] as const) {
      const I = informeFlujo(t, F, N)
      expect(I.total, t).toBe(sale)
      expect(I.filas.reduce((a, f) => a + f.pct, 0), t).toBeCloseTo(1)
    }
  })
  it("por persona: Ana $250.000, Luis $80.000 y la cuota sin persona va a «Toda la familia»", () => {
    const I = informeFlujo("gastos-persona", F, N)
    expect(I.filas.map((f) => [f.label, f.v])).toEqual([["Ana", 250000], ["Toda la familia", 250000], ["Luis", 80000]])
  })
  it("por proveedor: el D1 junta los dos mercados; la cuota es del banco", () => {
    const I = informeFlujo("gastos-proveedor", F, N)
    expect(I.filas.find((f) => f.label === "Tiendas D1")).toMatchObject({ v: 250000, n: 2 })
    expect(I.filas.find((f) => f.label === "Bancolombia")).toMatchObject({ v: 250000 })
    expect(I.filas.find((f) => f.label === "Sin decir a quién")).toMatchObject({ v: 80000 })
  })
  it("por producto: «Mercado D1» y «mercado d1» son lo mismo; la cuota sin su número", () => {
    const I = informeFlujo("gastos-producto", F, N)
    expect(I.filas.find((f) => f.k === "mercado d1")).toMatchObject({ v: 250000, n: 2 })
    expect(conceptoDe({ n: "Cuota 3 · Bancolombia" })).toEqual({ k: "bancolombia", label: "Bancolombia" })
  })
  it("por medio de pago: débito $250.000, efectivo $80.000 y la cuota sin medio", () => {
    const I = informeFlujo("gastos-medio", F, N)
    expect(Object.fromEntries(I.filas.map((f) => [f.label, f.v]))).toEqual({ "Débito": 250000, "Efectivo": 80000, "Sin medio de pago": 250000 })
  })
})

describe("informes de ingresos", () => {
  const b = libro()
  const F = flujoIntegral(b, NOV, HOY)
  it("por fuente: el sueldo de las dos quincenas y el arriendo del local", () => {
    const I = informeFlujo("ingresos-fuente", F)
    expect(I.filas.map((f) => [f.label, f.v])).toEqual([["Sueldo Ana", 2000000], ["Arriendo del local", 800000]])
    expect(I.total).toBe(F.tot.entra)
  })
  it("por persona: lo que recibe Ana y lo que no dice quién", () => {
    const I = informeFlujo("ingresos-persona", F, { member: (id) => (id === "ana" ? "Ana" : undefined) })
    expect(Object.fromEntries(I.filas.map((f) => [f.label, f.v]))).toEqual({ Ana: 2000000, "Sin decir quién": 800000 })
  })
})

describe("informes de lo que tienes y lo que debes", () => {
  const b = libro({
    loans: [
      { id: "L1", kind: "pagar", tipo: "banco", entity_id: "en1", monto: 1200000, sistema: "frances", tasa: 0, frec: "mensual", plazo: 12, inicio: "2026-10-20", payments: [] } as never,
      { id: "L2", kind: "cobrar", tipo: "presto", contact_id: "ct1", monto: 300000, sistema: "frances", tasa: 0, frec: "mensual", plazo: 3, inicio: "2026-11-01", payments: [] } as never,
    ],
  })
  const E = estadoIntegral(b, HOY)
  it("activos y pasivos suman lo mismo que el Balance", () => {
    expect(informeEstado("activos", E, b, HOY).total).toBeCloseTo(E.A)
    expect(informeEstado("pasivos", E, b, HOY).total).toBeCloseTo(E.P)
  })
  it("deudas y me deben: el saldo de cada préstamo con su próxima cuota", () => {
    const D = informeEstado("deudas", E, b, HOY)
    expect(D.filas).toHaveLength(1)
    expect(D.filas[0].sub).toMatch(/Próxima cuota .*100\.000/)
    const M = informeEstado("me-deben", E, b, HOY)
    expect(M.filas[0]).toMatchObject({ v: 300000 })
  })
})

describe("mes a mes", () => {
  it("cada mes con lo que entra, sale y queda; el valor de la fila es lo que sale", () => {
    const b = libro({ expenses: [g({ id: "g1" })] })
    const meses = [9, 10].map((m) => ({ k: `2026-${m + 1}`, label: String(m + 1), F: flujoIntegral(b, periodo(b, "mes", 2026, m), HOY) }))
    const I = informeMeses(meses)
    expect(I.filas[1]).toMatchObject({ entra: meses[1].F.tot.entra, sale: meses[1].F.tot.sale, queda: meses[1].F.tot.queda })
    expect(I.total).toBe(meses[0].F.tot.sale + meses[1].F.tot.sale)
  })
  it("el catálogo tiene un nombre y una descripción para cada informe", () => {
    expect(new Set(INFORMES.map((i) => i.id)).size).toBe(INFORMES.length)
    for (const i of INFORMES) expect(i.label && i.desc).toBeTruthy()
  })
})
