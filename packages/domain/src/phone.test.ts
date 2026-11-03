import { describe, expect, it } from "vitest"
import { formatCoPhone, normalizeCoPhone } from "./phone"

describe("celulares de Colombia", () => {
  it("normaliza las formas comunes y rechaza fijos", () => {
    for (const s of ["315 123 4567", "(315) 123-4567", "+57 315 123 4567", "573151234567", "00573151234567", "03151234567"]) expect(normalizeCoPhone(s), s).toBe("573151234567")
    expect(normalizeCoPhone("601 123 4567")).toBeNull()
    expect(formatCoPhone("573151234567")).toBe("+57 315 123 4567")
  })
})
