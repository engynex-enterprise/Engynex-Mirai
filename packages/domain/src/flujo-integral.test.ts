import { describe, expect, it } from "vitest"
import { quincenaBalance } from "./balance"
import { tarjetaPagoMes } from "./cards"
import { cuentaTMes, estadoIntegral, periodosDelLibro, flujoIntegral, partesEstado, periodo, type ExtrasIntegral } from "./flujo-integral"
import { totales } from "./totals"
import type { BookData } from "./types"

const HOY = "2026-11-10"

/** Libro con un poco de todo: sueldo, fijos (uno pagado), tarjeta, deuda, préstamo que me deben, suscripción, metas… */
function libro(extra: Partial<BookData> = {}): BookData {
  return {
    settings: { umbral: 25000, limite: 200000, trm: {}, emerg_meta: 6, anticipo: 5, corte_q: 15, alerta_pres: 80 },
    categories: [
      { id: "c-mer", nombre: "Mercado", icon: "shopping-cart", tope: 600000, grupo: "n" },
      { id: "c-arr", nombre: "Arriendo", icon: "house", tope: 0, grupo: "n" },
      { id: "c-ropa", nombre: "Ropa", icon: "shirt", tope: 0, grupo: "g" },
      { id: "c-aho", nombre: "Ahorro", icon: "piggy-bank", tope: 300000, grupo: "a" },
    ],
    incomes: [{ id: "i1", concepto: "Sueldo", valor: 2000000, frec: "quincenal", dia: 15, currency: "COP" }],
    extraIncomes: [],
    expenses: [],
    fixedExpenses: [],
    subscriptions: [],
    loans: [],
    creditCards: [],
    assets: [{ id: "a1", cod: "1110", valor: 5000000, currency: "COP" }],
    liabilities: [],
    investments: [],
    goals: [],
    calendarEvents: [],
    contacts: [{ id: "ct1", nombre: "Juan" }],
    entities: [{ id: "en1", nombre: "Banco Bogotá" }],
    ...extra,
  }
}

const NOV = periodo(libro(), "mes", 2026, 10)
const OCT = periodo(libro(), "mes", 2026, 9)
const gasto = (o: Record<string, unknown>) => ({ id: String(o.id), fecha: "2026-11-08", descripcion: "Mercado D1", valor: 150000, category_id: "c-mer", ...o }) as never
const fijo = (o: Record<string, unknown>) => ({ id: "f1", nombre: "Arriendo", valor: 1200000, frec: "mensual", dia: 5, category_id: "c-arr", payments: [], ...o }) as never

describe("periodo", () => {
  it("quincenas con el corte del libro, mes y año", () => {
    const b = libro()
    expect(periodo(b, "q1", 2026, 10)).toEqual({ a: "2026-11-01", b: "2026-11-15", tipo: "q1" })
    expect(periodo(b, "q2", 2026, 10)).toEqual({ a: "2026-11-16", b: "2026-11-30", tipo: "q2" })
    expect(periodo({ settings: { ...b.settings, corte_q: 20 } }, "q2", 2026, 1)).toEqual({ a: "2026-02-21", b: "2026-02-28", tipo: "q2" })
    expect(periodo(b, "anio", 2026)).toEqual({ a: "2026-01-01", b: "2026-12-31", tipo: "anio" })
  })
})

describe("flujoIntegral: no contar dos veces", () => {
  it("el gasto creado al pagar un fijo cuenta una sola vez, como el pago del fijo", () => {
    const b = libro({
      fixedExpenses: [fijo({ payments: [{ periodo: "2026-11", fecha: "2026-11-04", valor: 1250000 }] })],
      expenses: [gasto({ id: "g-arr", descripcion: "Arriendo", valor: 1250000, category_id: "c-arr", fixed_expense_id: "f1", fecha: "2026-11-04" })],
    })
    const F = flujoIntegral(b, NOV, HOY)
    const arr = F.movs.filter((x) => /Arriendo/.test(x.n))
    expect(arr).toHaveLength(1)
    expect(arr[0]).toMatchObject({ id: "fijo:f1:2026-11", modulo: "fijos", estado: "hecho", v: 1250000, fecha: "2026-11-04", cat: "Arriendo" })
    expect(F.movs.find((x) => x.id === "exp:g-arr")).toBeUndefined()
  })

  it("tarjeta en base caja: sale el pago de la tarjeta, no la compra; la compra sí cuenta en categorías", () => {
    const card = { id: "t1", nombre: "Visa", corte: 25, pago: 10, tasa: 0, cupo: 5000000, purchases: [{ id: "p1", fecha: "2026-10-01", valor: 600000, cuotas: 3 }] } as never
    const b = libro({ creditCards: [card], expenses: [gasto({ id: "g-ropa", descripcion: "Chaqueta", valor: 600000, category_id: "c-ropa", origen: "tarjeta", fecha: "2026-10-01" })] })
    const oct = flujoIntegral(b, OCT, HOY)
    expect(oct.movs.find((x) => x.id === "exp:g-ropa")).toBeUndefined()
    expect(oct.porCategoria.find((c) => c.cat === "Ropa")?.v).toBe(600000)
    const nov = flujoIntegral(b, NOV, HOY)
    const pago = nov.movs.find((x) => x.modulo === "tarjetas")!
    expect(pago).toMatchObject({ clase: "deuda", fecha: "2026-11-10", v: tarjetaPagoMes(card, HOY, 0) })
    expect(pago.v).toBe(200000)
    expect(nov.tot.deuda).toBe(200000)
  })

  it("la cuota de un préstamo registrada como gasto no se repite; sale la cuota del plan con su fecha", () => {
    const L = { id: "L1", kind: "pagar", tipo: "banco", entity_id: "en1", monto: 1200000, sistema: "sin", tasa: 0, frec: "mensual", plazo: 12, inicio: "2026-06-10", extra: 0,
      payments: ["2026-07-10", "2026-08-10", "2026-09-10", "2026-10-09"].map((fecha, i) => ({ id: `p${i}`, fecha, tipo: "cuota", valor: 0 })) } as never
    const b = libro({ loans: [L], expenses: [gasto({ id: "g-cuota", descripcion: "Cuota banco", valor: 100000, origen: "prestamo", fecha: "2026-10-09" })] })
    const oct = flujoIntegral(b, OCT, HOY)
    expect(oct.movs.find((x) => x.id === "exp:g-cuota")).toBeUndefined()
    expect(oct.movs.filter((x) => x.modulo === "le-debo")).toEqual([expect.objectContaining({ id: "loan:L1:c4", fecha: "2026-10-09", v: 100000, estado: "hecho" })])
    const nov = flujoIntegral(b, NOV, HOY)
    expect(nov.movs.find((x) => x.id === "loan:L1:c5")).toMatchObject({ fecha: "2026-11-10", estado: "programado", clase: "deuda" })
    // El desembolso entra en junio como préstamo recibido (no como ingreso).
    const jun = flujoIntegral(b, periodo(b, "mes", 2026, 5), HOY)
    expect(jun.movs.find((x) => x.id === "loan:L1:desembolso")).toMatchObject({ dir: "entra", clase: "credito", v: 1200000 })
  })

  it("el cobro de una suscripción registrado con 'Ya se cobró' se empareja con el cobro del mes", () => {
    const b = libro({
      subscriptions: [{ id: "s1", nombre: "Netflix", valor: 40000, ciclo: "mensual", proximo: "2026-11-20", currency: "COP" }],
      expenses: [gasto({ id: "g-net", descripcion: "netflix", valor: 41000, category_id: null, fecha: "2026-10-21" })],
    })
    const oct = flujoIntegral(b, OCT, HOY)
    const subs = oct.movs.filter((x) => /netflix/i.test(x.n))
    expect(subs).toHaveLength(1)
    expect(subs[0]).toMatchObject({ modulo: "suscripciones", estado: "hecho", v: 41000, fecha: "2026-10-21" })
    expect(subs[0].supuesto).toBeUndefined()
    // Noviembre: aún no se cobra → programado.
    expect(flujoIntegral(b, NOV, HOY).movs.find((x) => x.modulo === "suscripciones")).toMatchObject({ estado: "programado", fecha: "2026-11-20", v: 40000 })
  })

  it("usar el fondo de emergencia: el gasto cuenta y el retiro de ahorro entra; guardar con un aporte no se repite", () => {
    const X: ExtrasIntegral = { fondo: [
      { fecha: "2026-11-03", valor: 100000, tipo: "guardar" },
      { fecha: "2026-11-04", valor: 50000, tipo: "guardar", expense_id: "g-ap" },
      { fecha: "2026-11-06", valor: 80000, tipo: "usar", expense_id: "g-imp" },
    ] }
    const b = libro({ expenses: [gasto({ id: "g-imp", descripcion: "Dentista", valor: 80000, category_id: null, fecha: "2026-11-06" })] })
    const F = flujoIntegral(b, NOV, HOY, X)
    expect(F.movs.filter((x) => x.modulo === "metas").map((x) => [x.dir, x.v])).toEqual([["sale", 100000], ["entra", 80000]])
    expect(F.movs.find((x) => x.id === "exp:g-imp")?.v).toBe(80000)
    expect(F.tot.ahorro).toBe(20000)
  })

  it("un impuesto del calendario que ya es un gasto fijo no se estima otra vez", () => {
    const b = libro({
      fixedExpenses: [fijo({ id: "f-veh", nombre: "Impuesto vehicular", frec: "anual", mes: 5, dia: 15, category_id: null })],
      calendarEvents: [{ id: "e1", titulo: "Impuesto vehicular Bogotá con 10 % de descuento", fecha: "2026-05-15", tipo: "egreso", monto: 0, anual: true, template_key: "veh_bog" } as never],
    })
    const F = flujoIntegral(b, periodo(b, "anio", 2026), HOY, { estimados: { e1: { v: 900000 } } })
    expect(F.movs.filter((x) => /vehicular/i.test(x.n)).map((x) => x.modulo)).toEqual(["fijos"])
  })
})

describe("flujoIntegral: fechas, estados y totales", () => {
  it("ingresos por su fecha de pago: lo que ya pasó se supone recibido y lo que viene queda programado", () => {
    const F = flujoIntegral(libro(), NOV, HOY)
    expect(F.ent.map((x) => [x.fecha, x.estado])).toEqual([["2026-11-15", "programado"], ["2026-11-30", "programado"]])
    const oct = flujoIntegral(libro(), OCT, HOY)
    expect(oct.ent.every((x) => x.estado === "hecho" && x.supuesto)).toBe(true)
    expect(oct.tot.entra).toBe(4000000)
  })

  it("un ingreso no aparece antes del mes en que se registró", () => {
    const b = libro({ incomes: [{ id: "i1", concepto: "Sueldo", valor: 2000000, frec: "mensual", dia: 30, currency: "COP", created_at: "2026-10-12T10:00:00Z" } as never] })
    expect(flujoIntegral(b, periodo(b, "mes", 2026, 8), HOY).tot.entra).toBe(0)
    expect(flujoIntegral(b, OCT, HOY).tot.entra).toBe(2000000)
  })

  it("fijos sin pagar y cuotas que te deben: vencidos si ya pasó su fecha", () => {
    const cobrar = { id: "L2", kind: "cobrar", tipo: "presto", contact_id: "ct1", monto: 500000, sistema: "sin", tasa: 0, frec: "mensual", plazo: 5, inicio: "2026-07-01", extra: 0, payments: [] } as never
    const b = libro({ fixedExpenses: [fijo({ id: "f2", nombre: "Internet", valor: 90000, dia: 3, category_id: null })], loans: [cobrar] })
    const F = flujoIntegral(b, NOV, HOY)
    expect(F.movs.find((x) => x.id === "fijo:f2:2026-11")).toMatchObject({ estado: "vencido", cat: "Gastos fijos" })
    expect(F.movs.find((x) => x.id === "loan:L2:c4")).toMatchObject({ dir: "entra", clase: "cobro", estado: "vencido", v: 100000 })
    expect(F.tot.vencidoSale).toBe(90000)
    expect(F.tot.vencidoEntra).toBe(100000)
    expect(F.tot.nVencidos).toBe(2)
    // Le prestaste en julio: sale como préstamo hecho.
    expect(flujoIntegral(b, periodo(b, "mes", 2026, 6), HOY).movs.find((x) => x.id === "loan:L2:desembolso")).toMatchObject({ dir: "sale", clase: "credito", v: 500000 })
  })

  it("aportes, inversiones y fondo son ahorro (no gasto) y la cuenta cierra: queda = entra − sale − ahorro", () => {
    const b = libro({
      fixedExpenses: [fijo({ id: "f-meta", nombre: "Viaje", valor: 200000, dia: 20, category_id: null, link_type: "meta", link_id: "g1" })],
      investments: [{ id: "iv1", tipo: "cdt", nombre: "CDT", capital: 1000000, tasa: 10, inicio: "2026-11-02", dias: 90, currency: "COP" }],
      expenses: [gasto({ id: "g1" })],
    })
    const F = flujoIntegral(b, NOV, HOY, { mesadas: [{ id: "m1", nombre: "Sofi", mesada: 20000, frec: "semanal", movs: [{ fecha: "2026-11-02", valor: 20000 }, { fecha: "2026-11-05", valor: -5000 }] }] })
    expect(F.movs.find((x) => x.id === "fijo:f-meta:2026-11")).toMatchObject({ clase: "ahorro", modulo: "metas" })
    expect(F.movs.find((x) => x.id === "inv:iv1")).toMatchObject({ clase: "ahorro", estado: "hecho", v: 1000000 })
    expect(F.tot.ahorro).toBe(1200000)
    expect(F.movs.filter((x) => x.modulo === "mesadas").map((x) => [x.estado, Math.round(x.v)])).toEqual([["hecho", 20000], ["programado", 60000]])
    expect(F.tot.queda).toBeCloseTo(F.tot.entra - F.tot.sale - F.tot.ahorro)
    expect(F.disp).toBeCloseTo(F.E - F.Sa)
    const todas = F.movs.reduce((a, x) => a + (x.dir === "entra" ? x.v : -x.v), 0)
    expect(F.tot.queda).toBeCloseTo(todas)
  })

  it("presupuesto: por gastar = tope − lo gastado (también con tarjeta) y nada en un mes que ya pasó", () => {
    const b = libro({ expenses: [gasto({ id: "g1" }), gasto({ id: "g2", valor: 50000, origen: "tarjeta" })] })
    const F = flujoIntegral(b, NOV, HOY)
    expect(F.presupuesto).toBe(600000)
    expect(F.porGastar).toBe(400000)
    expect(F.movs.find((x) => x.modulo === "presupuesto")).toMatchObject({ estado: "estimado", v: 400000, fecha: "2026-11-30" })
    expect(F.gastado).toBe(150000)
    expect(flujoIntegral(b, OCT, HOY).porGastar).toBe(0)
  })

  it("con sueldo, fijo, presupuesto y gastos coincide con quincenaBalance (mismo resultado del Balance anterior)", () => {
    const b = libro({ fixedExpenses: [fijo({})], expenses: [gasto({ id: "g1" })] })
    for (const w of ["q1", "q2", "mes"] as const) {
      const F = flujoIntegral(b, periodo(b, w, 2026, 10), HOY)
      const q = quincenaBalance(b, 2026, 10, w, HOY)
      expect([F.E, F.Sa, F.disp, F.porGastar]).toEqual([q.E, q.Sa, q.disp, q.porGastar])
    }
  })

  it("impuestos del calendario: con valor, estimado o sin valor; agrupados por módulo", () => {
    const b = libro({ calendarEvents: [
      { id: "e1", titulo: "Predial Bogotá (último plazo)", fecha: "2026-07-10", tipo: "egreso", monto: 0, anual: true, template_key: "pred_bog2" },
      { id: "e2", titulo: "Declaración de renta (DIAN)", fecha: "2026-12-10", tipo: "egreso", monto: 1500000, anual: false, template_key: "renta" },
      { id: "e3", titulo: "Impuesto vehicular Bogotá (último plazo)", fecha: "2026-07-24", tipo: "egreso", monto: 0, anual: true, template_key: "veh_bog2" },
      { id: "e4", titulo: "Prima de servicios (2º semestre)", fecha: "2026-12-20", tipo: "ingreso", monto: 1000000, anual: true },
    ] as never })
    const F = flujoIntegral(b, periodo(b, "anio", 2026), HOY, { estimados: { e1: { v: 800000, how: "7 por mil" } } })
    const imp = F.movs.filter((x) => x.modulo === "impuestos")
    expect(imp.map((x) => [x.n, x.estado, x.v])).toEqual([["Predial Bogotá (último plazo)", "hecho", 800000], ["Declaración de renta (DIAN)", "programado", 1500000]])
    expect(F.sinValor.map((x) => x.id)).toEqual(["e3"])
    expect(F.movs.find((x) => x.id === "cal:e4:2026-12-20")).toMatchObject({ dir: "entra", cat: "Primas y cesantías" })
    const g = F.porModulo.find((x) => x.modulo === "impuestos")!
    expect(g).toMatchObject({ sale: 2300000, n: 2 })
    expect(F.porModulo.map((x) => x.modulo)).toEqual(["ingresos", "impuestos", "calendario", "presupuesto"])
  })
})

describe("estadoIntegral: lo que tienes y lo que debes", () => {
  it("línea por línea de cada módulo, con impuestos que ya debes (estimados) en lo que debo", () => {
    const b = libro({
      assets: [{ id: "a1", cod: "1110", valor: 5000000, currency: "COP", nombre: "Bancolombia" } as never, { id: "a2", cod: "1540", valor: 30000000, currency: "COP", nombre: "Moto" } as never],
      liabilities: [{ id: "p1", cod: "2335", valor: 300000, currency: "COP", nombre: "Debo a mi hermano" } as never],
      loans: [
        { id: "L1", kind: "pagar", tipo: "banco", entity_id: "en1", monto: 1200000, sistema: "sin", tasa: 0, frec: "mensual", plazo: 12, inicio: "2026-06-10", extra: 0, payments: [] },
        { id: "L2", kind: "cobrar", tipo: "presto", contact_id: "ct1", monto: 500000, sistema: "sin", tasa: 0, frec: "mensual", plazo: 5, inicio: "2026-07-01", extra: 0, payments: [] },
      ] as never,
      creditCards: [{ id: "t1", nombre: "Visa", corte: 25, pago: 10, tasa: 2, cupo: 5000000, purchases: [{ id: "p1", fecha: "2026-11-01", valor: 600000, cuotas: 3 }] }] as never,
      investments: [{ id: "iv1", tipo: "cdt", nombre: "CDT", capital: 1000000, tasa: 0, inicio: "2026-11-02", dias: 90, currency: "COP" }],
      calendarEvents: [{ id: "e1", titulo: "Predial Bogotá (último plazo)", fecha: "2026-07-10", tipo: "egreso", monto: 0, anual: true, template_key: "pred_bog2" }] as never,
    })
    const E = estadoIntegral(b, HOY, { estimados: { e1: { v: 800000 } } })
    const T = totales(b, HOY)
    expect(E.A).toBe(T.A)
    expect(E.impuestos).toBe(800000)
    expect(E.P).toBe(T.P + 800000)
    expect(E.pat).toBe(T.A - T.P - 800000)
    expect(E.tengo.map((l) => l.grupo).sort()).toEqual(["bienes", "dinero", "inversiones", "me-deben"])
    expect(E.debo.map((l) => l.grupo).sort()).toEqual(["creditos", "impuestos", "otras", "tarjetas"])
    expect(E.debo.find((l) => l.grupo === "impuestos")).toMatchObject({ estimado: true, s: "Estimado · vence el 10 jul 2027" })
    expect(E.tengo.reduce((a, l) => a + l.v, 0)).toBeCloseTo(E.A)
    expect(E.debo.reduce((a, l) => a + l.v, 0)).toBeCloseTo(E.P)
    const P = partesEstado(E.debo)
    expect(P.reduce((a, x) => a + x.pct, 0)).toBeCloseTo(1)
  })
})

describe("cuenta T del mes (solo lo del periodo)", () => {
  const b = libro()
  const P = periodo(b, "mes", 2026, 10)
  const F = flujoIntegral(b, P, HOY)
  const T = cuentaTMes(F)

  it("las dos columnas suman lo mismo que el flujo del mes", () => {
    expect(Math.round(T.totEntra)).toBe(Math.round(F.tot.entra))
    expect(Math.round(T.totSale)).toBe(Math.round(F.tot.sale))
    expect(Math.round(T.queda)).toBe(Math.round(F.tot.entra - F.tot.sale))
  })

  it("cada columna cuadra con sus filas y los porcentajes suman 1", () => {
    expect(Math.round(T.entra.reduce((a, x) => a + x.v, 0))).toBe(Math.round(T.totEntra))
    expect(Math.round(T.sale.reduce((a, x) => a + x.v, 0))).toBe(Math.round(T.totSale))
    if (T.sale.length) expect(T.sale.reduce((a, x) => a + x.pct, 0)).toBeCloseTo(1, 6)
    if (T.entra.length) expect(T.entra.reduce((a, x) => a + x.pct, 0)).toBeCloseTo(1, 6)
  })

  it("el ahorro va aparte y no se cuenta como salida del mes", () => {
    expect(T.ahorro).toBe(F.tot.ahorro)
    expect(T.sale.some((x) => x.modulo === "metas" && x.v > 0 && !F.porModulo.find((g) => g.modulo === "metas")?.saleFlujo)).toBe(false)
  })

  it("las filas vienen de mayor a menor y traen lo pendiente", () => {
    const vs = T.sale.map((x) => x.v)
    expect([...vs].sort((a, b) => b - a)).toEqual(vs)
    expect(T.pendienteSale).toBeGreaterThanOrEqual(0)
    expect(T.pendienteSale).toBeLessThanOrEqual(Math.round(T.totSale) + 1)
  })
})

describe("periodos que se adaptan a cómo te pagan", () => {
  const conFrec = (frec: string) => libro({ incomes: [{ id: "i1", concepto: "Pago", valor: 100_000, frec, dia: 15, currency: "COP" } as never] })

  it("quien cobra por semana ve la semana; quien cobra quincenal ve sus quincenas", () => {
    expect(periodosDelLibro(conFrec("semanal")).map((x) => x.tipo)).toContain("semana")
    expect(periodosDelLibro(conFrec("diario")).map((x) => x.tipo)).toContain("semana")
    const q = periodosDelLibro(conFrec("quincenal")).map((x) => x.tipo)
    expect(q).toContain("q1")
    expect(q).toContain("q2")
    expect(q).not.toContain("semana")
  })

  it("quien solo cobra mensual no ve quincenas ni semana", () => {
    const t = periodosDelLibro(conFrec("mensual")).map((x) => x.tipo)
    expect(t).not.toContain("q1")
    expect(t).not.toContain("semana")
    expect(t).toContain("mes")
    expect(t).toContain("anio")
  })

  it("con pagos anuales o fechas del calendario aparece el semestre", () => {
    expect(periodosDelLibro(conFrec("anual")).map((x) => x.tipo)).toContain("semestre")
    expect(periodosDelLibro(conFrec("mensual")).map((x) => x.tipo)).not.toContain("semestre")
  })

  it("la semana va de lunes a domingo y el semestre parte el año en dos", () => {
    const b = libro()
    // El 10 de noviembre de 2026 es martes: la semana va del lunes 9 al domingo 15.
    expect(periodo(b, "semana", 2026, 10, 10)).toMatchObject({ a: "2026-11-09", b: "2026-11-15" })
    expect(periodo(b, "semestre", 2026, 2)).toMatchObject({ a: "2026-01-01", b: "2026-06-30" })
    expect(periodo(b, "semestre", 2026, 8)).toMatchObject({ a: "2026-07-01", b: "2026-12-31" })
  })
})
