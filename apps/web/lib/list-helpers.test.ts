import { describe, expect, it } from "vitest"
import { daysBetween, dueState, dueText, lastMonths } from "./list-helpers"

// Antes en lib/domain/proveedor-pagos.test.ts (list-helpers es de la web, no del dominio).
const HOY = "2026-11-02"

describe("list-helpers", () => {
  it("fechas relativas y estados de vencimiento", () => {
    expect(daysBetween("2026-11-02", "2026-11-05")).toBe(3)
    expect(dueState("2026-11-01", HOY)).toBe("vencido")
    expect(dueState("2026-11-02", HOY)).toBe("hoy")
    expect(dueState("2026-11-06", HOY, 5)).toBe("pronto")
    expect(dueState("2026-12-06", HOY, 5)).toBe("luego")
    expect(dueText("2026-10-30", HOY)).toBe("venció hace 3 días")
    expect(dueText("2026-11-03", HOY)).toBe("mañana")
    expect(lastMonths(3, HOY)).toEqual(["2026-11", "2026-10", "2026-09"])
  })
})
