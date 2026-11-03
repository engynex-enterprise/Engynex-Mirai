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
    expect(featureOfSection("consejero")).toBeUndefined() // funciona en Gratis con algoritmos
    expect(featureOfSection("renta")).toBe("impuestos")
    expect(featureOfSection("gastos")).toBeUndefined()
  })
  it("MRR: mensuales + anuales/12, sin cortesías ni canceladas", () => {
    const subs = [{ periodo: "mes", estado: "activa", proveedor: "mercadopago" }, { periodo: "anio", estado: "activa", proveedor: "wompi" }, { periodo: "mes", estado: "cortesia", proveedor: "manual" }, { periodo: "mes", estado: "cancelada", proveedor: "mercadopago" }]
    expect(Math.round(mrr(subs, 14900, 149000))).toBe(14900 + 12417)
  })
})

import { couponProblem, withCoupon, type Coupon } from "./plans"

describe("cupones", () => {
  const c: Coupon = { codigo: "LANZA", tipo: "porcentaje", valor: 50, planes: [], periodos: ["mes", "anio"], desde: "2026-11-01", hasta: "2026-11-30", max_usos: 10, usos: 3, activo: true }
  it("valida vigencia, usos, plan y periodo", () => {
    expect(couponProblem(c, "premium", "mes", "2026-11-15")).toBeNull()
    expect(couponProblem(c, "premium", "mes", "2026-10-31")).toMatch(/todavía no/)
    expect(couponProblem(c, "premium", "mes", "2026-12-01")).toMatch(/venció/)
    expect(couponProblem({ ...c, usos: 10 }, "premium", "mes", "2026-11-15")).toMatch(/máximo/)
    expect(couponProblem({ ...c, planes: ["familia"] }, "premium", "mes", "2026-11-15")).toMatch(/plan/)
    expect(couponProblem({ ...c, periodos: ["anio"] }, "premium", "mes", "2026-11-15")).toMatch(/mensual/)
    expect(couponProblem(null, "premium", "mes", "2026-11-15")).toMatch(/no existe/)
  })
  it("aplica porcentaje o valor con un mínimo de $1.000", () => {
    expect(withCoupon(14900, c)).toBe(7450)
    expect(withCoupon(14900, { tipo: "valor", valor: 5000 })).toBe(9900)
    expect(withCoupon(14900, { tipo: "valor", valor: 50000 })).toBe(1000)
    expect(withCoupon(14900, null)).toBe(14900)
  })
})
