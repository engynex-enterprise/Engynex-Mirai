import { describe, expect, it } from "vitest"
import { dedCalc } from "./payroll"
import { quincena } from "./quincena"
import { dedAMes, fijoValor, incomeCuando, incomePagos, pagosMes, planIngreso, quincenaDeDia, quincenasNetas, tipoIngreso } from "./reparto"
import { ingresoBrutoMensual, ingresoMensual } from "./totals"
import type { BookData } from "./types"

const ref = { smmlv: 1750905, uvt: 52374 }
const emp = { tipo: "empleado" as const }

describe("quincenasNetas", () => {
  it("nómina de $9.000.000: la 1ª quincena llega completa y en la 2ª se descuenta todo el mes", () => {
    const r = quincenasNetas(4_500_000, 4_500_000, emp, ref, "q2")
    const mes = dedCalc(9_000_000, "mensual", emp, ref)
    expect(r.n1).toBe(4_500_000)
    expect(r.x1).toBe(0)
    expect(r.total).toBeCloseTo(mes.total, -1)
    expect(r.n2).toBe(4_500_000 - r.total)
    expect(r.items.map((i) => i.n)).toEqual(["Salud", "Pensión", "Fondo de solidaridad pensional", "Retención en la fuente"])
  })
  it("mitad y mitad da lo mismo que un ingreso quincenal de siempre", () => {
    const r = quincenasNetas(4_500_000, 4_500_000, emp, ref, "mitad")
    const q = dedCalc(4_500_000, "quincenal", emp, ref)
    expect(Math.abs(r.n1 - q.neto)).toBeLessThanOrEqual(1)
    expect(Math.abs(r.n2 - q.neto)).toBeLessThanOrEqual(1)
  })
  it("todo en la 1ª quincena", () => {
    const r = quincenasNetas(4_500_000, 4_500_000, emp, ref, "q1")
    expect(r.n2).toBe(4_500_000)
    expect(r.n1).toBe(4_500_000 - r.total)
  })
  it("si una quincena no alcanza, el resto del descuento pasa a la otra", () => {
    const r = quincenasNetas(100_000, 8_900_000, emp, ref, "q1")
    expect(r.n1).toBe(0)
    expect(r.x1).toBe(100_000)
    expect(r.n1 + r.n2).toBe(9_000_000 - r.total)
  })
  it("sin descuentos devuelve los valores escritos (bono de $30.000 en cada quincena)", () => {
    expect(quincenasNetas(30_000, 30_000, null, ref)).toMatchObject({ n1: 30_000, n2: 30_000, total: 0 })
    expect(quincenasNetas(30_000, 0, null, ref)).toMatchObject({ n1: 30_000, n2: 0 })
  })
})

describe("incomePagos", () => {
  it("sin reparto: quincenal el 15 y el último día con el mismo valor (como la v4)", () => {
    expect(incomePagos({ frec: "quincenal", valor: 100, dia: 30 }, 2026, 0)).toEqual([
      { fecha: "2026-01-15", v: 100, parte: "q1" }, { fecha: "2026-01-31", v: 100, parte: "q2" },
    ])
  })
  it("con reparto: valor y día propios de cada quincena", () => {
    const x = { frec: "quincenal", valor: 3_900_000, dia: 30, reparto: { modo: "igual", n1: 4_500_000, n2: 3_300_000, d1: 5, d2: 20 } }
    expect(incomePagos(x, 2026, 1)).toEqual([
      { fecha: "2026-02-05", v: 4_500_000, parte: "q1" }, { fecha: "2026-02-20", v: 3_300_000, parte: "q2" },
    ])
  })
  it("el día 31 se recorta al último día del mes", () => {
    expect(incomePagos({ frec: "quincenal", valor: 1, dia: 30, reparto: { d2: 31 } }, 2026, 1)[1].fecha).toBe("2026-02-28")
  })
  it("semanal: viernes por defecto o el día escogido", () => {
    expect(incomePagos({ frec: "semanal", valor: 1, dia: 30 }, 2026, 0).map((p) => p.fecha)).toEqual(["2026-01-02", "2026-01-09", "2026-01-16", "2026-01-23", "2026-01-30"])
    expect(incomePagos({ frec: "semanal", valor: 1, dia: 30, reparto: { dow: 1 } }, 2026, 0)).toHaveLength(4)
  })
  it("anual: solo en el mes guardado", () => {
    const x = { frec: "anual", valor: 500, dia: 20, reparto: { mes: 12 } }
    expect(incomePagos(x, 2026, 11)).toEqual([{ fecha: "2026-12-20", v: 500 }])
    expect(incomePagos(x, 2026, 5)).toEqual([])
    expect(incomePagos({ frec: "anual", valor: 500, dia: 20 }, 2026, 11)).toEqual([])
  })
})

describe("textos y gastos fijos", () => {
  it("incomeCuando", () => {
    expect(incomeCuando({ frec: "quincenal", dia: 30 })).toBe("Cada quincena (15 y fin de mes)")
    expect(incomeCuando({ frec: "quincenal", dia: 30, reparto: { d1: 10, d2: 25 } })).toBe("Cada quincena (10 y 25)")
    expect(incomeCuando({ frec: "semanal", dia: 30, reparto: { dow: 1 } })).toBe("Cada lunes")
    expect(incomeCuando({ frec: "anual", dia: 20, reparto: { mes: 12 } })).toBe("Cada año el 20 de diciembre")
  })
  it("quincenaDeDia según el corte", () => {
    expect(quincenaDeDia(15)).toBe("q1")
    expect(quincenaDeDia(16)).toBe("q2")
    expect(quincenaDeDia(18, 20)).toBe("q1")
  })
  it("fijoValor: valor distinto por quincena o el de siempre", () => {
    const f = { frec: "quincenal", valor: 750_000, reparto: { modo: "distinto", q1: 1_000_000, q2: 500_000 } }
    expect(fijoValor(f, "2026-01-Q1")).toBe(1_000_000)
    expect(fijoValor(f, "2026-01-Q2")).toBe(500_000)
    expect(fijoValor({ frec: "quincenal", valor: 750_000 }, "2026-01-Q1")).toBe(750_000)
    expect(fijoValor({ frec: "mensual", valor: 80_000, reparto: { modo: "distinto", q1: 1 } }, "2026-01")).toBe(80_000)
  })
})

describe("quincena con reparto", () => {
  const book = {
    settings: { trm: {}, corte_q: 15 },
    incomes: [
      { id: "s", concepto: "Salario", frec: "quincenal", valor: 3_900_000, dia: 30, currency: "COP", reparto: { modo: "igual", b1: 4_500_000, b2: 4_500_000, n1: 4_500_000, n2: 3_300_000, ded: "q2" } },
      { id: "b", concepto: "Bono", frec: "quincenal", valor: 30_000, dia: 30, currency: "COP" },
    ],
    loans: [], calendarEvents: [], fixedExpenses: [
      { id: "a", nombre: "Arriendo", frec: "quincenal", valor: 750_000, dia: 15, dia2: 30, payments: [], reparto: { modo: "distinto", q1: 1_000_000, q2: 500_000 } },
    ],
    subscriptions: [], extraIncomes: [], creditCards: [], categories: [],
  } as unknown as BookData
  it("cada quincena suma lo que de verdad llega y lo que de verdad sale", () => {
    const q1 = quincena(book, 2026, 0, "q1", "2026-01-10")
    const q2 = quincena(book, 2026, 0, "q2", "2026-01-10")
    expect(q1.E).toBe(4_530_000)
    expect(q2.E).toBe(3_330_000)
    expect(q1.Sa).toBe(1_000_000)
    expect(q2.Sa).toBe(500_000)
  })
})

describe("comprobante de nómina real (Altipal, octubre 2026, quincena 2)", () => {
  // Sueldo $9.175.000, procedimiento 2 al 4,38 %, todos los descuentos del mes en la 2ª quincena.
  const D = { tipo: "empleado" as const, mes: true, retModo: "proc2" as const, retV: 4.38 }
  const plan = planIngreso({ frec: "quincenal", mensual: 9_175_000, D, ref, ded: "q2" })
  it("cada descuento coincide con el desprendible", () => {
    expect(Object.fromEntries(plan.items.map((i) => [i.n, i.v]))).toEqual({
      Salud: 367_000, Pensión: 367_000, "Fondo de solidaridad pensional": 91_800, "Retención en la fuente": 274_000,
    })
    expect(plan.desc).toBe(1_099_800)
  })
  it("la 1ª llega completa y la 2ª con los descuentos; con el auxilio de conectividad da el neto del comprobante", () => {
    expect(plan.pagos.map((p) => [p.bruto, p.desc, p.neto])).toEqual([[4_587_500, 0, 4_587_500], [4_587_500, 1_099_800, 3_487_700]])
    const apoyo = planIngreso({ frec: "quincenal", mensual: 60_000, ref })
    expect(plan.pagos[1].neto + apoyo.pagos[1].neto).toBe(3_517_700)
    expect(plan.valor * 2).toBe(9_175_000 - 1_099_800)
  })
  it("mitad y mitad, o una parte escrita en la 1ª", () => {
    const m = planIngreso({ frec: "quincenal", mensual: 9_175_000, D, ref, ded: "mitad" })
    expect(m.pagos.map((p) => p.desc)).toEqual([549_900, 549_900])
    const p = planIngreso({ frec: "quincenal", mensual: 9_175_000, D, ref, ded: "pers", x1: 734_000 })
    expect(p.pagos.map((x) => x.desc)).toEqual([734_000, 365_800])
  })
  it("las quincenas se pueden ajustar a mano", () => {
    const p = planIngreso({ frec: "quincenal", mensual: 0, b1: 5_000_000, b2: 4_175_000, D, ref, ded: "q2" })
    expect(p.mensual).toBe(9_175_000)
    expect(p.pagos[0].neto).toBe(5_000_000)
  })
  it("procedimiento 1 (tabla) da una retención distinta", () => {
    const t = planIngreso({ frec: "mensual", mensual: 9_175_000, D: { tipo: "empleado", mes: true }, ref })
    expect(t.items.find((i) => i.n === "Retención en la fuente")!.v).not.toBe(274_000)
  })
})

describe("planIngreso por frecuencia", () => {
  it("semanal y diario dividen el mes", () => {
    const s = planIngreso({ frec: "semanal", mensual: 5_200_000, ref })
    expect(s.pagos[0].neto).toBe(1_200_000)
    const d = planIngreso({ frec: "diario", mensual: 3_000_000, dias: 20, ref })
    expect(d.valor).toBe(150_000)
  })
  it("anual: el valor es el del pago", () => {
    expect(planIngreso({ frec: "anual", mensual: 2_000_000, ref }).valor).toBe(2_000_000)
  })
  it("pago diario: suma los días del mes y se resume por quincena", () => {
    const x = { frec: "diario", valor: 100_000, dia: 30, reparto: { dias: 22 } }
    expect(pagosMes(x)).toBe(22)
    expect(incomePagos(x, 2026, 1)).toEqual([
      { fecha: "2026-02-15", v: 1_100_000, parte: "q1", dias: 11 }, { fecha: "2026-02-28", v: 1_100_000, parte: "q2", dias: 11 },
    ])
    expect(ingresoMensual([{ id: "d", concepto: "Jornal", ...x, currency: "COP" }], {})).toBe(2_200_000)
    expect(incomeCuando(x)).toBe("Cada día (22 días al mes)")
  })
})

describe("tipo de ingreso y descuentos de antes", () => {
  it("tipoIngreso: guardado o por la categoría y el concepto", () => {
    expect(tipoIngreso({ reparto: { tipo: "bono" }, concepto: "x" })).toBe("bono")
    expect(tipoIngreso({ concepto: "Mi sueldo" })).toBe("salario")
    expect(tipoIngreso({ concepto: "Apoyo conectividad" })).toBe("bono")
    expect(tipoIngreso({ concepto: "Cosa" }, "Honorarios")).toBe("honorarios")
    expect(tipoIngreso({ concepto: "Cosa" })).toBe("otro")
  })
  it("dedAMes: los valores fijos de cada quincena pasan a ser del mes", () => {
    const D = dedAMes({ tipo: "empleado", retModo: "manual", retV: 100_000, otros: [{ n: "Libranza", v: 50_000 }, { n: "Fondo", v: 2, pct: true }] }, "quincenal")
    expect(D).toMatchObject({ mes: true, retV: 200_000, otros: [{ v: 100_000 }, { v: 2, pct: true }] })
    // Mismo resultado del mes antes y después.
    const antes = quincenasNetas(4_000_000, 4_000_000, { tipo: "empleado", retModo: "manual", retV: 100_000, otros: [{ n: "Libranza", v: 50_000 }] }, ref)
    const despues = quincenasNetas(4_000_000, 4_000_000, dedAMes({ tipo: "empleado", retModo: "manual", retV: 100_000, otros: [{ n: "Libranza", v: 50_000 }] }, "quincenal"), ref)
    expect(Math.abs(antes.total - despues.total)).toBeLessThanOrEqual(200)
  })
})

describe("ingreso del mes con y sin descuentos", () => {
  it("bruto de la nómina (quincenas con valor propio) y valor de los demás", () => {
    const xs = [
      { id: "n", concepto: "Nómina", frec: "quincenal", valor: 4_037_600, bruto: 4_587_500, dia: 30, currency: "COP", reparto: { b1: 4_587_500, b2: 4_587_500, n1: 4_587_500, n2: 3_487_700 } },
      { id: "b", concepto: "Conectividad", frec: "quincenal", valor: 30_000, dia: 30, currency: "COP" },
      { id: "m", concepto: "Pensión", frec: "mensual", valor: 1_800_000, bruto: 2_000_000, dia: 30, currency: "COP" },
    ]
    expect(ingresoBrutoMensual(xs, {})).toBe(9_175_000 + 60_000 + 2_000_000)
    expect(ingresoMensual(xs, {})).toBe(4_037_600 * 2 + 60_000 + 1_800_000)
  })
})
