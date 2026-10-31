import { describe, expect, it } from "vitest"
import { expectClose, scenario } from "./__tests__/adapt"
import { HOYS, RICO } from "./__tests__/fixtures"
import { flujo } from "./cashflow"

for (const hoy of HOYS)
  describe(`flujo() = v4 · hoy ${hoy}`, () => {
    it("sample", () => {
      const sc = scenario(hoy)
      expectClose(flujo(sc.book, hoy), sc.plain("flujo()"))
    })
    it("sample + extras (tarjetas, extras, calendario con montos, cuotas vencidas)", () => {
      const sc = scenario(hoy).mutate(RICO + "S.pagar[0].pagos=S.pagar[0].pagos.slice(0,10);")
      expectClose(flujo(sc.book, hoy), sc.plain("flujo()"))
    })
  })

describe("paridad documentada (NOTAS.md)", () => {
  it("los ingresos anuales cuentan 0 en el flujo, igual que la v4", () => {
    const sc = scenario("2026-10-31").mutate(RICO)
    const con = flujo(sc.book, "2026-10-31")
    const sin = flujo({ ...sc.book, incomes: sc.book.incomes.filter((i) => i.frec !== "anual") }, "2026-10-31")
    expect(con.map((m) => m.det.ing)).toEqual(sin.map((m) => m.det.ing))
  })
})
