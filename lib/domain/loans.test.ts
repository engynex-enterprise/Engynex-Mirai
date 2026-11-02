import { describe, expect, it } from "vitest"
import { asV5Loan, expectClose, legacyCall, scenario, v4Loan } from "./__tests__/adapt"
import { loadLegacy } from "./__tests__/legacy"
import { annuity, histPlan, loanCal, loanEngine, loanName, loanStatus, periodRate, previewLoan, rateFromCuota } from "./loans"

const HOY = "2026-10-31"
const L4 = loadLegacy(HOY)

const SISTEMAS = ["frances", "aleman", "simple", "americano", "sin", "diario"] // "diario" no existe en la v4 → se comporta como francés
const FRECS = ["mensual", "quincenal", "semanal", "diario", "diariohab"]
const PAGOS: Record<string, unknown[]> = {
  ninguno: [],
  "3 cuotas": [
    { id: "a", fecha: "2026-02-15", tipo: "cuota", valor: 0 },
    { id: "b", fecha: "2026-03-15", tipo: "cuota", valor: 0 },
    { id: "c", fecha: "2026-04-15", tipo: "cuota", valor: 0 },
  ],
  "abono para terminar antes": [
    { id: "a", fecha: "2026-02-15", tipo: "cuota", valor: 0 },
    { id: "b", fecha: "2026-03-15", tipo: "cuota", valor: 0 },
    { id: "x", fecha: "2026-03-20", tipo: "abono", valor: 200000, modo: "plazo" },
    { id: "c", fecha: "2026-04-15", tipo: "cuota", valor: 0 },
  ],
  "abono para bajar la cuota": [
    { id: "a", fecha: "2026-02-15", tipo: "cuota", valor: 0 },
    { id: "x", fecha: "2026-02-20", tipo: "abono", valor: 300000, modo: "cuota" },
    { id: "c", fecha: "2026-03-15", tipo: "cuota", valor: 0 },
  ],
  "abono que salda todo": [
    { id: "a", fecha: "2026-02-15", tipo: "cuota", valor: 0 },
    { id: "x", fecha: "2026-02-20", tipo: "abono", valor: 5000000, modo: "plazo" },
    { id: "c", fecha: "2026-03-15", tipo: "cuota", valor: 0 },
  ],
  "más cuotas que el plazo": Array.from({ length: 15 }, (_, j) => ({ id: "q" + j, fecha: "2026-02-15", tipo: "cuota", valor: 0 })),
  "fechas desordenadas y empates": [
    { id: "c", fecha: "2026-04-15", tipo: "cuota", valor: 0 },
    { id: "x2", fecha: "2026-02-15", tipo: "abono", valor: 50000, modo: "plazo" },
    { id: "a", fecha: "2026-02-15", tipo: "cuota", valor: 0 },
    { id: "x3", fecha: "2026-03-01", tipo: "abono", valor: 0, modo: "cuota" },
  ],
}

describe("loanEngine = engine() de la v4", () => {
  for (const sistema of SISTEMAS)
    for (const frec of FRECS)
      for (const [nombre, pagos] of Object.entries(PAGOS))
        it(`${sistema} · ${frec} · ${nombre}`, () => {
          const L = v4Loan({ sistema, frec, pagos, plazo: 12, tasa: 1.9, extra: sistema === "frances" ? 15000 : 0 })
          expectClose(loanEngine(asV5Loan(L), HOY), legacyCall(L4, "engine", L))
        })

  it("tasa 0 en francés con abono para terminar antes (i = 0)", () => {
    const L = v4Loan({ tasa: 0, plazo: 10, pagos: [{ id: "x", fecha: "2026-02-01", tipo: "abono", valor: 250000, modo: "plazo" }] })
    const e = loanEngine(asV5Loan(L), HOY)
    expectClose(e, legacyCall(L4, "engine", L))
    expect(e.plan.length).toBe(8)
  })

  it("préstamos del ejemplo (sample) de la familia Navarro", () => {
    const sc = scenario(HOY)
    for (const L of sc.book.loans) {
      const v4 = L.kind === "cobrar" ? sc.S.cobrar.find((x: { id: string }) => x.id === L.id) : sc.S.pagar.find((x: { id: string }) => x.id === L.id)
      expectClose(loanEngine(L, HOY), legacyCall(sc.L, "engine", v4))
    }
  })

  it("mora y cuotas vencidas cuentan desde hoy", () => {
    const L = v4Loan({ inicio: "2026-05-10", plazo: 12 })
    const e = loanEngine(asV5Loan(L), HOY)
    expect(e.vencidas.length).toBe(5) // jun..oct
    expect(e.mora).toBe(143) // desde el 10 jun
    expectClose(e, legacyCall(L4, "engine", L))
  })

  it("periodRate y annuity", () => {
    expect(periodRate({ tasa: 2, sistema: "simple", frec: "quincenal" })).toBeCloseTo(0.01, 12)
    expect(periodRate({ tasa: 2, sistema: "frances", frec: "quincenal" })).toBeCloseTo(Math.sqrt(1.02) - 1, 12)
    expect(periodRate({ tasa: 2, sistema: "sin", frec: "mensual" })).toBe(0)
    expect(annuity(1000, 0, 4)).toBe(250)
    expect(annuity(1000, 0.1, 0)).toBe(1000)
  })
})

describe("previewLoan y rateFromCuota", () => {
  for (const sistema of ["frances", "aleman", "simple", "americano", "sin"])
    it(`previewLoan ${sistema}`, () => {
      const p = { monto: 5000000, sistema, tasa: 1.5, frec: "mensual", plazo: 24, inicio: "2026-11-05", extra: 8000 }
      expectClose(previewLoan(p, HOY), legacyCall(L4, "previewLoan", p))
    })
  it("previewLoan sin inicio usa hoy", () => {
    const p = { monto: 1000000, sistema: "frances", tasa: 2, frec: "quincenal", plazo: 6 }
    expectClose(previewLoan(p, HOY), legacyCall(L4, "previewLoan", p))
  })
  it.each([
    [1000000, 100000, 12, "mensual"],
    [5000000, 260000, 24, "mensual"],
    [2000000, 90000, 24, "quincenal"],
    [1000000, 50000, 20, "mensual"], // cuota·n ≤ monto → 0
  ])("rateFromCuota(%d, %d, %d, %s)", (M, c, n, f) => {
    expect(rateFromCuota(M, c, n, f)).toBe(L4.call("rateFromCuota", M, c, n, f))
  })
})

describe("loanName, loanStatus y loanCal", () => {
  const sc = scenario(HOY)
  it("loanName = v4 para todos los préstamos del ejemplo", () => {
    for (const L of sc.book.loans) {
      const v4 = sc.ev(`loanName(S.${L.kind}.find(x=>x.id==='${L.id}'),'${L.kind}')`)
      expect(loanName(L, sc.book.contacts, sc.book.entities)).toBe(v4)
    }
    expect(loanName({ kind: "cobrar", contact_id: "nada" }, [], [])).toBe("Sin contacto")
    expect(loanName({ kind: "pagar", entity_id: "nada" }, [], [])).toBe("—")
  })
  it("loanStatus = v4", () => {
    const casos = [
      v4Loan({ inicio: "2026-05-10" }), // atrasado
      v4Loan({ inicio: "2026-10-03" }), // cuota pronto (3 nov)
      v4Loan({ inicio: "2026-10-20" }), // al día
      v4Loan({ plazo: 1, pagos: [{ id: "a", fecha: "2026-02-15", tipo: "cuota" }] }), // pagado
    ]
    for (const L of casos) {
      const e = loanEngine(asV5Loan(L), HOY)
      expect(loanStatus(e, HOY, 5)).toEqual(L4.plain(L4.ev(`loanStatus(engine(JSON.parse(${JSON.stringify(JSON.stringify(L))})))`)))
    }
  })
  it("loanCal = v4", () => {
    for (const L of sc.book.loans) {
      const v4 = sc.plain(`loanCal(S.${L.kind}.find(x=>x.id==='${L.id}'))`)
      expectClose(loanCal(loanEngine(L, HOY)), v4)
    }
  })
})

describe("histPlan (préstamos que ya venían de antes) = v4", () => {
  // Formulario falso para `fv(form, campo)` de la v4.
  L4.ev(`globalThis.__form=o=>({querySelector:s=>{const n=s.match(/name="([^"]+)"/)[1];if(!(n in o))return null;return{type:'text',value:String(o[n]),dataset:n==='saldoHoy'?{money:''}:n==='ncuotasPag'?{num:''}:{}}}})`)
  const run = (L: object, form: Record<string, unknown>) =>
    L4.plain(L4.ev(`histPlan(JSON.parse(${JSON.stringify(JSON.stringify(L))}),__form(JSON.parse(${JSON.stringify(JSON.stringify(form))})))`)).pagos.map((p: { id?: string }) => { delete p.id; return p })

  const loans = [
    v4Loan({ inicio: "2025-12-05", plazo: 24, tasa: 1.8, monto: 6000000 }),
    v4Loan({ inicio: "2026-06-01", plazo: 20, sistema: "aleman", frec: "quincenal", monto: 2000000 }),
    v4Loan({ inicio: "2026-01-01", plazo: 10, sistema: "sin", tasa: 0, monto: 1000000 }),
  ]
  for (const [ix, L] of loans.entries()) {
    it(`préstamo ${ix + 1}: va al día`, () => expect(histPlan(asV5Loan(L), { mode: "aldia" }, HOY)).toEqual(run(L, { hist: "aldia" })))
    it(`préstamo ${ix + 1}: ya se pagaron 4 cuotas`, () => expect(histPlan(asV5Loan(L), { mode: "cuotas", ncuotas: 4 }, HOY)).toEqual(run(L, { hist: "cuotas", ncuotasPag: "4" })))
    it(`préstamo ${ix + 1}: más cuotas de las que hay`, () => expect(histPlan(asV5Loan(L), { mode: "cuotas", ncuotas: 99 }, HOY)).toEqual(run(L, { hist: "cuotas", ncuotasPag: "99" })))
    it(`préstamo ${ix + 1}: sé cuánto debo hoy`, () => {
      const saldo = Math.round(+L.monto * 0.55)
      expect(histPlan(asV5Loan(L), { mode: "saldo", saldoHoy: saldo, fultPago: "2026-10-10" }, HOY)).toEqual(run(L, { hist: "saldo", saldoHoy: String(saldo), fultPago: "2026-10-10" }))
    })
  }
  it("modo nuevo no genera pagos", () => expect(histPlan(asV5Loan(loans[0]), { mode: "nuevo" }, HOY)).toEqual([]))
  it("después de aplicar el saldo, el motor queda en el saldo escrito", () => {
    const L = asV5Loan(loans[0])
    const pagos = histPlan(L, { mode: "saldo", saldoHoy: 3300000, fultPago: "2026-10-10" }, HOY)
    const e = loanEngine({ ...L, payments: pagos.map((p) => ({ ...p, valor: p.valor ?? 0 })) }, HOY)
    expect(Math.abs(e.saldo - 3300000)).toBeLessThan(2)
  })
})

describe("pago único y fiado", () => {
  const base = { monto: 1_000_000, sistema: "simple", tasa: 2, frec: "unico", plazo: 12, inicio: "2026-01-01", extra: 0, payments: [] }
  it("una sola cuota en la fecha pactada, con interés por los días que dura", () => {
    const e = loanEngine({ ...base, vence: "2026-04-01" }, "2026-01-02")
    expect(e.plan).toHaveLength(1)
    expect(e.plan[0].fecha).toBe("2026-04-01")
    // 90 días ≈ 2,96 meses al 2 % simple
    expect(e.plan[0].valor).toBeGreaterThan(1_058_000)
    expect(e.plan[0].valor).toBeLessThan(1_060_000)
  })
  it("fiado sin intereses: lo mismo que se debe", () => {
    const e = loanEngine({ ...base, sistema: "sin", tasa: 0, vence: "2026-01-31" }, "2026-01-02")
    expect(e.plan[0].valor).toBe(1_000_000)
  })
  it("el nombre de un fiado sale del proveedor (acreedor)", () => {
    expect(loanName({ kind: "pagar", contact_id: null, entity_id: null, acreedor: "Tienda Don Pepe" }, [], [])).toBe("Tienda Don Pepe")
    expect(loanName({ kind: "pagar", contact_id: null, entity_id: null }, [], [])).toBe("—")
  })
})

describe("fecha de la primera cuota aparte de la del préstamo", () => {
  const base = { monto: 1_200_000, sistema: "simple", tasa: 0, frec: "mensual", plazo: 6, inicio: "2026-03-01", extra: 0, payments: [] }
  it("sin primera: la cuota 1 cae un mes después del préstamo (como la v4)", () => {
    const e = loanEngine(base, "2026-03-02")
    expect(e.plan[0].fecha).toBe("2026-04-01")
    expect(e.plan.at(-1)!.fecha).toBe("2026-09-01")
  })
  it("con primera: la cuota 1 cae ese día y las demás cada periodo después", () => {
    const e = loanEngine({ ...base, primera: "2026-06-15" }, "2026-03-02")
    expect(e.plan.map((p) => p.fecha)).toEqual(["2026-06-15", "2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15", "2026-11-15"])
    expect(e.plan[0].valor).toBe(200_000)
  })
  it("quincenal desde la primera fecha", () => {
    const e = loanEngine({ ...base, frec: "quincenal", plazo: 3, primera: "2026-04-10" }, "2026-03-02")
    expect(e.plan.map((p) => p.fecha)).toEqual(["2026-04-10", "2026-04-25", "2026-05-10"])
  })
})
