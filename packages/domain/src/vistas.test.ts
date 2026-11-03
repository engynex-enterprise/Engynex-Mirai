// Vistas agregadas (vistas.ts) y extras del flujo integral (integral-extras.ts): cada vista debe dar lo mismo que las
// llamadas que hace la pantalla de la web (copiadas aquí tal cual de dashboard-view, balance-view y home-view), sobre
// el libro de ejemplo de la v4 (familia Navarro) con un poco de todo (RICO).
import { describe, expect, it } from "vitest"
import { scenario } from "./__tests__/adapt"
import { RICO } from "./__tests__/fixtures"
import { assembleBook, type BookParts, type LoadedBook } from "./book-data"
import { hallazgosBalance } from "./balance"
import { capacidad, compromisos, decisiones, deudas, metasAvance, serieMeses } from "./dashboard"
import { addDays, iso, toDay } from "./dates"
import { estadoIntegral, flujoIntegral, partesEstado, periodo, snapshotMes, type ExtrasIntegral } from "./flujo-integral"
import { calEst, integralExtras, necesitaRenta, rentaDataFrom, rentaInput, type ExtrasRows } from "./integral-extras"
import { periodoDashboard, vistaBalance, vistaDashboard, vistaInicio } from "./vistas"

const HOY = "2026-10-31"
const sc = scenario(HOY).mutate(RICO)
const book = assembleBook(
  {
    book_settings: [{ ...sc.book.settings, nomina: {} }],
    categories: sc.book.categories, incomes: sc.book.incomes, extra_incomes: sc.book.extraIncomes, expenses: sc.book.expenses,
    fixed_expenses: sc.book.fixedExpenses.map((f) => ({ ...f, fixed_expense_payments: f.payments })),
    subscriptions: sc.book.subscriptions.map((s) => ({ ...s, activa: true })),
    loans: sc.book.loans.map((l) => ({ ...l, loan_payments: l.payments })),
    credit_cards: sc.book.creditCards.map((c) => ({ ...c, card_purchases: c.purchases })),
    assets: sc.book.assets, liabilities: sc.book.liabilities, investments: sc.book.investments, goals: sc.book.goals,
    calendar_events: [...sc.book.calendarEvents, { id: "cal-pred", titulo: "Impuesto predial", fecha: "2026-12-15", tipo: "egreso", monto: 0 }],
    contacts: sc.book.contacts, entities: sc.book.entities, payment_methods: [], goal_movements: [], emergency_funds: [{ activo: true, saldo: 800000, asset_id: null }],
  } as unknown as BookParts,
  HOY,
)
const rows: ExtrasRows = {
  taxAssets: [{ tipo: "inmueble", avaluo: "200000000", predial: null, imp_veh: null, soat: null, pct: "50" }],
  incCats: [], members: [{ id: "m1", nombre: "Hija" }],
  allowances: [{ id: "al1", member_id: "m1", mesada: "50000", frec: "semanal" }],
  movs: [{ allowance_id: "al1", fecha: "2026-10-25", valor: "50000" }, { allowance_id: "otra", fecha: "2026-10-25", valor: "1" }],
  fondo: [{ fecha: "2026-10-10", valor: "100000", tipo: "aporte", expense_id: null }],
}
const X = integralExtras(book, HOY, rows)

describe("integralExtras (la misma regla de useIntegralExtras y del chat)", () => {
  it("estima el predial con el avalúo y la participación, y arma mesadas y fondo", () => {
    expect(X.estimados?.["cal-pred"]).toEqual({ v: 200e6 * 0.007 * 0.5, how: "predial registrado o 7 por mil del avalúo" })
    expect(X.mesadas).toEqual([{ id: "al1", nombre: "Hija", mesada: 50000, frec: "semanal", movs: [{ fecha: "2026-10-25", valor: 50000 }] }])
    expect(X.fondo).toEqual([{ fecha: "2026-10-10", valor: 100000, tipo: "aporte", expense_id: null }])
    expect(calEst({ titulo: "Impuesto vehicular" }, book, [], 1_423_500, [])).toBeNull()
  })

  it("la renta del calendario sin valor se estima solo con la Declaración", () => {
    const conRenta = { ...book, calendarEvents: [...book.calendarEvents, { id: "cal-renta", titulo: "Declaración de renta", fecha: "2027-08-12", tipo: "egreso", monto: 0, template_key: "renta" }] } as LoadedBook
    expect(necesitaRenta(book)).toBe(false)
    expect(necesitaRenta(conRenta)).toBe(true)
    expect(integralExtras(conRenta, HOY, rows).estimados?.["cal-renta"]).toBeUndefined()
    const renta = rentaDataFrom(conRenta, {
      members: [{ id: "m0", nombre: "Alberto", rol: "Titular", es_titular: true }], incomeCategories: [], bienes: [], years: [],
      perfil: { nombre: "Alberto", digitos: "07", doc: "1" }, fechas: [], attachments: [], liabilities: [{ nombre: "x", cod: "21", valor: "5", currency: "COP" }], ref: { uvt: {}, smmlv: {} },
    })
    expect(renta.book.fixedExpenses).toEqual([])
    expect(renta.perfil).toEqual({ nombre: "Alberto", digitos: "07", doc: "1" })
    expect(renta.liabilitiesNamed).toEqual([{ nombre: "x", cod: "21", valor: 5, currency: "COP" }])
    expect(rentaInput(renta, 2026, "m0")).toMatchObject({ tax: null, members: renta.members })
    // Con la Declaración armada, el estimado sale si hay saldo a pagar (y nunca rompe el cálculo).
    expect(() => integralExtras(conRenta, HOY, { ...rows, renta })).not.toThrow()
  })
})

describe("vistas = lo que calculan las pantallas de la web", () => {
  it("periodo del Dashboard", () => {
    expect(periodoDashboard("mes", HOY)).toEqual({ a: "2026-10-01", b: "2026-10-31", tipo: "mes" })
    expect(periodoDashboard("mes-pasado", HOY)).toEqual({ a: "2026-09-01", b: "2026-09-30", tipo: "mes" })
    expect(periodoDashboard("3m", HOY)).toEqual({ a: "2026-08-01", b: "2026-10-31", tipo: "rango" })
    expect(periodoDashboard("12m", "2026-01-15")).toEqual({ a: "2025-02-01", b: "2026-01-31", tipo: "rango" })
    expect(periodoDashboard("anio", HOY)).toEqual({ a: "2026-01-01", b: "2026-12-31", tipo: "anio" })
  })

  it("Dashboard (DashboardView)", () => {
    const snaps = [{ mes: "2026-08", patrimonio: "1000" }, { mes: "2026-10", patrimonio: "999" }]
    const v = vistaDashboard(book, HOY, X, "mes", snaps)
    // Copia de DashboardView.useMemo
    const P = { a: "2026-10-01", b: "2026-10-31", tipo: "mes" as const }
    const F = flujoIntegral(book, P, HOY, X), E = estadoIntegral(book, HOY, X)
    const comp = compromisos(book, HOY), cap = capacidad(book, HOY, comp, E.liquidez), deu = deudas(book, HOY)
    const t = toDay(HOY)
    const R = flujoIntegral(book, { a: iso(addDays(t, -90)), b: iso(addDays(t, 365)), tipo: "rango" }, HOY, X)
    const vencidos = R.movs.filter((x) => x.estado === "vencido")
    expect(v.flujo).toEqual(F)
    expect(v.estado).toEqual(E)
    expect(v.serie).toEqual(serieMeses(book, HOY, X))
    expect(v.compromisos).toEqual(comp)
    expect(v.capacidad).toEqual(cap)
    expect(v.deudas).toEqual(deu)
    expect(v.vencidos).toEqual(vencidos)
    expect(v.decisiones).toEqual(decisiones(book, HOY, { comp, cap, deu, vencidos, proximos: R.movs }))
    expect(v.metas).toEqual(metasAvance(book, HOY))
    expect(v.patrimonio).toEqual([{ mes: "2026-08", v: 1000 }, { mes: "2026-10", v: E.pat }])
    expect(v.totales.queda).toBe(F.tot.queda - F.tot.credEntra + F.tot.credSale)
    expect(v.categorias.reduce((a, c) => a + c.v, 0)).toBeCloseTo(F.porCategoria.reduce((a, c) => a + Math.round(c.v), 0), -1)
    expect(F.tot.entra).toBeGreaterThan(0)
  })

  it("Balance (BalanceView) en la pestaña general y en una quincena de otro mes", () => {
    for (const [tab, ym] of [["general", "2026-10"], ["q1", "2026-09"]] as const) {
      const v = vistaBalance(book, HOY, X, tab, ym)
      const E = estadoIntegral(book, HOY, X)
      const C = { T: { ...E.T, P: E.P, pat: E.pat }, liquidez: E.liquidez, tengo: partesEstado(E.tengo), debo: partesEstado(E.debo) }
      const [y, m] = ym.split("-").map(Number)
      const P = periodo(book, tab === "general" ? "mes" : tab, y, m - 1)
      const F = flujoIntegral(book, P, HOY, X)
      const mesHoy = P.tipo === "mes" && ym === HOY.slice(0, 7) ? F : flujoIntegral(book, periodo(book, "mes", 2026, 9), HOY, X)
      expect(v.estado).toEqual(E)
      expect(v.flujo).toEqual(F)
      expect(v.hallazgos).toEqual(hallazgosBalance(book, HOY, mesHoy, C))
      expect(v.snapshot).toEqual(snapshotMes(book, HOY, X))
      expect(v.partes).toEqual({ tengo: C.tengo, debo: C.debo })
    }
  })

  it("Inicio (HomeView): te queda esta quincena", () => {
    const v = vistaInicio(book, HOY, X)
    const F = flujoIntegral(book, periodo(book, "q2", 2026, 9), HOY, X)
    expect(v.quincena).toBe("q2")
    expect(v.q).toMatchObject({ E: F.tot.entra, Sa: F.tot.sale + F.tot.ahorro, disp: F.tot.queda })
    expect(v.totales.pat).toBe(estadoIntegral(book, HOY, X).pat)
    const sinExtras: ExtrasIntegral = {}
    expect(vistaInicio(book, HOY, sinExtras).q.disp).toBe(flujoIntegral(book, periodo(book, "q2", 2026, 9), HOY, sinExtras).tot.queda)
  })
})
