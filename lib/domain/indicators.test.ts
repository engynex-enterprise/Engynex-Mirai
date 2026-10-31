import { describe, expect, it } from "vitest"
import { expectClose, scenario } from "./__tests__/adapt"
import { HOYS, RICO } from "./__tests__/fixtures"
import { healthScore, indicadores } from "./indicators"

for (const hoy of HOYS)
  describe(`indicadores() = v4 · hoy ${hoy}`, () => {
    it("sample", () => {
      const sc = scenario(hoy)
      expectClose(indicadores(sc.book, hoy), sc.plain("indicadores()"))
    })
    it("sample + extras", () => {
      const sc = scenario(hoy).mutate(RICO)
      expectClose(indicadores(sc.book, hoy), sc.plain("indicadores()"))
    })
    it("libro vacío (faltan datos)", () => {
      const sc = scenario(hoy, "S=normalize(defaults())")
      const I = indicadores(sc.book, hoy)
      expectClose(I, sc.plain("indicadores()"))
      expect(I.every((i) => !i.ok || i.falta.length === 0)).toBe(true)
      expect(healthScore(I).visible).toBe(false)
    })
  })

describe("healthScore", () => {
  it("promedia ok 100 / warn 60 / bad 20 de los indicadores con datos", () => {
    const sc = scenario("2026-10-31")
    const I = indicadores(sc.book, "2026-10-31")
    const A = I.filter((i) => i.ok)
    const h = healthScore(I)
    expect(h.sc).toBe(Math.round(A.reduce((a, i) => a + (i.st === "ok" ? 100 : i.st === "warn" ? 60 : 20), 0) / A.length))
    expect(h.comp).toBe(A.length / 6)
  })
})
