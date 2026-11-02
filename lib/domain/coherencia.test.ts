// Coherencia entre motores (P2-1): con el mismo libro, Inicio, Balance, Dashboard, Flujo de caja y el contexto del
// chat y el consejero (finCtx) dan las mismas cifras, porque salen del flujo integral y de `compromisos`/`capacidad`.
import { describe, expect, it } from "vitest"
import { finCtx } from "./advisor"
import { conSaldos, type LibroCuentas } from "./cuentas"
import { capacidad, compromisos, proyeccionMeses, serieMeses } from "./dashboard"
import { estadoIntegral, flujoIntegral, periodo } from "./flujo-integral"
import { liquidez } from "./totals"

const HOY = "2026-11-10"

function libro(): LibroCuentas {
  return {
    settings: { umbral: 25000, limite: 200000, trm: {}, emerg_meta: 6, anticipo: 5, corte_q: 15, alerta_pres: 80 },
    categories: [{ id: "c-mer", nombre: "Mercado", icon: "shopping-cart", tope: 600000, grupo: "n" }, { id: "c-aho", nombre: "Ahorro", icon: "piggy-bank", tope: 0, grupo: "a" }],
    incomes: [{ id: "i1", concepto: "Sueldo", valor: 2000000, frec: "quincenal", dia: 15, currency: "COP", payment_method_id: "m1", created_at: "2026-01-01T00:00:00Z" } as never],
    extraIncomes: [{ id: "x1", fecha: "2026-11-03", descripcion: "Venta", valor: 90000, payment_method_id: "m1", created_at: "2026-11-03T10:00:00Z" } as never],
    expenses: [
      { id: "e1", fecha: "2026-11-04", descripcion: "Mercado", valor: 180000, category_id: "c-mer", payment_method_id: "m1", created_at: "2026-11-04T10:00:00Z" } as never,
      { id: "e2", fecha: "2026-11-05", descripcion: "Arriendo", valor: 1200000, fixed_expense_id: "f1", periodo: "2026-11", payment_method_id: "m1", created_at: "2026-11-05T10:00:00Z" } as never,
    ],
    fixedExpenses: [
      { id: "f1", nombre: "Arriendo", valor: 1200000, frec: "mensual", dia: 5, payments: [{ periodo: "2026-11", fecha: "2026-11-05", valor: 1200000 }] } as never,
      { id: "ap", nombre: "Aporte a meta: Viaje", valor: 100000, frec: "mensual", dia: 20, link_type: "meta", link_id: "g1", payments: [] } as never,
    ],
    subscriptions: [{ id: "s1", nombre: "Netflix", valor: 40000, ciclo: "mensual", proximo: "2026-11-20", currency: "COP" }],
    loans: [{ id: "L1", kind: "pagar", tipo: "banco", entity_id: "en1", monto: 1200000, sistema: "sin", tasa: 0, frec: "mensual", plazo: 12, inicio: "2026-10-12", extra: 0, payments: [] }] as never,
    creditCards: [{ id: "t1", nombre: "Visa", corte: 25, pago: 10, tasa: 2, cupo: 3000000, purchases: [{ id: "cp", fecha: "2026-10-20", valor: 300000, cuotas: 3 }] }] as never,
    assets: [{ id: "a1", cod: "1110", nombre: "Nequi", valor: 2000000, currency: "COP", saldo_base: 2000000, saldo_fecha: "2026-11-01", saldo_at: "2026-11-01T12:00:00Z" } as never],
    liabilities: [],
    investments: [],
    goals: [{ id: "g1", nombre: "Viaje", objetivo: 3000000, ahorrado: 400000, fecha: "2027-06-01" }],
    calendarEvents: [],
    contacts: [],
    entities: [{ id: "en1", nombre: "Banco Bogotá" }],
    paymentMethods: [{ id: "m1", nombre: "Nequi", asset_id: "a1" }],
    goalMovements: [{ id: "gm1", goal_id: "g1", tipo: "abono", valor: 50000, fecha: "2026-11-06" }],
    fund: { activo: true, saldo: 600000 },
  }
}

describe("coherencia entre motores", () => {
  const b = conSaldos(libro(), HOY)
  const E = estadoIntegral(b, HOY)
  const C = compromisos(b, HOY)

  it("el saldo de la cuenta es el mismo en Balance, Dashboard, Flujo de caja y el chat", () => {
    // 2.000.000 + 90.000 − 180.000 − 1.200.000 (el arriendo cuenta una vez: su gasto).
    expect(b.assets[0].valor).toBe(710000)
    expect(E.liquidez).toBe(710000)
    expect(liquidez(b.assets, b.investments, b.settings.trm, HOY)).toBe(710000)
    expect(finCtx(b, HOY).disponible).toBe(710000)
    expect(capacidad(b, HOY, C).liquidez).toBe(710000)
  })

  it("finCtx (chat y consejero) usa los mismos compromisos y la misma capacidad del Dashboard", () => {
    const K = capacidad(b, HOY, C, E.liquidez, null)
    const f = finCtx(b, HOY)
    expect(f.ingreso_mensual).toBe(Math.round(C.ingreso))
    expect(f.gastos_fijos_mes).toBe(Math.round(C.fijos))
    expect(f.aportes_ahorro_mes).toBe(Math.round(C.aportes))
    expect(f.cuotas_deudas_mes).toBe(Math.round(C.cuotas))
    expect(f.tarjetas_mes).toBe(Math.round(C.tarjetas))
    expect(f.suscripciones_mes).toBe(Math.round(C.subs))
    expect(f.gasto_variable_mes).toBe(Math.round(K.variable))
    expect(f.puede_ahorrar_mes).toBe(Math.round(K.libre))
  })

  it("Inicio («Te queda esta quincena») y el Balance de la quincena son el mismo cálculo", () => {
    const P = periodo(b, "q1", 2026, 10)
    const F = flujoIntegral(b, P, HOY)
    // Inicio: E = entra, Sa = sale + ahorro, disp = queda (features/home/home-view.tsx).
    expect(F.tot.entra - (F.tot.sale + F.tot.ahorro)).toBeCloseTo(F.tot.queda)
    expect(F.disp).toBe(F.tot.queda)
  })

  it("el Flujo de caja de los próximos meses cierra igual que el flujo integral de cada mes", () => {
    const Pr = proyeccionMeses(b, HOY)
    expect(Pr).toHaveLength(12)
    expect(Pr[0]).toMatchObject({ k: "2026-11", parcial: true })
    let saldo = E.liquidez
    for (const [i, m] of Pr.entries()) {
      saldo += m.neto
      expect(m.saldo).toBeCloseTo(saldo)
      expect(m.det.ing + m.det.cob - (m.det.cuo + m.det.fij + m.det.sub + m.det.var + m.det.aho)).toBeCloseTo(m.neto)
      if (i === 0) continue
      const [y, mm] = m.k.split("-").map(Number)
      const F = flujoIntegral(b, periodo(b, "mes", y, mm - 1), HOY)
      expect(m.neto).toBeCloseTo(F.tot.queda)
    }
    // El mes en curso solo suma lo que falta: lo que ya pasó está en el saldo de hoy.
    const nov = flujoIntegral(b, periodo(b, "mes", 2026, 10), HOY)
    const falta = nov.movs.filter((x) => !(x.estado === "hecho" && x.fecha <= HOY))
    const neto = falta.reduce((a, x) => a + (x.dir === "entra" ? x.v : -x.v), 0)
    expect(Pr[0].neto).toBeCloseTo(neto)
  })

  it("el Dashboard (serie) y el Balance cuentan igual el ahorro del mes, con el abono a la meta", () => {
    const nov = flujoIntegral(b, periodo(b, "mes", 2026, 10), HOY)
    expect(serieMeses(b, HOY).at(-1)!.ahorro).toBeCloseTo(nov.tot.ahorro)
    expect(nov.movs.some((x) => x.id === "meta:gm1" && x.clase === "ahorro")).toBe(true)
  })

  it("el patrimonio de Inicio, Balance y Dashboard es el del estado integral (con el ahorro apartado)", () => {
    expect(E.apartado).toBe(400000 + 600000)
    expect(E.pat).toBeCloseTo(E.A - E.P)
    expect(E.A).toBeCloseTo(E.T.A + E.apartado)
  })
})
