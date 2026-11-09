import { describe, expect, it } from "vitest"
import { cambio, desglose, esGastoSuelto, icsDeMov, idsDiaADia, idsHormiga, moverRef, movsBandeja, nombrePeriodo, periodoAnterior, periodoBandeja, planPagoLote, resumenBandeja, sePuedePagar, teAlcanza, tituloPeriodo } from "./bandeja"
import { flujoIntegral, type Mov } from "./flujo-integral"
import { presupuestoCategorias, conTope, gastadoMes } from "./presupuesto"
import type { BookData } from "./types"

const HOY = "2026-11-10"

function libro(extra: Partial<BookData> = {}): BookData {
  return {
    settings: { umbral: 25000, limite: 200000, trm: { USD: 4000 }, emerg_meta: 6, anticipo: 5, corte_q: 15, alerta_pres: 80 },
    categories: [
      { id: "c-mer", nombre: "Mercado", icon: "shopping-cart", tope: 600000, grupo: "n" },
      { id: "c-arr", nombre: "Arriendo", icon: "house", tope: 0, grupo: "n" },
      { id: "c-caf", nombre: "Cafés", icon: "coffee", tope: 50000, grupo: "g" },
    ],
    incomes: [{ id: "i1", concepto: "Sueldo", valor: 2000000, frec: "quincenal", dia: 15, currency: "COP" }],
    extraIncomes: [], expenses: [], fixedExpenses: [], subscriptions: [], loans: [], creditCards: [],
    assets: [{ id: "a1", cod: "1110", valor: 1000000, currency: "COP" }],
    liabilities: [], investments: [], goals: [], calendarEvents: [], contacts: [], entities: [],
    ...extra,
  }
}
const gasto = (o: Record<string, unknown>) => ({ id: String(o.id), fecha: "2026-11-08", descripcion: "Mercado D1", valor: 150000, category_id: "c-mer", ...o }) as never
const fijo = (o: Record<string, unknown>) => ({ id: "f1", nombre: "Arriendo", valor: 1200000, frec: "mensual", dia: 5, category_id: "c-arr", payments: [], created_at: "2026-01-01", ...o }) as never
/** Sin topes: el "Por gastar según tu presupuesto" no entra (cada prueba mira una sola cosa). */
const sinTopes = (b: BookData): BookData => ({ ...b, categories: b.categories.map((c) => ({ ...c, tope: 0 })) })
const mov = (o: Partial<Mov>): Mov => ({ id: "m", dir: "sale", modulo: "gastos", clase: "gasto", fecha: "2026-11-10", n: "X", s: "", icon: "x", v: 0, cat: "Otros", estado: "hecho", href: "/", ...o })

describe("periodos de la bandeja", () => {
  it("navega de mes en mes, de semana en semana y de año en año", () => {
    expect(moverRef("mes", "2026-11-10", -1)).toBe("2026-10-01")
    expect(moverRef("q1", "2026-01-15", -1)).toBe("2025-12-01")
    expect(moverRef("semana", "2026-11-10", 1)).toBe("2026-11-17")
    expect(moverRef("anio", "2026-11-10", -1)).toBe("2025-11-01")
  })
  it("el periodo anterior es del mismo tipo: la 1ª quincena de octubre para la de noviembre", () => {
    const b = libro()
    expect(periodoAnterior(b, "q1", "2026-11-10", HOY)).toEqual({ a: "2026-10-01", b: "2026-10-15", tipo: "q1" })
    expect(periodoAnterior(b, "mes", "2026-11-10", HOY)).toEqual({ a: "2026-10-01", b: "2026-10-31", tipo: "mes" })
  })
  it("«Próximos 7 días» va de hoy a 6 días después y se compara con los 7 días de antes", () => {
    const b = libro()
    expect(periodoBandeja(b, "proximos", "2026-01-01", HOY)).toEqual({ a: "2026-11-10", b: "2026-11-16", tipo: "rango" })
    expect(periodoAnterior(b, "proximos", "2026-01-01", HOY)).toEqual({ a: "2026-11-03", b: "2026-11-09", tipo: "rango" })
  })
  it("nombres para los textos", () => {
    const b = libro()
    expect(nombrePeriodo("mes", periodoBandeja(b, "mes", "2026-10-01", HOY))).toBe("octubre")
    expect(nombrePeriodo("q2", periodoBandeja(b, "q2", "2026-10-01", HOY))).toBe("la 2ª quincena de octubre")
    expect(tituloPeriodo("mes", periodoBandeja(b, "mes", "2026-11-10", HOY))).toBe("Noviembre de 2026")
    expect(tituloPeriodo("semana", periodoBandeja(b, "semana", "2026-11-10", HOY))).toBe("Semana del 9 al 15 de noviembre")
  })
})

describe("resumen de la bandeja", () => {
  // Noviembre: arriendo de $1.200.000 pagado, mercado de $150.000 y la luz de $90.000 que vence el 20.
  const b = sinTopes(libro({
    fixedExpenses: [
      fijo({ payments: [{ periodo: "2026-11", fecha: "2026-11-05", valor: 1200000 }] }),
      fijo({ id: "f2", nombre: "Luz", valor: 90000, dia: 20, category_id: null }),
      fijo({ id: "f3", nombre: "Agua", valor: 40000, dia: 3, category_id: null }),
    ],
    expenses: [gasto({ id: "g1" })],
  }))
  const F = flujoIntegral(b, periodoBandeja(b, "mes", HOY, HOY), HOY)
  const movs = movsBandeja(F)
  const R = resumenBandeja(movs)

  it("el total es el mismo «Sale» del Balance y se parte en pagado y por pagar", () => {
    expect(R.total).toBe(F.tot.sale)
    expect(R.pagado + R.porPagar).toBe(R.total)
    expect(R.pagado).toBe(1200000 + 150000)
    expect(R.vencido).toBe(40000) // el agua venció el 3 y no se pagó
    expect(R.viene).toBe(90000)
  })
  it("el ahorro solo entra si se pide", () => {
    const conAporte = sinTopes(libro({ fixedExpenses: [fijo({ id: "fa", nombre: "Ahorro casa", valor: 300000, dia: 25, link_type: "meta", category_id: null })] }))
    const G = flujoIntegral(conAporte, periodoBandeja(conAporte, "mes", HOY, HOY), HOY)
    expect(resumenBandeja(movsBandeja(G)).total).toBe(0)
    expect(resumenBandeja(movsBandeja(G, true)).total).toBe(300000)
  })
  it("un desglose por módulo o por categoría suma el total", () => {
    for (const por of ["modulo", "cat"] as const) {
      const d = desglose(movs, por)
      expect(d.reduce((a, p) => a + p.v, 0)).toBe(R.total)
      expect(d.reduce((a, p) => a + p.pct, 0)).toBeCloseTo(1)
    }
    expect(desglose(movs, "modulo")[0]).toMatchObject({ k: "fijos", v: 1200000 + 90000 + 40000 })
  })
  it("cada fila trae con qué se paga, quién y a quién", () => {
    const c = libro({
      fixedExpenses: [fijo({ payment_method_id: "pm1", member_id: "mb1", provider_id: "pv1", contact_id: null, proveedor: "Inmobiliaria" })],
      expenses: [gasto({ id: "g2", payment_method_id: "pm2", member_id: "mb2", contact_id: "ct9" })],
    })
    const G = movsBandeja(flujoIntegral(c, periodoBandeja(c, "mes", HOY, HOY), HOY))
    expect(G.find((x) => x.modulo === "fijos")).toMatchObject({ medioId: "pm1", memberId: "mb1", providerId: "pv1", paraTxt: "Inmobiliaria" })
    expect(G.find((x) => x.modulo === "gastos")).toMatchObject({ medioId: "pm2", memberId: "mb2", contactId: "ct9" })
  })
})

describe("comparación con el periodo anterior", () => {
  it("sube, baja o queda igual, con el porcentaje", () => {
    expect(cambio(1100000, 1000000)).toMatchObject({ dif: 100000, pct: 10, dir: "sube" })
    expect(cambio(800000, 1000000)).toMatchObject({ dif: -200000, pct: -20, dir: "baja" })
    expect(cambio(1000000, 1000000).dir).toBe("igual")
    expect(cambio(1002000, 1000000).dir).toBe("igual") // 0,2 %: no vale la pena decirlo
  })
  it("sin nada antes no hay porcentaje", () => {
    expect(cambio(500000, 0)).toMatchObject({ pct: null, dir: "sube" })
  })
})

describe("¿te alcanza?", () => {
  it("lo que tienes + lo que te falta recibir − lo que te falta pagar", () => {
    // Tienes $1.000.000; el 15 y el 30 te pagan $2.000.000 cada quincena; falta la luz ($90.000) y el agua vencida ($40.000).
    const b = sinTopes(libro({ fixedExpenses: [fijo({ id: "f2", nombre: "Luz", valor: 90000, dia: 20, category_id: null }), fijo({ id: "f3", nombre: "Agua", valor: 40000, dia: 3, category_id: null })] }))
    const F = flujoIntegral(b, periodoBandeja(b, "mes", HOY, HOY), HOY)
    const T = teAlcanza(b, F, HOY)
    expect(T.disponible).toBe(1000000)
    expect(T.porEntrar).toBe(4000000)
    expect(T.porPagar).toBe(130000)
    expect(T.queda).toBe(1000000 + 4000000 - 130000)
    expect(T.estado).toBe("alcanza")
  })
  it("no te alcanza: lo dice con lo que falta", () => {
    const b = sinTopes(libro({ incomes: [], assets: [{ id: "a1", cod: "1105", valor: 50000, currency: "COP" }], fixedExpenses: [fijo({ id: "f2", nombre: "Luz", valor: 90000, dia: 20, category_id: null })] }))
    const T = teAlcanza(b, flujoIntegral(b, periodoBandeja(b, "mes", HOY, HOY), HOY), HOY)
    expect(T).toMatchObject({ estado: "falta", queda: -40000 })
  })
  it("lo que te queda por gastar según tu presupuesto también cuenta (como en el Balance), y se dice cuánto es", () => {
    // Topes de mercado ($600.000) y cafés ($50.000): sin gastos todavía, faltan $650.000 por gastar este mes.
    const b = libro({ incomes: [] })
    const T = teAlcanza(b, flujoIntegral(b, periodoBandeja(b, "mes", HOY, HOY), HOY), HOY)
    expect(T.presupuesto).toBe(650000)
    expect(T.porPagar).toBe(650000)
    expect(T).toMatchObject({ queda: 1000000 - 650000, estado: "alcanza" })
  })
  it("sin cuentas no afirma nada; en un mes que ya pasó no aplica", () => {
    const b = libro({ assets: [] })
    expect(teAlcanza(b, flujoIntegral(b, periodoBandeja(b, "mes", HOY, HOY), HOY), HOY).estado).toBe("sin-cuentas")
    expect(teAlcanza(libro(), flujoIntegral(libro(), periodoBandeja(libro(), "mes", "2026-10-01", HOY), HOY), HOY).estado).toBe("no-aplica")
  })
})

describe("hormigas en la bandeja", () => {
  it("usa la misma regla de Gastos: un tinto de $4.000 sí, el mercado no", () => {
    const b = libro({ expenses: [gasto({ id: "t1", descripcion: "Tinto", valor: 4000, category_id: "c-caf" }), gasto({ id: "g1" })] })
    const ids = idsHormiga(b, HOY, periodoBandeja(b, "mes", HOY, HOY))
    expect([...ids]).toEqual(["t1"])
  })
})

describe("pagar varios a la vez", () => {
  it("cada fila con lo que falta; las cuotas de un mismo préstamo van juntas; lo demás (y lo que «Ya pasó») se explica", () => {
    const movs = [
      mov({ id: "fijo:f1:2026-11", modulo: "fijos", estado: "vencido", v: 90000, ref: { tabla: "fixed_expenses", id: "f1", per: "2026-11" } }),
      mov({ id: "loan:L1:c3", modulo: "le-debo", clase: "deuda", estado: "vencido", v: 250000, ref: { tabla: "loans", id: "L1" } }),
      mov({ id: "loan:L1:c4", modulo: "le-debo", clase: "deuda", estado: "programado", v: 250000, ref: { tabla: "loans", id: "L1" } }),
      mov({ id: "sub:s1:2026-11", modulo: "suscripciones", estado: "hecho", supuesto: true, v: 39900, ref: { tabla: "subscriptions", id: "s1" } }),
      mov({ id: "exp:g1", estado: "hecho", v: 150000, ref: { tabla: "expenses", id: "g1" } }),
      mov({ id: "pres:2026-11", modulo: "presupuesto", estado: "estimado", v: 300000 }),
    ]
    const P = planPagoLote(movs)
    expect(P.pagar.map((p) => [p.tipo, p.id, p.valor, p.cuotas ?? null])).toEqual([["fijo", "f1", 90000, null], ["prestamo", "L1", 500000, 2]])
    expect(P.total).toBe(90000 + 500000)
    // Netflix pasó su fecha y Mirai lo da por pagado: no se registra otra vez sin que la persona lo confirme.
    expect(P.omitidos.map((o) => o.razon)).toEqual(["Por confirmar: confírmalo desde su fila", "Ya está pagado", "Es un estimado de tu presupuesto, no un pago"])
    expect(movs.map(sePuedePagar)).toEqual([true, true, true, true, false, false])
  })
})

describe("recordatorio en el calendario (.ics)", () => {
  it("evento de todo el día con alarma días antes", () => {
    const t = icsDeMov(mov({ id: "fijo:f1:2026-11", modulo: "fijos", fecha: "2026-11-20", n: "Luz, Enel", v: 90000 }), 2)
    expect(t).toContain("DTSTART;VALUE=DATE:20261120")
    expect(t).toContain("DTEND;VALUE=DATE:20261121")
    expect(t).toContain("TRIGGER:-P2DT16H")
    expect(t).toContain("SUMMARY:Pagar: Luz\\, Enel")
    expect(icsDeMov(mov({ fecha: "2026-11-20" }), 0)).toContain("TRIGGER:PT8H")
  })
})

describe("presupuesto por categoría", () => {
  it("lo que llevas contra el tope, con dólares convertidos y una categoría que ya no existe", () => {
    const b = libro({
      expenses: [
        gasto({ id: "g1", valor: 500000 }),
        gasto({ id: "g2", descripcion: "Café", valor: 10, currency: "USD", category_id: "c-caf" }), // US$10 × 4.000 = $40.000
        gasto({ id: "g3", descripcion: "Algo", valor: 20000, category_id: "c-borrada" }),
        gasto({ id: "g4", fecha: "2026-10-30", valor: 999999 }), // otro mes
      ],
    })
    const F = presupuestoCategorias(b, "2026-11")
    expect(F.find((f) => f.id === "c-mer")).toMatchObject({ llevas: 500000, tope: 600000, queda: 100000, st: "cerca" })
    expect(F.find((f) => f.id === "c-caf")).toMatchObject({ llevas: 40000, u: 80, st: "cerca" })
    expect(F.find((f) => f.id === "c-arr")?.st).toBe("sin")
    expect(F.find((f) => f.unknown)).toMatchObject({ llevas: 20000, st: "otra" })
    expect(gastadoMes(F)).toBe(560000)
    expect(conTope(F).map((f) => f.id)).toEqual(["c-mer", "c-caf"])
  })
})

describe("Del día a día muestra solo lo suyo", () => {
  it("fuera los pagos de fijos, los cobros de suscripción, las compras con tarjeta, las cuotas y los aportes", () => {
    const b = libro({
      fixedExpenses: [fijo({ payments: [{ periodo: "2026-11", fecha: "2026-11-05", valor: 1200000 }] })],
      subscriptions: [{ id: "s1", nombre: "Netflix", valor: 38900, ciclo: "mensual", proximo: "2026-12-03", created_at: "2026-01-01" } as never],
      expenses: [
        gasto({ id: "suelto" }),
        gasto({ id: "compartido", descripcion: "Pizza", origen: "compartido" }),
        gasto({ id: "pago-fijo", descripcion: "Arriendo", valor: 1200000, fixed_expense_id: "f1", fecha: "2026-11-05" }),
        gasto({ id: "netflix-id", descripcion: "Netflix", valor: 38900, subscription_id: "s1", fecha: "2026-11-03" }),
        gasto({ id: "tarjeta", descripcion: "Zapatos", valor: 200000, origen: "tarjeta" }),
        gasto({ id: "cuota", descripcion: "Cuota carro", valor: 500000, origen: "prestamo" }),
        gasto({ id: "aporte", descripcion: "Ahorro casa", valor: 300000, origen: "aporte" }),
      ],
    })
    const F = flujoIntegral(b, periodoBandeja(b, "mes", HOY, HOY), HOY)
    expect([...idsDiaADia(F)].sort()).toEqual(["compartido", "suelto"])
    // La regla directa (para lo recién registrado) dice lo mismo con los campos del gasto.
    expect(b.expenses.filter((g) => esGastoSuelto(g as never)).map((g) => g.id).sort()).toEqual(["compartido", "suelto"])
  })
  it("un cobro de suscripción registrado a mano con su nombre (sin enlazar) también es de Suscripciones", () => {
    const b = libro({
      subscriptions: [{ id: "s1", nombre: "Spotify", valor: 16900, ciclo: "mensual", proximo: "2026-12-04", created_at: "2026-01-01" } as never],
      expenses: [gasto({ id: "spotify", descripcion: "Spotify", valor: 16900, fecha: "2026-11-04" }), gasto({ id: "suelto" })],
    })
    expect([...idsDiaADia(flujoIntegral(b, periodoBandeja(b, "mes", HOY, HOY), HOY))]).toEqual(["suelto"])
  })
})
