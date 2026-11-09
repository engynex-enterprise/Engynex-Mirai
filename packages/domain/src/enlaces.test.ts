// Movimientos enlazados (frente F2) dentro del flujo integral: pagos reales de la tarjeta y cobros de suscripción
// enlazados por subscription_id. Cada peso sale una sola vez.
import { describe, expect, it } from "vitest"
import { estadoIntegral, flujoIntegral, periodo } from "./flujo-integral"
import { tarjetasDeuda } from "./cards"
import type { BookData } from "./types"

const HOY = "2026-11-12"

function libro(extra: Partial<BookData> = {}): BookData {
  return {
    settings: { umbral: 25000, limite: 200000, trm: {}, emerg_meta: 6, anticipo: 5, corte_q: 15, alerta_pres: 80 },
    categories: [{ id: "c-ropa", nombre: "Ropa", icon: "shirt", tope: 0, grupo: "g" }, { id: "c-sub", nombre: "Suscripciones", icon: "repeat", tope: 0, grupo: "g" }],
    incomes: [], extraIncomes: [], expenses: [], fixedExpenses: [], subscriptions: [], loans: [], creditCards: [],
    assets: [], liabilities: [], investments: [], goals: [], calendarEvents: [], contacts: [], entities: [],
    ...extra,
  }
}
const NOV = periodo(libro(), "mes", 2026, 10)
const DIC = periodo(libro(), "mes", 2026, 11)

describe("flujo integral con pagos reales de la tarjeta", () => {
  const compra = { id: "p1", fecha: "2026-10-05", valor: 1200000, cuotas: 6 }
  const card = (payments: unknown[] = []) => ({ id: "t1", nombre: "Visa", corte: 25, pago: 10, tasa: 0, cupo: 5000000, purchases: [compra], payments }) as never

  it("sin pagos: sale la estimación del pago del mes (como antes)", () => {
    const F = flujoIntegral(libro({ creditCards: [card()] }), NOV, HOY)
    const t = F.movs.filter((x) => x.modulo === "tarjetas")
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ id: "card:t1:2026-11", v: 200000, fecha: "2026-11-10" })
  })

  it("con un pago registrado: sale el pago real (fecha y valor) en lugar de la estimación, una sola vez", () => {
    const b = libro({ creditCards: [card([{ id: "cp1", fecha: "2026-11-08", valor: 500000, tipo: "otro" }])] })
    const F = flujoIntegral(b, NOV, HOY)
    const t = F.movs.filter((x) => x.modulo === "tarjetas")
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ id: "card:t1:pago:cp1", v: 500000, fecha: "2026-11-08", estado: "hecho", clase: "deuda", s: "Pagaste la tarjeta" })
    expect(F.tot.deuda).toBe(500000)
    // Pagó $300.000 de más: la deuda baja en el estado y en los totales.
    expect(tarjetasDeuda(b.creditCards, HOY)).toBe(700000)
    expect(estadoIntegral(b, HOY).debo.find((x) => x.k === "card:t1")?.v).toBe(700000)
    // El mes siguiente vuelve la estimación (la cuota sigue igual: terminas antes).
    expect(flujoIntegral(b, DIC, HOY).movs.find((x) => x.modulo === "tarjetas")).toMatchObject({ id: "card:t1:2026-12", v: 200000 })
  })

  it("la compra con tarjeta sigue sin salir como gasto de caja", () => {
    const b = libro({ creditCards: [card([{ id: "cp1", fecha: "2026-11-08", valor: 200000 }])], expenses: [{ id: "g1", fecha: "2026-11-02", descripcion: "Chaqueta", valor: 300000, category_id: "c-ropa", origen: "tarjeta" } as never] })
    const F = flujoIntegral(b, NOV, HOY)
    expect(F.movs.find((x) => x.id === "exp:g1")).toBeUndefined()
    expect(F.porCategoria.find((c) => c.cat === "Ropa")?.v).toBe(300000)
  })
})

describe("flujo integral con cobros de suscripción enlazados", () => {
  const netflix = { id: "s1", nombre: "Netflix", valor: 44900, ciclo: "mensual", proximo: "2026-12-05", comparte: 1, currency: "COP" } as never

  it("el gasto de 'Ya se cobró' enlazado cuenta como el cobro del mes, aunque se llame distinto", () => {
    const b = libro({ subscriptions: [netflix], expenses: [{ id: "g1", fecha: "2026-11-05", descripcion: "Pago streaming", valor: 44900, category_id: "c-sub", subscription_id: "s1", sub_proximo: "2026-11-05" } as never] })
    const F = flujoIntegral(b, NOV, HOY)
    const sub = F.movs.filter((x) => x.modulo === "suscripciones")
    expect(sub).toHaveLength(1)
    expect(sub[0]).toMatchObject({ id: "sub:s1:2026-11", estado: "hecho", v: 44900, s: "Suscripción · ya se cobró" })
    expect(F.movs.find((x) => x.id === "exp:g1")).toBeUndefined()
  })

  it("sin enlace se mantiene el respaldo por nombre", () => {
    const b = libro({ subscriptions: [netflix], expenses: [{ id: "g2", fecha: "2026-11-06", descripcion: "Netflix", valor: 44900 } as never] })
    const F = flujoIntegral(b, NOV, HOY)
    expect(F.movs.filter((x) => x.modulo === "suscripciones")).toHaveLength(1)
    expect(F.movs.find((x) => x.id === "exp:g2")).toBeUndefined()
  })
})

describe("un cobro de suscripción pagado en abonos", () => {
  // El cobro del 5 de noviembre: la suscripción NO pasó al siguiente (`proximo` sigue ahí) porque fue un abono.
  const enAbonos = { id: "s1", nombre: "Netflix", valor: 44900, ciclo: "mensual", proximo: "2026-11-05", comparte: 1, currency: "COP" } as never
  const abono = (id: string, valor: number, fecha: string) =>
    ({ id, fecha, descripcion: "Netflix (abono)", valor, category_id: "c-sub", subscription_id: "s1", sub_proximo: "2026-11-05" }) as never

  it("salen los abonos como hechos y lo que falta aparte", () => {
    const F = flujoIntegral(libro({ subscriptions: [enAbonos], expenses: [abono("g1", 20000, "2026-11-05")] }), NOV, HOY)
    const sub = F.movs.filter((x) => x.modulo === "suscripciones")
    expect(sub).toHaveLength(2)
    expect(sub[0]).toMatchObject({ id: "sub:s1:2026-11", v: 20000, estado: "hecho", s: "Suscripción · abono" })
    expect(sub[1]).toMatchObject({ id: "sub:s1:2026-11:falta", v: 24900, estado: "vencido" })
    // Sale una sola vez el valor del cobro: lo abonado + lo que falta.
    expect(F.tot.gasto).toBe(44900)
  })

  it("con varios abonos que completan el cobro no queda nada por pagar", () => {
    const b = libro({ subscriptions: [enAbonos], expenses: [abono("g1", 20000, "2026-11-05"), abono("g2", 24900, "2026-11-09")] })
    const F = flujoIntegral(b, NOV, HOY)
    const sub = F.movs.filter((x) => x.modulo === "suscripciones")
    expect(sub.map((x) => x.v)).toEqual([20000, 24900])
    expect(sub.every((x) => x.estado === "hecho")).toBe(true)
    expect(F.tot.gasto).toBe(44900)
    // Y ninguno de los dos gastos sale además como gasto del día a día.
    expect(F.movs.filter((x) => x.modulo === "gastos")).toHaveLength(0)
  })

  it("si la suscripción ya pasó al siguiente cobro, lo registrado es el cobro completo (aunque sea menos)", () => {
    const paso = { ...(enAbonos as Record<string, unknown>), proximo: "2026-12-05" } as never
    const F = flujoIntegral(libro({ subscriptions: [paso], expenses: [abono("g1", 20000, "2026-11-05")] }), NOV, HOY)
    const sub = F.movs.filter((x) => x.modulo === "suscripciones")
    expect(sub).toHaveLength(1)
    expect(sub[0]).toMatchObject({ v: 20000, s: "Suscripción · ya se cobró" })
  })
})
