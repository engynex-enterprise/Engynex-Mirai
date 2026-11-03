import { describe, expect, it } from "vitest"
import { composicion, gastoYaContado, hallazgosBalance, quincenaBalance } from "./balance"
import { quincena } from "./quincena"
import type { BookData } from "./types"

const HOY = "2026-11-10"

/** Libro mínimo: sueldo quincenal de 2 M, arriendo fijo, presupuesto de mercado 600 mil y una cuenta de 5 M. */
function libro(extra: Partial<BookData> = {}): BookData {
  return {
    settings: { umbral: 25000, limite: 200000, trm: {}, emerg_meta: 6, anticipo: 5, corte_q: 15, alerta_pres: 80 },
    categories: [
      { id: "c-mer", nombre: "Mercado", icon: "shopping-cart", tope: 600000, grupo: "n" },
      { id: "c-arr", nombre: "Arriendo", icon: "house", tope: 0, grupo: "n" },
      { id: "c-aho", nombre: "Ahorro", icon: "piggy-bank", tope: 300000, grupo: "a" },
    ],
    incomes: [{ id: "i1", concepto: "Sueldo", valor: 2000000, frec: "quincenal", dia: 15, currency: "COP" }],
    extraIncomes: [],
    expenses: [],
    fixedExpenses: [{ id: "f1", nombre: "Arriendo", valor: 1200000, dia: 5, category_id: "c-arr", payments: [] } as never],
    subscriptions: [],
    loans: [],
    creditCards: [],
    assets: [{ id: "a1", cod: "1110", valor: 5000000, currency: "COP" }, { id: "a2", cod: "1540", valor: 30000000, currency: "COP" }],
    liabilities: [],
    investments: [],
    goals: [],
    calendarEvents: [],
    contacts: [],
    entities: [],
    ...extra,
  }
}

const gasto = (o: Record<string, unknown>) => ({ id: String(o.id ?? Math.random()), fecha: "2026-11-08", descripcion: "Mercado D1", valor: 150000, category_id: "c-mer", ...o }) as never

describe("quincenaBalance: los gastos registrados se ven en el Balance", () => {
  it("sin gastos es igual a quincena() de la v4 (el estimado pasa a llamarse 'Por gastar')", () => {
    const b = libro()
    const v4 = quincena(b, 2026, 10, "q1", HOY)
    const q = quincenaBalance(b, 2026, 10, "q1", HOY)
    expect(q.E).toBe(v4.E)
    expect(q.Sa).toBe(v4.Sa)
    expect(q.disp).toBe(v4.disp)
    expect(q.sal.find((x) => x.n === "Gasto variable estimado")).toBeUndefined()
    expect(q.sal.find((x) => x.n === "Por gastar según tu presupuesto")?.v).toBe(300000)
  })

  it("un gasto registrado aparece como salida hecha y descuenta del presupuesto por gastar", () => {
    const b = libro({ expenses: [gasto({ id: "g1" })] })
    const v4 = quincena(b, 2026, 10, "q1", HOY)
    const q = quincenaBalance(b, 2026, 10, "q1", HOY)
    const item = q.sal.find((x) => x.n === "Mercado D1")
    expect(item).toMatchObject({ v: 150000, paid: true, href: "/gastos", fecha: "2026-11-08" })
    expect(q.gastado).toBe(150000)
    expect(q.nGastos).toBe(1)
    expect(q.porGastar).toBe(150000) // 300 mil de la quincena − 150 mil ya gastados
    // La v4 ignoraba el gasto: el total de salidas era el mismo con o sin él.
    expect(v4.Sa).toBe(quincena(libro(), 2026, 10, "q1", HOY).Sa)
    // Con el gasto dentro del presupuesto, el total de salidas no cambia (sale el estimado, entra lo real).
    expect(q.Sa).toBe(v4.Sa)
  })

  it("si el gasto pasa el presupuesto, el total de salidas sube y lo que sobra baja", () => {
    const b = libro({ expenses: [gasto({ id: "g1", valor: 500000 })] })
    const v4 = quincena(b, 2026, 10, "q1", HOY)
    const q = quincenaBalance(b, 2026, 10, "q1", HOY)
    expect(q.porGastar).toBe(0)
    expect(q.Sa).toBe(v4.Sa - 300000 + 500000)
    expect(q.disp).toBe(v4.disp - 200000)
  })

  it("un gasto de otra categoría (sin tope) sale completo y no toca el presupuesto", () => {
    const b = libro({ expenses: [gasto({ id: "g1", descripcion: "Pago extra arriendo", valor: 80000, category_id: "c-arr" })] })
    const q = quincenaBalance(b, 2026, 10, "q1", HOY)
    expect(q.porGastar).toBe(300000)
    expect(q.Sa).toBe(quincena(b, 2026, 10, "q1", HOY).Sa + 80000)
  })

  it("no repite pagos de gastos fijos, compras con tarjeta ni cuotas de préstamos", () => {
    const b = libro({
      expenses: [
        gasto({ id: "g1", descripcion: "Arriendo", valor: 1200000, category_id: "c-arr", fixed_expense_id: "f1" }),
        gasto({ id: "g2", descripcion: "Zapatos", origen: "tarjeta" }),
        gasto({ id: "g3", descripcion: "Cuota moto", origen: "prestamo" }),
      ],
    })
    const q = quincenaBalance(b, 2026, 10, "q1", HOY)
    expect(q.nGastos).toBe(0)
    expect(q.sal.some((x) => x.n === "Zapatos" || x.n === "Cuota moto")).toBe(false)
    expect(gastoYaContado({ fixed_expense_id: "f1" } as never)).toBe(true)
    expect(gastoYaContado({ origen: "manual" } as never)).toBe(false)
  })

  it("solo cuenta los gastos del rango de la quincena", () => {
    const b = libro({ expenses: [gasto({ id: "g1", fecha: "2026-11-20" })] })
    expect(quincenaBalance(b, 2026, 10, "q1", HOY).nGastos).toBe(0)
    expect(quincenaBalance(b, 2026, 10, "q2", HOY).nGastos).toBe(1)
    expect(quincenaBalance(b, 2026, 10, "mes", HOY).nGastos).toBe(1)
  })

  it("en un periodo que ya terminó no estima: cuenta solo lo registrado", () => {
    const b = libro({ expenses: [gasto({ id: "g1", fecha: "2026-10-03", valor: 90000 })] })
    const q = quincenaBalance(b, 2026, 9, "q1", HOY)
    expect(q.momento).toBe("pasado")
    expect(q.porGastar).toBe(0)
    expect(q.sal.some((x) => x.n.startsWith("Por gastar"))).toBe(false)
    expect(q.gastado).toBe(90000)
    // Un periodo futuro muestra el presupuesto completo
    expect(quincenaBalance(b, 2026, 11, "q1", HOY)).toMatchObject({ momento: "futuro", porGastar: 300000 })
  })
})

describe("composicion", () => {
  it("separa dinero disponible de bienes y suma deudas por tipo", () => {
    const b = libro({ liabilities: [{ id: "p1", cod: "2380", valor: 400000 }, { id: "p2", cod: "2381", valor: 100000 }] as never })
    const C = composicion(b, HOY)
    expect(C.liquidez).toBe(5000000)
    expect(C.tengo.map((x) => x.k)).toEqual(["bienes", "dinero"])
    expect(C.tengo[0].pct).toBeCloseTo(30 / 35)
    expect(C.debo).toEqual([
      expect.objectContaining({ k: "tarjetas", v: 400000 }),
      expect.objectContaining({ k: "otras", v: 100000 }),
    ])
    expect(C.T.pat).toBe(35000000 - 500000)
  })
})

describe("hallazgosBalance", () => {
  const H = (b: BookData) => hallazgosBalance(b, HOY, quincenaBalance(b, 2026, 10, "mes", HOY))
  it("sin cuentas ni deudas invita a empezar", () => {
    expect(H(libro({ assets: [] })).map((h) => h.id)).toEqual(["vacio"])
  })
  it("patrimonio negativo, meses de respaldo y resultado del mes", () => {
    const b = libro({ liabilities: [{ id: "p1", cod: "2895", valor: 50000000 }] as never })
    const ids = H(b).map((h) => h.id)
    expect(ids).toContain("pat-neg")
    expect(ids).toContain("respaldo")
    expect(ids.some((i) => i.startsWith("mes-") || i === "presu")).toBe(true)
  })
  it("avisa cuando los gastos del mes pasan lo que entra", () => {
    const b = libro({ expenses: [gasto({ id: "g1", valor: 5000000 })] })
    expect(H(b).find((h) => h.id === "mes-falta")?.tono).toBe("bad")
  })
})
