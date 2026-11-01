import { describe, expect, it } from "vitest"
import { ahorro, aporteParaMeta, cdt, credito, eaToEm, emToEa, gmf, inflacion } from "./calculadoras"

describe("calculadoras", () => {
  it("convierte tasas E.A. ↔ E.M.", () => {
    expect(eaToEm(12.6825) * 100).toBeCloseTo(1, 3)
    expect(emToEa(0.01)).toBeCloseTo(12.6825, 3)
  })
  it("CDT a 360 días con retención del 4 %", () => {
    const r = cdt({ monto: 10_000_000, ea: 10, dias: 365 })
    expect(r.interes).toBe(1_000_000)
    expect(r.retencion).toBe(40_000)
    expect(r.neto).toBe(960_000)
    expect(r.total).toBe(10_960_000)
  })
  it("crédito de cuota fija: la tabla termina en cero y cuadra", () => {
    const r = credito({ monto: 1_000_000, ea: 0, meses: 10 })
    expect(r.cuota).toBe(100_000)
    expect(r.intereses).toBe(0)
    const c = credito({ monto: 10_000_000, ea: 26.82, meses: 24 })
    expect(c.tabla.at(-1)!.saldo).toBe(0)
    expect(c.cuota).toBeGreaterThan(10_000_000 / 24)
    expect(Math.abs(c.tabla.reduce((t, x) => t + x.capital, 0) - 10_000_000)).toBeLessThan(30)
  })
  it("ahorro con interés compuesto y aporte para una meta (son inversas)", () => {
    const a = ahorro({ inicial: 0, mensual: 500_000, ea: 0, meses: 12 })
    expect(a.final).toBe(6_000_000)
    expect(a.intereses).toBe(0)
    const m = aporteParaMeta({ meta: 10_000_000, ea: 9, meses: 24 })
    const back = ahorro({ inicial: 0, mensual: m, ea: 9, meses: 24 })
    expect(back.final).toBeGreaterThanOrEqual(10_000_000)
    expect(back.final - 10_000_000).toBeLessThan(30)
  })
  it("4×1000 con y sin exención de 350 UVT", () => {
    expect(gmf({ monto: 1_000_000 }).impuesto).toBe(4_000)
    const r = gmf({ monto: 20_000_000, exento: true, uvt: 49_799 })
    expect(r.tope).toBe(17_429_650)
    expect(r.impuesto).toBe(Math.round((20_000_000 - 17_429_650) * 0.004))
  })
  it("inflación: costo futuro y poder de compra", () => {
    const r = inflacion({ valor: 100_000, anual: 10, anios: 1 })
    expect(r.costoFuturo).toBe(110_000)
    expect(r.poderDeCompra).toBe(90_909)
    expect(r.perdidaPct).toBe(9.1)
  })
})
