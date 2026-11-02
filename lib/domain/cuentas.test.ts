import { describe, expect, it } from "vitest"
import { ahorroApartado, conSaldos, mediosSugeridos, saldoCuenta, saldosCuentas, type LibroCuentas } from "./cuentas"
import { estadoIntegral, flujoIntegral, periodo, snapshotMes } from "./flujo-integral"
import { liquidez, totales } from "./totals"

const HOY = "2026-11-10"
const CUADRE = "2026-11-02T15:00:00.000Z"

/** Libro con la cuenta Nequi cuadrada el 2 de noviembre en $500.000 y el medio "Nequi" ligado a ella. */
function libro(extra: Partial<LibroCuentas> = {}): LibroCuentas {
  return {
    settings: { umbral: 25000, limite: 200000, trm: { USD: 4000 }, emerg_meta: 6, anticipo: 5, corte_q: 15, alerta_pres: 80 },
    categories: [{ id: "c-mer", nombre: "Mercado", icon: "shopping-cart", tope: 600000, grupo: "n" }],
    incomes: [],
    extraIncomes: [],
    expenses: [],
    fixedExpenses: [],
    subscriptions: [],
    loans: [],
    creditCards: [],
    assets: [
      { id: "a-nequi", cod: "1110", nombre: "Nequi", valor: 500000, currency: "COP", saldo_base: 500000, saldo_fecha: "2026-11-02", saldo_at: CUADRE } as never,
      { id: "a-banco", cod: "1110", nombre: "Bancolombia", valor: 2000000, currency: "COP" } as never,
      { id: "a-casa", cod: "1516", nombre: "Casa", valor: 100000000, currency: "COP" } as never,
    ],
    liabilities: [],
    investments: [],
    goals: [],
    calendarEvents: [],
    contacts: [{ id: "ct1", nombre: "Juan" }],
    entities: [{ id: "en1", nombre: "Banco Bogotá" }],
    paymentMethods: [{ id: "m-nequi", nombre: "Nequi", asset_id: "a-nequi" }, { id: "m-efe", nombre: "Efectivo" }, { id: "m-tc", nombre: "Tarjeta de crédito" }],
    ...extra,
  }
}
const gasto = (o: Record<string, unknown>) => ({ id: String(o.id), fecha: "2026-11-05", descripcion: "Mercado", valor: 50000, category_id: "c-mer", payment_method_id: "m-nequi", created_at: "2026-11-05T12:00:00Z", ...o }) as never
const saldo = (b: LibroCuentas, id = "a-nequi") => saldosCuentas(b, HOY).get(id)?.saldo

describe("saldoCuenta: base + entradas − salidas desde el cuadre", () => {
  it("un gasto con el medio de la cuenta la baja; si se borra, vuelve", () => {
    expect(saldo(libro())).toBe(500000)
    const b = libro({ expenses: [gasto({ id: "g1" })] })
    expect(saldo(b)).toBe(450000)
    expect(saldoCuenta(b.assets[0] as never, b, HOY)).toMatchObject({ vivo: true, base: 500000, sale: 50000, entra: 0, medios: ["m-nequi"] })
    // Borrar el gasto = ya no viene en el libro (borrado lógico).
    expect(saldo(libro({ expenses: [] }))).toBe(500000)
  })

  it("lo que pasó antes del cuadre ya estaba en el saldo del banco; lo futuro aún no pasa", () => {
    const b = libro({
      expenses: [
        gasto({ id: "antes", fecha: "2026-11-01" }),
        gasto({ id: "mismo-dia-antes", fecha: "2026-11-02", created_at: "2026-11-02T14:00:00Z" }),
        gasto({ id: "mismo-dia-despues", fecha: "2026-11-02", created_at: "2026-11-02T16:00:00Z", valor: 10000 }),
        gasto({ id: "futuro", fecha: "2026-11-20" }),
        gasto({ id: "otro-medio", payment_method_id: "m-efe" }),
      ],
    })
    expect(saldo(b)).toBe(490000)
  })

  it("ingresos: extra con el medio y los pagos del sueldo que ya llegaron desde el cuadre", () => {
    const b = libro({
      extraIncomes: [{ id: "x1", fecha: "2026-11-06", descripcion: "Venta", valor: 80000, payment_method_id: "m-nequi" } as never],
      incomes: [{ id: "i1", concepto: "Sueldo", valor: 1000000, frec: "quincenal", dia: 15, currency: "COP", payment_method_id: "m-nequi", created_at: "2026-01-01T00:00:00Z" } as never],
    })
    // El sueldo de la 1ª quincena (15 nov) aún no llega el 10; el 30 oct fue antes del cuadre.
    expect(saldo(b)).toBe(580000)
    expect(saldosCuentas(b, "2026-11-16").get("a-nequi")!.saldo).toBe(1580000)
  })

  it("préstamos: la cuota pagada con el medio baja la cuenta; si ya tiene su gasto no se cuenta dos veces", () => {
    const L = { id: "L1", kind: "pagar", tipo: "banco", entity_id: "en1", monto: 1200000, sistema: "sin", tasa: 0, frec: "mensual", plazo: 12, inicio: "2026-10-05", extra: 0 }
    const pago = { id: "p1", fecha: "2026-11-05", tipo: "cuota", valor: 0, payment_method_id: "m-nequi", created_at: "2026-11-05T10:00:00Z" }
    expect(saldo(libro({ loans: [{ ...L, payments: [pago] }] as never }))).toBe(400000)
    const conGasto = libro({ loans: [{ ...L, payments: [{ ...pago, expense_id: "g-cuota" }] }] as never, expenses: [gasto({ id: "g-cuota", valor: 100000, origen: "prestamo" })] })
    expect(saldo(conGasto)).toBe(400000)
    // Me deben: la cuota que te pagan entra.
    expect(saldo(libro({ loans: [{ ...L, kind: "cobrar", tipo: "presto", contact_id: "ct1", payments: [pago] }] as never }))).toBe(600000)
  })

  it("tarjeta de crédito: la compra no baja la cuenta; el pago de la tarjeta sí", () => {
    const b = libro({
      expenses: [gasto({ id: "g-tc", origen: "tarjeta", payment_method_id: "m-nequi", valor: 300000 })],
      creditCards: [{ id: "t1", nombre: "Visa", corte: 25, pago: 10, tasa: 2, cupo: 5000000, purchases: [{ id: "cp1", fecha: "2026-11-05", valor: 300000, cuotas: 1 }], pagos: [{ id: "pay1", fecha: "2026-11-08", valor: 120000, payment_method_id: "m-nequi", created_at: "2026-11-08T10:00:00Z" }] }] as never,
    })
    expect(saldo(b)).toBe(380000)
  })

  it("pagar un gasto fijo cuenta una sola vez (su gasto), aunque el pago también guarde el medio", () => {
    const b = libro({
      fixedExpenses: [{ id: "f1", nombre: "Arriendo", valor: 300000, frec: "mensual", dia: 5, payments: [{ periodo: "2026-11", fecha: "2026-11-05", valor: 300000, payment_method_id: "m-nequi" }] } as never],
      expenses: [gasto({ id: "g-f1", descripcion: "Arriendo", valor: 300000, fixed_expense_id: "f1", periodo: "2026-11" })],
    })
    expect(saldo(b)).toBe(200000)
    // Y en el flujo integral también sale una vez.
    const F = flujoIntegral(b, periodo(b, "mes", 2026, 10), HOY)
    expect(F.sal.filter((m) => m.n === "Arriendo")).toHaveLength(1)
  })

  it("abonos y aportes: de la cuenta del medio a la cuenta de la meta; en la misma cuenta no mueven nada", () => {
    const vivaBanco = { id: "a-banco", cod: "1110", nombre: "Bancolombia", valor: 2000000, currency: "COP", saldo_base: 2000000, saldo_fecha: "2026-11-02", saldo_at: CUADRE }
    const base = libro({
      assets: [libro().assets[0], vivaBanco as never],
      goals: [{ id: "g-viaje", nombre: "Viaje", objetivo: 3000000, ahorrado: 200000, fecha: null, asset_id: "a-banco" } as never, { id: "g-moto", nombre: "Moto", objetivo: 1000000, ahorrado: 0, fecha: null, asset_id: "a-nequi" } as never],
    })
    const b: LibroCuentas = {
      ...base,
      goalMovements: [
        { id: "gm1", goal_id: "g-viaje", tipo: "abono", valor: 100000, fecha: "2026-11-06", payment_method_id: "m-nequi", created_at: "2026-11-06T10:00:00Z" },
        { id: "gm2", goal_id: "g-moto", tipo: "abono", valor: 70000, fecha: "2026-11-06", payment_method_id: "m-nequi", created_at: "2026-11-06T10:00:00Z" },
      ],
      fixedExpenses: [{ id: "ap1", nombre: "Aporte a meta: Viaje", valor: 50000, frec: "mensual", dia: 7, link_type: "meta", link_id: "g-viaje", payments: [] } as never],
      expenses: [gasto({ id: "g-ap", descripcion: "Aporte a meta: Viaje", valor: 50000, origen: "aporte", fixed_expense_id: "ap1", aporte: { t: "meta", id: "g-viaje" }, fecha: "2026-11-07" })],
    }
    const S = saldosCuentas(b, HOY)
    expect(S.get("a-nequi")!.saldo).toBe(500000 - 100000 - 50000)
    expect(S.get("a-banco")!.saldo).toBe(2000000 + 100000 + 50000)
  })

  it("cuenta en dólares: los movimientos se pasan a su moneda", () => {
    const b = libro({ assets: [{ id: "a-usd", cod: "1110", nombre: "Cuenta USD", valor: 100, currency: "USD", saldo_base: 100, saldo_fecha: "2026-11-02", saldo_at: CUADRE } as never], paymentMethods: [{ id: "m-usd", nombre: "Dólares", asset_id: "a-usd" }], expenses: [gasto({ id: "g", payment_method_id: "m-usd", valor: 40000 })] })
    expect(saldo(b, "a-usd")).toBe(90)
  })
})

describe("conSaldos: el saldo de hoy llega a todo el libro", () => {
  it("totales, liquidez y estado usan el saldo calculado; las cuentas manuales siguen igual", () => {
    const b = conSaldos(libro({ expenses: [gasto({ id: "g1" })] }), HOY)
    const nequi = b.assets[0] as { valor: number; valor_manual?: number }
    expect(nequi.valor).toBe(450000)
    expect(nequi.valor_manual).toBe(500000)
    expect(b.assets[1].valor).toBe(2000000)
    expect(liquidez(b.assets, b.investments, b.settings.trm, HOY)).toBe(2450000)
    expect(totales(b, HOY).A).toBe(102450000)
    const E = estadoIntegral(b, HOY)
    expect(E.tengo.find((l) => l.k === "asset:a-nequi")).toMatchObject({ v: 450000, s: "Se actualiza con tus movimientos" })
    // Aplicarlo dos veces da lo mismo (parte siempre de la base).
    expect(conSaldos(b, HOY).assets[0].valor).toBe(450000)
    // Sin cuentas automáticas, el libro no cambia.
    const sin = libro({ assets: [libro().assets[1]] })
    expect(conSaldos(sin, HOY)).toBe(sin)
  })
})

describe("ahorro apartado: metas y fondo que no están en una cuenta", () => {
  it("suma aparte en lo que tienes, sin contar dos veces lo que está dentro de una cuenta", () => {
    const b = libro({
      goals: [{ id: "g1", nombre: "Viaje", objetivo: 2000000, ahorrado: 300000, fecha: null } as never, { id: "g2", nombre: "Moto", objetivo: 1000000, ahorrado: 200000, fecha: null, asset_id: "a-banco" } as never],
      fund: { activo: true, saldo: 400000 },
    })
    const ap = ahorroApartado(b)
    expect(ap.lineas.map((l) => l.k)).toEqual(["goal:g1", "fondo"])
    expect(ap.total).toBe(700000)
    const E = estadoIntegral(b, HOY)
    expect(E.apartado).toBe(700000)
    expect(E.A).toBe(totales(b, HOY).A + 700000)
    expect(E.pat).toBe(E.A - E.P)
    expect(E.tengo.filter((l) => l.grupo === "ahorro").map((l) => l.n)).toEqual(["Fondo de emergencia", "Viaje"])
    // El fondo en una cuenta ya suma en esa cuenta.
    expect(ahorroApartado({ ...b, fund: { activo: true, saldo: 400000, asset_id: "a-banco" } }).total).toBe(300000)
    expect(snapshotMes(b, HOY)).toEqual({ mes: "2026-11", activos: E.A, deudas: E.P, patrimonio: E.pat })
  })
})

describe("abono directo a una meta en el flujo", () => {
  it("cuenta como ahorro (no gasto) en su fecha, y un retiro lo resta", () => {
    const b = libro({
      goals: [{ id: "g1", nombre: "Viaje", objetivo: 2000000, ahorrado: 300000, fecha: null }],
      goalMovements: [
        { id: "gm1", goal_id: "g1", tipo: "abono", valor: 150000, fecha: "2026-11-06" },
        { id: "gm2", goal_id: "g1", tipo: "retiro", valor: 50000, fecha: "2026-11-08" },
        { id: "gm3", goal_id: "g-borrada", tipo: "abono", valor: 999, fecha: "2026-11-08" },
      ],
    })
    const F = flujoIntegral(b, periodo(b, "mes", 2026, 10), HOY)
    expect(F.tot.ahorro).toBe(100000)
    expect(F.movs.filter((m) => m.modulo === "metas").every((m) => m.clase === "ahorro")).toBe(true)
    expect(F.movs.filter((m) => m.modulo === "metas").map((m) => [m.dir, m.v])).toEqual([["sale", 150000], ["entra", 50000]])
    // Los abonos que trae la vista (X.metas) mandan sobre los del libro.
    expect(flujoIntegral(b, periodo(b, "mes", 2026, 10), HOY, { metas: [] }).tot.ahorro).toBe(0)
  })
})

describe("mediosSugeridos", () => {
  it("sugiere los medios sin cuenta que comparten una palabra con el nombre de la cuenta", () => {
    const medios = [{ id: "1", nombre: "Nequi / Daviplata" }, { id: "2", nombre: "Efectivo" }, { id: "3", nombre: "Nequi viejo", asset_id: "otra" }]
    expect(mediosSugeridos("Mi Nequi", medios)).toEqual(["1"])
    expect(mediosSugeridos("Cuenta de ahorros", medios)).toEqual([])
  })
})
