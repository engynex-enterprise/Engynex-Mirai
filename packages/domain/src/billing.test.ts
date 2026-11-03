// Reglas puras de pagos del plan que comparten apps/web (lib/payments) y apps/api (billing).
import { describe, expect, it } from "vitest"
import { mpPayState, mpRef, parseMpRef, paymentNotice, WOMPI_STATE } from "./billing"

const H = "12345678-1234-4123-8123-123456789abc"

describe("referencia de Mercado Pago", () => {
  it("ida y vuelta con y sin cupón", () => {
    expect(parseMpRef(mpRef(H, "anio"))).toEqual({ householdId: H, periodo: "anio", plan: "premium", cupon: null })
    expect(parseMpRef(mpRef(H, "mes", "familia", "MITAD"))).toEqual({ householdId: H, periodo: "mes", plan: "familia", cupon: "MITAD" })
    expect(parseMpRef("otra-app:123")).toBeNull()
    expect(parseMpRef(null)).toBeNull()
  })
  it("estados de las pasarelas", () => {
    expect(["approved", "rejected", "cancelled", "refunded", "charged_back", "in_process"].map(mpPayState)).toEqual(["aprobado", "rechazado", "rechazado", "reembolsado", "reembolsado", "pendiente"])
    expect(WOMPI_STATE.VOIDED).toBe("anulado")
  })
})

describe("aviso a los dueños después de aplicar un pago (mismos textos que la web)", () => {
  const base = { proveedor: "wompi", referencia: "r1", monto: 14900 }
  it("primera aprobación", () => {
    const n = paymentNotice({ first_approval: true, revoked: false, vence_at: "2026-12-02T12:00:00Z", estado: "aprobado", prev_estado: null }, { ...base, planNombre: "Premium" })
    expect(n).toEqual({ titulo: "¡Bienvenido a Mirai Premium!", cuerpo: "Recibimos tu pago de $14.900. Tu plan está activo hasta el 2 de diciembre de 2026.", dedupe: "pay-ok-wompi-r1" })
  })
  it("reembolso con y sin tiempo restante, rechazo y repetido", () => {
    const now = new Date("2026-11-02T00:00:00Z")
    expect(paymentNotice({ first_approval: false, revoked: true, vence_at: "2026-11-20T00:00:00Z", estado: "reembolsado", prev_estado: "aprobado" }, base, now)?.cuerpo).toMatch(/^Quitamos ese periodo de tu plan: ahora está activo hasta el/)
    expect(paymentNotice({ first_approval: false, revoked: true, vence_at: "2026-10-01T00:00:00Z", estado: "anulado", prev_estado: "aprobado" }, base, now)?.titulo).toBe("Tu pago se anuló")
    expect(paymentNotice({ first_approval: false, revoked: false, vence_at: null, estado: "rechazado", prev_estado: "pendiente" }, base)?.dedupe).toBe("pay-ko-wompi-r1")
    expect(paymentNotice({ first_approval: false, revoked: false, vence_at: null, estado: "aprobado", prev_estado: "aprobado" }, base)).toBeNull()
  })
})
