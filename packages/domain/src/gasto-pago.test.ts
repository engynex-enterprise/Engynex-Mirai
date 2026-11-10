import { describe, expect, it } from "vitest"
import { abonarGasto, pagadoAlGuardar, pagoDeGasto } from "./gasto-pago"
import { flujoIntegral, periodo } from "./flujo-integral"
import type { BookData } from "./types"

const HOY = "2026-11-10"

describe("gastos por pagar o abonados", () => {
  it("sin `pagado` es un gasto pagado (todos los de antes); 0 es por pagar; una parte es abonado", () => {
    expect(pagoDeGasto({ valor: 75000, fecha: "2026-11-08" })).toEqual({ estado: "pagado", pagado: 75000, falta: 0, vence: "2026-11-08" })
    expect(pagoDeGasto({ valor: 75000, fecha: "2026-11-20", pagado: 0 })).toMatchObject({ estado: "pendiente", falta: 75000, vence: "2026-11-20" })
    expect(pagoDeGasto({ valor: 75000, fecha: "2026-11-08", pagado: 40000, pagar_el: "2026-11-15" })).toEqual({ estado: "abonado", pagado: 40000, falta: 35000, vence: "2026-11-15" })
  })
  it("al guardar: fecha futura queda por pagar; hoy o antes según lo que diga la persona", () => {
    expect(pagadoAlGuardar({ valor: 75000, fecha: "2026-11-20", hoy: HOY, modo: "pagado" })).toBe(0)
    expect(pagadoAlGuardar({ valor: 75000, fecha: HOY, hoy: HOY, modo: "pagado" })).toBeNull()
    expect(pagadoAlGuardar({ valor: 75000, fecha: "2026-11-08", hoy: HOY, modo: "abonado", abono: 40000 })).toBe(40000)
    expect(pagadoAlGuardar({ valor: 75000, fecha: "2026-11-08", hoy: HOY, modo: "abonado", abono: 75000 })).toBeNull()
    expect(pagadoAlGuardar({ valor: 75000, fecha: "2026-11-08", hoy: HOY, modo: "despues" })).toBe(0)
  })
  it("abonar: suma al pagado y, al completar, queda pagado (null); sin monto paga lo que falta", () => {
    expect(abonarGasto({ valor: 75000, fecha: HOY, pagado: 40000 }, 20000)).toBe(60000)
    expect(abonarGasto({ valor: 75000, fecha: HOY, pagado: 40000 }, 35000)).toBeNull()
    expect(abonarGasto({ valor: 75000, fecha: HOY, pagado: 0 })).toBeNull()
  })
  it("en el mes: el total que sale no cambia; lo abonado sale hecho y lo que falta, por pagar en su fecha", () => {
    const b = {
      settings: { umbral: 25000, limite: 200000, trm: {}, emerg_meta: 6, anticipo: 5, corte_q: 15, alerta_pres: 80 },
      categories: [{ id: "c-tra", nombre: "Transporte", icon: "car", tope: 0, grupo: "n" }],
      incomes: [], extraIncomes: [], fixedExpenses: [], subscriptions: [], loans: [], creditCards: [], assets: [], liabilities: [], investments: [], goals: [], calendarEvents: [], contacts: [], entities: [],
      expenses: [
        { id: "g1", fecha: "2026-11-08", descripcion: "Gasolina moto", valor: 75000, category_id: "c-tra", pagado: 40000, pagar_el: "2026-11-15" },
        { id: "g2", fecha: "2026-11-25", descripcion: "Revisión moto", valor: 120000, category_id: "c-tra", pagado: 0 },
        { id: "g3", fecha: "2026-11-02", descripcion: "Peaje", valor: 12000, category_id: "c-tra" },
      ],
    } as unknown as BookData
    const F = flujoIntegral(b, periodo(b, "mes", 2026, 10), HOY)
    expect(F.tot.sale).toBe(75000 + 120000 + 12000)
    const de = (id: string) => F.movs.find((m) => m.id === id)!
    expect(de("exp:g1")).toMatchObject({ v: 40000, estado: "hecho" })
    expect(de("exp:g1:falta")).toMatchObject({ v: 35000, estado: "programado", fecha: "2026-11-15" })
    expect(de("exp:g2:falta")).toMatchObject({ v: 120000, estado: "programado" })
    expect(F.movs.find((m) => m.id === "exp:g2")).toBeUndefined()
    expect(de("exp:g3")).toMatchObject({ v: 12000, estado: "hecho" })
    expect(F.tot.pendienteSale).toBe(35000 + 120000)
  })
})
