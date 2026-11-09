// Plata contada dos veces por registros sin enlazar (el arriendo como gasto fijo y además como gasto suelto) y
// desglose de "Sale" por módulo que cuadra con el total.
import { describe, expect, it } from "vitest"
import { posiblesDobles, totalDobles } from "./dobles"
import { flujoIntegral, periodo, porClase, salidasPorModulo } from "./flujo-integral"
import type { BookData } from "./types"

const HOY = "2026-11-20"

function libro(extra: Partial<BookData> = {}): BookData {
  return {
    settings: { umbral: 25000, limite: 200000, trm: {}, emerg_meta: 6, anticipo: 5, corte_q: 15, alerta_pres: 80 },
    categories: [{ id: "c-viv", nombre: "Vivienda", icon: "house", tope: 0, grupo: "n" }],
    incomes: [], extraIncomes: [], expenses: [], fixedExpenses: [], subscriptions: [], loans: [], creditCards: [],
    assets: [], liabilities: [], investments: [], goals: [], calendarEvents: [], contacts: [], entities: [],
    ...extra,
  }
}
const NOV = periodo(libro(), "mes", 2026, 10)
const arriendo = (payments: unknown[] = []) =>
  ({ id: "f1", nombre: "Arriendo", valor: 1200000, frec: "mensual", dia: 5, category_id: "c-viv", payments }) as never
const gasto = (o: Record<string, unknown>) => ({ id: "g1", fecha: "2026-11-05", descripcion: "Pago arriendo", valor: 1200000, category_id: "c-viv", ...o }) as never

describe("posiblesDobles: un fijo y un gasto que no están enlazados", () => {
  it("avisa cuando el gasto suelto se parece al fijo pendiente (sale dos veces)", () => {
    const b = libro({ fixedExpenses: [arriendo()], expenses: [gasto({})] })
    const d = posiblesDobles(b, NOV.a, NOV.b, HOY)
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ id: "g1", per: "2026-11", due: "2026-11-05", yaPagado: false, v: 1200000 })
    expect(totalDobles(d)).toBe(1200000)
    // Y de verdad está contado dos veces en el flujo.
    const F = flujoIntegral(b, NOV, HOY)
    expect(F.tot.gasto).toBe(2400000)
  })

  it("avisa también cuando el fijo ya está pagado por su lado", () => {
    const b = libro({
      fixedExpenses: [arriendo([{ id: "p1", periodo: "2026-11", fecha: "2026-11-05", valor: 1200000, cierra: true }])],
      expenses: [gasto({ id: "g2" })],
    })
    const d = posiblesDobles(b, NOV.a, NOV.b, HOY)
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ id: "g2", yaPagado: true })
  })

  it("no avisa si el gasto ya está enlazado al fijo", () => {
    const b = libro({ fixedExpenses: [arriendo()], expenses: [gasto({ fixed_expense_id: "f1", periodo: "2026-11" })] })
    expect(posiblesDobles(b, NOV.a, NOV.b, HOY)).toEqual([])
  })

  it("no avisa si el gasto no se parece (otro nombre y otro valor)", () => {
    const b = libro({ fixedExpenses: [arriendo()], expenses: [gasto({ descripcion: "Mercado", valor: 90000 })] })
    expect(posiblesDobles(b, NOV.a, NOV.b, HOY)).toEqual([])
  })

  it("un mismo periodo del fijo se avisa una sola vez", () => {
    const b = libro({ fixedExpenses: [arriendo()], expenses: [gasto({}), gasto({ id: "g2", fecha: "2026-11-07" })] })
    expect(posiblesDobles(b, NOV.a, NOV.b, HOY)).toHaveLength(1)
  })
})

describe("el desglose de «Sale» por módulo cuadra con el total", () => {
  const b = libro({
    fixedExpenses: [arriendo()],
    expenses: [{ id: "g9", fecha: "2026-11-10", descripcion: "Mercado", valor: 150000 } as never],
    goals: [{ id: "m1", nombre: "Viaje", objetivo: 3000000, ahorrado: 0, fecha: "2027-06-01" }],
    loans: [{ id: "L1", kind: "cobrar", tipo: "presto", contact_id: "c1", monto: 500000, sistema: "sin", tasa: 0, frec: "mensual", plazo: 5, inicio: "2026-11-02", extra: 0, payments: [] }] as never,
    contacts: [{ id: "c1", nombre: "Ana" }],
  })
  const F = flujoIntegral(b, NOV, HOY, { metas: [{ id: "gm1", goal_id: "m1", tipo: "abono", valor: 200000, fecha: "2026-11-03" }] })

  it("la suma de los módulos es exactamente tot.sale (sin ahorro ni préstamos que hiciste)", () => {
    const partes = salidasPorModulo(F)
    expect(Math.round(partes.reduce((a, p) => a + p.v, 0))).toBe(Math.round(F.tot.sale))
    expect(partes.some((p) => p.modulo === "metas")).toBe(false)
    expect(partes.some((p) => p.modulo === "me-deben")).toBe(false)
  })

  it("el ahorro y los préstamos que hiciste quedan fuera, pero sí en el módulo", () => {
    expect(F.porModulo.find((g) => g.modulo === "metas")?.ahorro).toBe(200000)
    expect(F.porModulo.find((g) => g.modulo === "me-deben")?.credito).toBe(500000)
    expect(F.porModulo.find((g) => g.modulo === "me-deben")?.saleFlujo).toBe(0)
  })

  it("porClase reparte una columna sin perder ni repetir un peso", () => {
    const C = porClase(F.sal)
    expect(C.gasto + C.deuda + C.ahorroSale + C.credSale).toBe(C.total)
    expect(C.gasto + C.deuda).toBe(F.tot.sale)
  })
})
