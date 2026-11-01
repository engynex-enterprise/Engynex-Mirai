import { describe, expect, it } from "vitest"
import { ahorroAnual, extendVence, featureOfSection, mrr, vigente } from "./plans"


describe("planes", () => {
  it("ahorro del plan anual frente a 12 meses", () => {
    expect(ahorroAnual(14900, 149000)).toEqual({ pesos: 29800, meses: 2 })
  })
  it("extiende desde hoy o desde el vencimiento futuro; fin de mes sin desbordar", () => {
    const now = new Date("2026-11-01T12:00:00Z")
    expect(extendVence(null, "mes", now).toISOString().slice(0, 10)).toBe("2026-12-01")
    expect(extendVence("2026-11-20T12:00:00Z", "mes", now).toISOString().slice(0, 10)).toBe("2026-12-20")
    expect(extendVence("2026-10-01T12:00:00Z", "anio", now).toISOString().slice(0, 10)).toBe("2027-11-01")
    expect(extendVence("2027-01-31T12:00:00Z", "mes", now).toISOString().slice(0, 10)).toBe("2027-02-28")
  })
  it("vigencia con 3 días de gracia", () => {
    const now = new Date("2026-11-10T00:00:00Z")
    expect(vigente("2026-11-08T00:00:00Z", now)).toBe(true)
    expect(vigente("2026-11-06T00:00:00Z", now)).toBe(false)
    expect(vigente(null, now)).toBe(false)
  })
  it("secciones Premium del menú", () => {
    expect(featureOfSection("consejero")).toBe("ia")
    expect(featureOfSection("renta")).toBe("impuestos")
    expect(featureOfSection("gastos")).toBeUndefined()
  })
  it("MRR: mensuales + anuales/12, sin cortesías ni canceladas", () => {
    const subs = [{ periodo: "mes", estado: "activa", proveedor: "mercadopago" }, { periodo: "anio", estado: "activa", proveedor: "wompi" }, { periodo: "mes", estado: "cortesia", proveedor: "manual" }, { periodo: "mes", estado: "cancelada", proveedor: "mercadopago" }]
    expect(Math.round(mrr(subs, 14900, 149000))).toBe(14900 + 12417)
  })
})
