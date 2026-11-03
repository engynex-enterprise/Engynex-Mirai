import { describe, expect, it } from "vitest"
import { daysBetween, shiftDates } from "./shift-dates"

describe("shiftDates (libro de ejemplo)", () => {
  it("corre días, meses y periodos; deja lo demás igual", () => {
    const S = { gastos: [{ fecha: "2026-10-31", per: "2026-10", desc: "Mercado 2026", n: 3 }], pagos: ["prev-2026-09-Q2", "2026-12-Q1"], ok: true }
    expect(shiftDates(S, 31)).toEqual({ gastos: [{ fecha: "2026-12-01", per: "2026-11", desc: "Mercado 2026", n: 3 }], pagos: ["prev-2026-10-Q2", "2027-01-Q1"], ok: true })
  })

  it("con 0 días devuelve el mismo objeto", () => {
    const S = { a: "2026-01-01" }
    expect(shiftDates(S, 0)).toBe(S)
  })

  it("daysBetween cuenta días calendario", () => {
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2)
    expect(daysBetween("2026-11-02", "2026-10-31")).toBe(-2)
  })
})
