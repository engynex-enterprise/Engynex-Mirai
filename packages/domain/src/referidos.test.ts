import { describe, expect, it } from "vitest"
import { ALFABETO, cortesiaHasta, normCodigo, nuevoCodigo, referidosCfg } from "./referidos"

describe("referidos", () => {
  it("código de 8 letras del alfabeto sin 0/O ni 1/I", () => {
    for (let i = 0; i < 50; i++) expect(nuevoCodigo()).toMatch(new RegExp(`^[${ALFABETO}]{8}$`))
    expect(nuevoCodigo(4, () => 0)).toBe("AAAA")
  })
  it("normaliza el código que llega del registro o de la cookie", () => {
    expect(normCodigo(" abcd2345 ")).toBe("ABCD2345")
    expect(normCodigo("abc")).toBeNull()
    expect(normCodigo("abc-12345")).toBeNull()
    expect(normCodigo(undefined)).toBeNull()
  })
  it("ajustes por defecto y días que se suman a la cortesía vigente", () => {
    expect(referidosCfg(null)).toEqual({ activo: true, plan: "premium", dias: 30 })
    expect(cortesiaHasta("2026-12-01T00:00:00.000Z", 30)).toBe("2026-12-31T00:00:00.000Z")
    expect(cortesiaHasta(null, 1, new Date("2026-11-02T00:00:00Z"))).toBe("2026-11-03T00:00:00.000Z")
  })
})
