import { describe, expect, it } from "vitest"
import { cuotasDelMes, cuotasMes } from "./totals"
import { loanEngine } from "./loans"
import { fijoStatus, pagoPeriodo } from "./fixed"
import { flujoIntegral, periodo } from "./flujo-integral"
import type { LoanIn } from "./types"

const L = (o: Partial<LoanIn> & { vence?: string }): LoanIn => ({ kind: "pagar", monto: 1_000_000, sistema: "sin", tasa: 0, frec: "mensual", plazo: 1, inicio: "2026-11-01", extra: 0, payments: [], ...o }) as LoanIn
const HOY = "2026-11-08"

describe("cuotas de los préstamos", () => {
  it("pago único dentro de 6 meses: no es $5.000.000 al mes, se reparte entre los meses que faltan", () => {
    const p = L({ monto: 5_000_000, frec: "unico", plazo: 1, inicio: "2026-11-01", vence: "2027-05-01" } as never)
    const m = cuotasMes([p], "pagar", HOY)
    expect(m).toBeLessThan(1_000_000)
    expect(m).toBeGreaterThan(700_000)
    expect(cuotasDelMes([p], "pagar", HOY)).toBe(0) // este mes no toca pagar nada
  })
  it("cuota mensual normal: la cuota del mes", () => {
    const p = L({ monto: 1_200_000, plazo: 12, inicio: "2026-10-15" })
    expect(cuotasMes([p], "pagar", HOY)).toBeCloseTo(100_000, 0)
    expect(cuotasDelMes([p], "pagar", HOY)).toBeCloseTo(100_000, 0)
  })
  it("quincenal: dos cuotas en el mes", () => {
    const p = L({ monto: 300_000, plazo: 3, frec: "quincenal", inicio: "2026-11-01" })
    expect(cuotasMes([p], "pagar", HOY)).toBeCloseTo(200_000, 0)
  })
  it("solo intereses (empeño): cuentan los intereses del mes, no el capital del final", () => {
    const p = L({ monto: 500_000, sistema: "americano", tasa: 4, plazo: 4, inicio: "2026-10-20" })
    expect(cuotasMes([p], "pagar", HOY)).toBeCloseTo(20_000, 0)
  })
})

describe("pago de parte de una cuota", () => {
  const base = { kind: "cobrar", monto: 300_000, sistema: "sin", tasa: 0, frec: "quincenal", plazo: 3, inicio: "2026-10-20", extra: 0 }
  it("$50.000 de una cuota de $100.000: falta la mitad de esa cuota, no sigue debiendo la cuota completa", () => {
    const e = loanEngine({ ...base, payments: [{ id: "a", fecha: "2026-11-01", tipo: "cuota", valor: 50_000 }] } as never, "2026-11-06")
    expect(e.k).toBe(0)
    expect(e.next?.valor).toBeCloseTo(50_000, 0)
    expect(e.next?.abonado).toBeCloseTo(50_000, 0)
    expect(e.pagado).toBe(50_000)
    expect(e.saldo).toBe(300_000) // el capital baja cuando se completa la cuota
    expect(e.vencidas.reduce((a, q) => a + q.valor, 0)).toBeCloseTo(50_000, 0) // para ponerse al día: $50.000
    expect(e.totalPagar).toBeCloseTo(300_000, 0)
  })
  it("con otros $50.000 se completa la cuota", () => {
    const e = loanEngine({ ...base, payments: [{ id: "a", fecha: "2026-11-01", tipo: "cuota", valor: 50_000 }, { id: "b", fecha: "2026-11-03", tipo: "cuota", valor: 50_000 }] } as never, "2026-11-06")
    expect(e.k).toBe(1)
    expect(e.saldo).toBeCloseTo(200_000, 0)
    expect(e.next?.valor).toBeCloseTo(100_000, 0)
    expect(e.mora).toBe(0)
  })
  it("pagar $150.000 como cuota: completa una y abona $50.000 a la siguiente", () => {
    const e = loanEngine({ ...base, payments: [{ id: "a", fecha: "2026-11-03", tipo: "cuota", valor: 150_000 }] } as never, "2026-11-06")
    expect(e.k).toBe(1)
    expect(e.next?.valor).toBeCloseTo(50_000, 0)
    expect(e.pagado).toBe(150_000)
  })
  it("los registros viejos con valor 0 siguen siendo la cuota exacta", () => {
    const e = loanEngine({ ...base, payments: [{ id: "a", fecha: "2026-11-03", tipo: "cuota", valor: 0 }] } as never, "2026-11-06")
    expect(e.k).toBe(1)
    expect(e.pagado).toBeCloseTo(100_000, 0)
  })
})

describe("abonos a un gasto fijo (la moto)", () => {
  const moto = { id: "m", nombre: "Moto", valor: 70_000, frec: "quincenal", dia: 15, dia2: 30, desde: "2026-11", payments: [] } as never as import("./types").FixedExpenseIn
  it("$40.000 de $70.000 en la 1ª quincena: faltan $30.000 y sigue pendiente", () => {
    const f = { ...moto, payments: [{ periodo: "2026-11-Q1", fecha: "2026-11-05", valor: 40_000, cierra: false }] }
    const P = pagoPeriodo(f, "2026-11-Q1", f.payments)
    expect(P).toMatchObject({ pagado: 40_000, falta: 30_000, completo: false, parcial: true })
    const st = fijoStatus(f, "2026-11-08")
    expect(st.prox?.per).toBe("2026-11-Q1")
    expect(st.prox?.falta).toBe(30_000)
  })
  it("un pago de antes (sin marcar) por menos también cuenta como abono", () => {
    const P = pagoPeriodo(moto, "2026-11-Q1", [{ periodo: "2026-11-Q1", fecha: "2026-11-05", valor: 40_000 }])
    expect(P.falta).toBe(30_000)
  })
  it("con los $30.000 que faltan queda pagado", () => {
    const P = pagoPeriodo(moto, "2026-11-Q1", [{ periodo: "2026-11-Q1", fecha: "2026-11-05", valor: 40_000, cierra: false }, { periodo: "2026-11-Q1", fecha: "2026-11-12", valor: 30_000, cierra: true }])
    expect(P).toMatchObject({ pagado: 70_000, falta: 0, completo: true })
  })
  it("'esta vez costó menos': $40.000 marcados como completos", () => {
    expect(pagoPeriodo(moto, "2026-11-Q1", [{ periodo: "2026-11-Q1", fecha: "2026-11-05", valor: 40_000, cierra: true }]).completo).toBe(true)
  })
  it("en el Balance: $40.000 pagados y $30.000 por pagar", () => {
    const b = { settings: { umbral: 25000, limite: 200000, trm: {}, emerg_meta: 6, anticipo: 5, corte_q: 15, alerta_pres: 80 }, categories: [], incomes: [], extraIncomes: [], expenses: [], subscriptions: [], loans: [], creditCards: [], assets: [], liabilities: [], investments: [], goals: [], calendarEvents: [], contacts: [], entities: [], goalMovements: [], fixedExpenses: [{ ...moto, payments: [{ periodo: "2026-11-Q1", fecha: "2026-11-05", valor: 40_000, cierra: false }] }] }
    const F = flujoIntegral(b as never, periodo(b as never, "q1", 2026, 10), "2026-11-08")
    const moto1 = F.movs.filter((x) => x.id.startsWith("fijo:m:2026-11-Q1"))
    expect(moto1.map((x) => [x.estado, x.v])).toEqual([["hecho", 40_000], ["programado", 30_000]])
  })
})
