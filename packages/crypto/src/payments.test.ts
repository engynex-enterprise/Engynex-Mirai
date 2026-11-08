import { createHash, createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { mercadoPagoVerify, wompiIntegrity, wompiVerifyEvent } from "./payments"

describe("Wompi", () => {
  it("firma de integridad: SHA-256 de referencia + centavos + moneda + secreto", () => {
    // Ejemplo de la documentación de Wompi (widget y checkout web).
    const sig = wompiIntegrity("sk8-438k4-xmxm392-sn2m", 2490000, "COP", "prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6") // secretos:ok: llave de ejemplo pública de la documentación de Wompi
    expect(sig).toBe(createHash("sha256").update("sk8-438k4-xmxm392-sn2m2490000COPprod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6").digest("hex"))
    expect(sig).toMatch(/^[a-f0-9]{64}$/)
  })

  it("evento: valida el checksum y rechaza si cambian el monto", () => {
    const secret = "test_events_secret"
    const data = { transaction: { id: "1234-1610641025-49201", status: "APPROVED", amount_in_cents: 14900_00, reference: "mirai-x" } }
    const timestamp = 1530291411
    const checksum = createHash("sha256").update(`1234-1610641025-49201APPROVED1490000${timestamp}${secret}`).digest("hex").toUpperCase()
    const body = { event: "transaction.updated", data, signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum }, timestamp }
    expect(wompiVerifyEvent(body, secret)).toBe(true)
    expect(wompiVerifyEvent({ ...body, data: { transaction: { ...data.transaction, amount_in_cents: 100 } } }, secret)).toBe(false)
    expect(wompiVerifyEvent(body, "otro")).toBe(false)
    expect(wompiVerifyEvent({ data }, secret)).toBe(false)
  })
})

describe("Mercado Pago", () => {
  const secret = "mp_webhook_secret"
  const sign = (manifest: string) => createHmac("sha256", secret).update(manifest).digest("hex")
  it("valida x-signature con id, request-id y ts", () => {
    const v1 = sign("id:123456;request-id:abc-req;ts:1704908010;")
    expect(mercadoPagoVerify({ xSignature: `ts=1704908010,v1=${v1}`, xRequestId: "abc-req", dataId: "123456", secret })).toBe(true)
  })
  it("el id alfanumérico se compara en minúsculas", () => {
    const v1 = sign("id:2c9380848a1b2c3d;request-id:r1;ts:1;")
    expect(mercadoPagoVerify({ xSignature: `ts=1, v1=${v1}`, xRequestId: "r1", dataId: "2C9380848A1B2C3D", secret })).toBe(true)
  })
  it("rechaza firmas alteradas o incompletas", () => {
    const v1 = sign("id:1;request-id:r;ts:1;")
    expect(mercadoPagoVerify({ xSignature: `ts=1,v1=${v1}`, xRequestId: "r", dataId: "2", secret })).toBe(false)
    expect(mercadoPagoVerify({ xSignature: "ts=1", xRequestId: "r", dataId: "1", secret })).toBe(false)
    expect(mercadoPagoVerify({ xSignature: null, xRequestId: "r", dataId: "1", secret })).toBe(false)
  })
})
