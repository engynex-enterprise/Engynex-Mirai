import { describe, expect, it } from "vitest"
import { formatCoPhone, normalizeCoPhone, telefonoAviso, telefonoEscribiendo, telefonoGuardar } from "./phone"

describe("celulares de Colombia", () => {
  it("normaliza las formas comunes y rechaza fijos", () => {
    for (const s of ["315 123 4567", "(315) 123-4567", "+57 315 123 4567", "573151234567", "00573151234567", "03151234567"]) expect(normalizeCoPhone(s), s).toBe("573151234567")
    expect(normalizeCoPhone("601 123 4567")).toBeNull()
    expect(formatCoPhone("573151234567")).toBe("+57 315 123 4567")
  })
})

describe("campo de teléfono", () => {
  it("formatea mientras se escribe", () => {
    expect(telefonoEscribiendo("3")).toBe("3")
    expect(telefonoEscribiendo("3001")).toBe("300 1")
    expect(telefonoEscribiendo("3001234567")).toBe("300 123 4567")
    expect(telefonoEscribiendo("+57 300 123 4567")).toBe("300 123 4567")
    expect(telefonoEscribiendo("6012345678")).toBe("(601) 234 5678")
    expect(telefonoEscribiendo("2345678")).toBe("234 5678")
    expect(telefonoEscribiendo("")).toBe("")
    expect(telefonoEscribiendo("ext 120")).toBe("ext 120")
  })
  it("guarda solo los dígitos de un número reconocido", () => {
    expect(telefonoGuardar("300 123 4567")).toBe("3001234567")
    expect(telefonoGuardar("(601) 234 5678")).toBe("6012345678")
    expect(telefonoGuardar("234 5678")).toBe("2345678")
    expect(telefonoGuardar("300 123")).toBe("300 123")
    expect(telefonoGuardar("  oficina  120 ")).toBe("oficina 120")
  })
  it("avisa cuando el número quedó a medias", () => {
    expect(telefonoAviso("300 123 4567")).toBeNull()
    expect(telefonoAviso("")).toBeNull()
    expect(telefonoAviso("300 123")).toMatch(/10 dígitos/)
    expect(telefonoAviso("601 234")).toMatch(/indicativo/)
  })
})
