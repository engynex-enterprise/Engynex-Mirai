import { describe, expect, it } from "vitest"
import { capacidad, compromisos, decisiones, deudas, metasAvance, serieMeses } from "./dashboard"
import { estadoIntegral, flujoIntegral, periodo } from "./flujo-integral"
import { fondoEstado } from "./savings"
import type { BookData } from "./types"

const HOY = "2026-11-10"

function libro(extra: Partial<BookData> = {}): BookData {
  return {
    settings: { umbral: 25000, limite: 200000, trm: {}, emerg_meta: 6, anticipo: 5, corte_q: 15, alerta_pres: 80 },
    categories: [{ id: "c-mer", nombre: "Mercado", icon: "shopping-cart", tope: 600000, grupo: "n" }],
    incomes: [{ id: "i1", concepto: "Sueldo", valor: 2000000, frec: "quincenal", dia: 15, currency: "COP" }],
    extraIncomes: [],
    expenses: [],
    fixedExpenses: [{ id: "f1", nombre: "Arriendo", valor: 1500000, frec: "mensual", dia: 5, category_id: null, payments: [] } as never],
    subscriptions: [
      { id: "s1", nombre: "Netflix", valor: 40000, ciclo: "mensual", proximo: "2026-11-20", currency: "COP" },
      { id: "s2", nombre: "Spotify", valor: 20000, ciclo: "mensual", proximo: "2026-11-25", currency: "COP" },
    ],
    loans: [
      { id: "L1", kind: "pagar", tipo: "banco", entity_id: "en1", monto: 6000000, sistema: "frances", tasa: 2, frec: "mensual", plazo: 12, inicio: "2026-10-10", extra: 0, payments: [{ id: "p1", fecha: "2026-11-09", tipo: "cuota", valor: 0 }] },
      { id: "L2", kind: "pagar", tipo: "persona", contact_id: "ct1", monto: 1000000, sistema: "sin", tasa: 0, frec: "mensual", plazo: 4, inicio: "2026-09-01", extra: 0, payments: [] },
    ] as never,
    creditCards: [],
    assets: [{ id: "a1", cod: "1110", valor: 3000000, currency: "COP" }],
    liabilities: [],
    investments: [],
    goals: [{ id: "g1", nombre: "Viaje", objetivo: 2000000, ahorrado: 500000, fecha: "2027-05-01" }],
    calendarEvents: [],
    contacts: [{ id: "ct1", nombre: "Juan" }],
    entities: [{ id: "en1", nombre: "Banco Bogotá" }],
    ...extra,
  }
}

describe("dashboard", () => {
  it("serieMeses: 12 meses que terminan en el actual, con la cuenta de cada mes", () => {
    const b = libro()
    const S = serieMeses(b, HOY)
    expect(S).toHaveLength(12)
    expect(S[0].k).toBe("2025-12")
    expect(S.at(-1)).toMatchObject({ k: "2026-11", parcial: true })
    for (const m of S) expect(m.queda).toBeCloseTo(m.entra - m.sale - m.ahorro)
    // Noviembre igual que el flujo integral del mes.
    const F = flujoIntegral(b, periodo(b, "mes", 2026, 10), HOY)
    expect(S.at(-1)!.entra).toBeCloseTo(F.tot.entra - F.tot.credEntra)
    expect(S.at(-1)!.sale).toBeCloseTo(F.tot.sale - F.tot.credSale)
    // El crédito del banco (octubre) entra en el Balance, pero no es un ingreso en la serie.
    const oct = S.find((m) => m.k === "2026-10")!
    const Foct = flujoIntegral(b, periodo(b, "mes", 2026, 9), HOY)
    expect(Foct.tot.credEntra).toBe(6000000)
    expect(oct.entra).toBeCloseTo(Foct.tot.entra - 6000000)
  })

  it("compromisos y capacidad de ahorro frente al ingreso", () => {
    const b = libro()
    const C = compromisos(b, HOY)
    expect(C.ingreso).toBe(4000000)
    expect(C.fijos).toBe(1500000)
    expect(C.subs).toBe(60000)
    expect(C.total).toBeCloseTo(C.fijos + C.cuotas + C.tarjetas + C.subs)
    expect(C.pct).toBeCloseTo(C.total / 4000000)
    const K = capacidad(b, HOY, C)
    expect(K.variable).toBe(600000) // sin gastos de meses anteriores, usa el presupuesto
    expect(K.libre).toBeCloseTo(4000000 - C.total - 600000)
    expect(K.meses).toBeCloseTo(K.liquidez / K.basicos)
  })

  it("deudas: cuándo terminan, intereses que faltan y el saldo bajando hasta 0", () => {
    const D = deudas(libro(), HOY)
    expect(D.items.map((x) => x.id)).toEqual(["L1", "L2"])
    const banco = D.items[0]
    expect(banco.interesFalta).toBeGreaterThan(0)
    expect(banco.ea).toBeCloseTo(Math.pow(1.02, 12) - 1)
    expect(banco.fin).toBe("2027-10-10")
    expect(D.libre).toBe("2027-10-10")
    expect(D.serie[0].saldo).toBeCloseTo(D.total)
    expect(D.serie.at(-1)!.saldo).toBeLessThanOrEqual(1)
    for (let i = 1; i < D.serie.length; i++) expect(D.serie[i].saldo).toBeLessThanOrEqual(D.serie[i - 1].saldo + 1)
  })

  it("metasAvance: progreso y cuánto guardar al mes", () => {
    expect(metasAvance(libro(), HOY)[0]).toMatchObject({ nombre: "Viaje", progreso: 0.25, falta: 1500000 })
  })

  it("decisiones: atrasos primero, la deuda más cara, compromisos, ahorro y fondo, con impacto en pesos", () => {
    const b = libro()
    const C = compromisos(b, HOY)
    const K = capacidad(b, HOY, C)
    const D = deudas(b, HOY)
    const R = flujoIntegral(b, { a: "2026-08-12", b: "2026-12-10", tipo: "rango" }, HOY)
    const L = decisiones(b, HOY, { comp: C, cap: K, deu: D, vencidos: R.movs.filter((x) => x.estado === "vencido"), proximos: R.movs })
    const ids = L.map((x) => x.id)
    expect(ids[0]).toBe("atrasos") // cuotas de Juan sin pagar
    expect(ids).toEqual(expect.arrayContaining(["deuda-cara", "abono", "compromisos", "ahorro", "fondo", "subs"]))
    expect(L.find((x) => x.id === "deuda-cara")?.titulo).toMatch(/Banco Bogotá/)
    expect(L.find((x) => x.id === "abono")?.impacto).toBeGreaterThan(0)
    expect(L.find((x) => x.id === "subs")?.impacto).toBe(480000)
    for (const x of L) expect(x.href).toMatch(/^\//)
  })
})

describe("dashboard ↔ metas: el fondo de emergencia da lo mismo en las dos pantallas", () => {
  it("con el fondo activo, capacidad usa su saldo (como Metas) y no todo el dinero disponible", () => {
    const b = { ...libro(), fund: { activo: true, saldo: 900000 } } as BookData
    const C = compromisos(b, HOY)
    const K = capacidad(b, HOY, C)
    // Lo mismo que calcula Metas (goals-view → fondoEstado) con la liquidez del estado.
    const M = fondoEstado(b, HOY, estadoIntegral(b, HOY).liquidez, { activo: true, saldo: 900000 })
    expect(K.fondo).toBe(900000)
    expect(K.enFondo).toBe(true)
    expect(K.faltaFondo).toBe(M.falta)
    expect(K.meses).toBeCloseTo(M.meses)
    expect(K.metaMeses).toBe(M.metaMeses)
    expect(K.liquidez).toBe(3000000)
    // La decisión del fondo dice la misma cifra.
    const D = decisiones(b, HOY, { comp: C, cap: K, deu: deudas(b, HOY), vencidos: [], proximos: [] }).find((x) => x.id === "fondo")
    expect(D?.impacto).toBe(M.falta)
  })
  it("sin fondo activo los dos usan el dinero disponible", () => {
    const b = libro()
    const K = capacidad(b, HOY)
    expect(K.fondo).toBe(K.liquidez)
    expect(K.faltaFondo).toBe(fondoEstado(b, HOY, K.liquidez, null).falta)
  })
  it("un abono a una meta sube lo que ahorras del mes", () => {
    const sin = flujoIntegral(libro(), periodo(libro(), "mes", 2026, 10), HOY).tot.ahorro
    const b = { ...libro(), goalMovements: [{ id: "m1", goal_id: "g1", tipo: "abono", valor: 120000, fecha: "2026-11-09" }] } as BookData
    expect(flujoIntegral(b, periodo(b, "mes", 2026, 10), HOY).tot.ahorro).toBe(sin + 120000)
    expect(serieMeses(b, HOY).at(-1)!.ahorro).toBe(sin + 120000)
  })
})
