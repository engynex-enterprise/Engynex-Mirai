// F2-I-3: comandos del plan y webhooks firmados de Mercado Pago y Wompi. Sin cobros ni llamadas reales: la pasarela
// es un doble (FakeMercadoPago) y apply_plan_payment se imita con su misma regla (idempotente por referencia).
import { createHash, createHmac } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { mpRef } from "@mirai/domain/billing"
import { H_GRATIS, H_PREMIUM, USERS } from "../setup/fixtures"
import { userToken } from "../setup/tokens"
import { BILLING, createF2iApp, SITE, type F2iApp } from "./app"

let t: F2iApp
const auth = async (who: keyof typeof USERS) => ({ authorization: `Bearer ${await userToken(USERS[who])}` })
const post = async (url: string, payload: unknown, headers: Record<string, string> = {}) => t.app.inject({ method: "POST", url, payload: payload as object, headers })

beforeAll(async () => {
  t = await createF2iApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.fx.billing.subs = []
  t.fx.billing.pending = []
  t.fx.billing.payments.clear()
  t.fx.billing.extensions = []
  t.fx.billing.notified.clear()
  t.fx.billing.calls = []
  t.fx.mp.created = []
  t.fx.mp.canceled = []
})

describe("checkout, cupón y renovación", () => {
  it("pasarelas disponibles en el despliegue", async () => {
    const r = await t.app.inject({ method: "GET", url: "/v1/billing/payment-options", headers: await auth("viewer") })
    expect(r.json()).toEqual({ mercadopago: true, wompi: true })
  })

  it("solo el dueño paga el plan (los demás: 403; alguien de afuera: 404)", async () => {
    for (const who of ["admin", "editor", "registra", "viewer"] as const) {
      const r = await post(`/v1/households/${H_GRATIS}/checkout`, { proveedor: "wompi", periodo: "mes" }, await auth(who))
      expect(r.statusCode, who).toBe(403)
      expect(r.json().msg).toBe("Solo el dueño del hogar puede cambiar o pagar el plan.")
    }
    expect((await post(`/v1/households/${H_GRATIS}/checkout`, { proveedor: "wompi", periodo: "mes" }, await auth("outsider"))).statusCode).toBe(404)
  })

  it("Wompi: guarda la referencia y el monto ANTES de pagar y firma la integridad", async () => {
    const r = await post(`/v1/households/${H_GRATIS}/checkout`, { proveedor: "wompi", periodo: "anio", cupon: "mitad" }, await auth("owner"))
    expect(r.statusCode).toBe(200)
    const url = new URL(r.json().data.url)
    expect(url.origin + url.pathname).toBe("https://checkout.wompi.co/p/")
    const ref = url.searchParams.get("reference")!
    expect(t.fx.billing.pending[0]).toMatchObject({ household_id: H_GRATIS, referencia: ref, periodo: "anio", plan: "premium", cupon: "MITAD", monto: 74500 })
    expect(url.searchParams.get("amount-in-cents")).toBe("7450000")
    expect(url.searchParams.get("signature:integrity")).toBe(createHash("sha256").update(`${ref}7450000COP${BILLING.wompiIntegritySecret}`).digest("hex"))
    expect(url.searchParams.get("redirect-url")).toBe(`${SITE}/ajustes?tab=plan&pago=wompi`)
  })

  it("Mercado Pago: crea la suscripción pendiente; la misma Idempotency-Key no crea otra", async () => {
    const h = { ...(await auth("owner")), "idempotency-key": "checkout-mp-0001" }
    const a = await post(`/v1/households/${H_PREMIUM}/checkout`, { proveedor: "mercadopago", periodo: "mes" }, h)
    const b = await post(`/v1/households/${H_PREMIUM}/checkout`, { proveedor: "mercadopago", periodo: "mes" }, h)
    expect(a.json()).toEqual(b.json())
    expect(b.headers["idempotent-replayed"]).toBe("true")
    expect(t.fx.mp.created).toHaveLength(1)
    expect(t.fx.mp.created[0]).toMatchObject({ externalReference: mpRef(H_PREMIUM, "mes", "premium"), amount: 14900, months: 1, payerEmail: "owner@correo.co" })
    expect(t.fx.billing.subs[0]).toMatchObject({ household_id: H_PREMIUM, estado: "pendiente", created_by: USERS.owner })
  })

  it("cupón: precio final y errores en español", async () => {
    const ok = await post(`/v1/households/${H_GRATIS}/coupons/preview`, { code: "mitad", plan: "premium", periodo: "mes" }, await auth("owner"))
    expect(ok.json().data).toEqual({ monto: 7450, msg: "Cupón aplicado: pagas $7.450 en vez de $14.900 cada mes." })
    const no = await post(`/v1/households/${H_GRATIS}/coupons/preview`, { code: "NOEXISTE", plan: "premium", periodo: "mes" }, await auth("owner"))
    expect(no.statusCode).toBe(400)
  })

  it("renovación: quién la paga y cancelarla (el dueño cancela todas; los demás, la suya)", async () => {
    t.fx.billing.subs.push({ id: "a", household_id: H_GRATIS, proveedor: "mercadopago", estado: "activa", plan: "premium", periodo: "mes", proveedor_ref: "pre-a", vence_at: "2026-12-10T00:00:00Z", created_by: USERS.owner })
    expect((await t.app.inject({ method: "GET", url: `/v1/households/${H_GRATIS}/renewal`, headers: await auth("owner") })).json()).toEqual({ paga: true })
    expect((await t.app.inject({ method: "DELETE", url: `/v1/households/${H_GRATIS}/renewal`, headers: await auth("editor") })).statusCode).toBe(404)
    const r = await t.app.inject({ method: "DELETE", url: `/v1/households/${H_GRATIS}/renewal`, headers: await auth("owner") })
    expect(r.json().data.msg).toMatch(/^Listo: no te cobraremos más\. Sigues con tu plan hasta el/)
    expect(t.fx.mp.canceled).toEqual(["pre-a"])
  })
})

// ── Webhooks ──────────────────────────────────────────────────────────────────────────────────────────────────

function wompiEvent(tx: Record<string, unknown>, secret = BILLING.wompiEventsSecret!) {
  const timestamp = 1730000000
  const props = ["transaction.id", "transaction.status", "transaction.amount_in_cents"]
  const plain = props.map((p) => String(tx[p.split(".")[1]])).join("") + timestamp + secret
  return JSON.stringify({ event: "transaction.updated", data: { transaction: tx }, timestamp, signature: { properties: props, checksum: createHash("sha256").update(plain).digest("hex").toUpperCase() } })
}
const wompi = (body: string) => t.app.inject({ method: "POST", url: "/v1/webhooks/wompi", payload: body, headers: { "content-type": "application/json" } })

describe("webhook de Wompi", () => {
  beforeEach(() => {
    t.fx.billing.pending.push({ household_id: H_GRATIS, referencia: "mirai-ref-1", periodo: "mes", plan: "premium", cupon: null, monto: 14900 })
  })

  it("sin sesión, con la firma sobre el cuerpo crudo; repetido 3 veces aplica (y avisa) UNA sola vez", async () => {
    const body = wompiEvent({ id: "tx-1", status: "APPROVED", reference: "mirai-ref-1", amount_in_cents: 1490000, payment_method_type: "NEQUI" })
    for (let i = 0; i < 3; i++) {
      const r = await wompi(body)
      expect(r.statusCode).toBe(200)
      expect(r.json()).toEqual({ ok: true })
    }
    expect(t.fx.billing.calls.filter((c) => c.m === "applyPlanPayment")).toHaveLength(3)
    expect(t.fx.billing.calls.every((c) => c.scope === "system")).toBe(true)
    expect(t.fx.billing.extensions).toEqual(["wompi:mirai-ref-1"])
    expect([...t.fx.billing.notified.values()]).toEqual([{ userIds: [USERS.owner], titulo: "¡Bienvenido a Mirai Premium!" }])
  })

  it("firma inválida o cuerpo alterado: 401 sin tocar nada", async () => {
    const body = wompiEvent({ id: "tx-1", status: "APPROVED", reference: "mirai-ref-1", amount_in_cents: 1490000 })
    const tampered = body.replace("1490000", "1490001")
    expect((await wompi(tampered)).statusCode).toBe(401)
    expect((await wompi(wompiEvent({ id: "tx-1", status: "APPROVED", reference: "mirai-ref-1", amount_in_cents: 1490000 }, "otro-secreto"))).statusCode).toBe(401)
    expect(t.fx.billing.calls).toHaveLength(0)
  })

  it("monto distinto al que generó Mirai: queda anulado (no extiende)", async () => {
    await wompi(wompiEvent({ id: "tx-2", status: "APPROVED", reference: "mirai-ref-1", amount_in_cents: 100 }))
    expect(t.fx.billing.payments.get("wompi:mirai-ref-1")?.estado).toBe("anulado")
    expect(t.fx.billing.extensions).toEqual([])
  })

  it("referencia ajena o evento distinto: 200 con `ignorado` (Wompi no reintenta)", async () => {
    expect((await wompi(wompiEvent({ id: "tx-3", status: "APPROVED", reference: "otra", amount_in_cents: 1 }))).json()).toEqual({ ok: true, ignorado: "referencia desconocida" })
  })
})

function mpHeaders(dataId: string, secret = BILLING.mercadopagoWebhookSecret!) {
  const ts = "1730000000"
  const rid = "req-abc-123"
  const v1 = createHmac("sha256", secret).update(`id:${dataId};request-id:${rid};ts:${ts};`).digest("hex")
  return { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": rid, "content-type": "application/json" }
}

describe("webhook de Mercado Pago", () => {
  it("pago de la suscripción: verifica x-signature, consulta la API y aplica una vez aunque llegue repetido", async () => {
    t.fx.mp.preapprovals.set("pre-9", { id: "pre-9", status: "authorized", external_reference: mpRef(H_GRATIS, "mes", "premium", "MITAD"), payer_email: "owner@correo.co" })
    t.fx.mp.authorized.set("555", { id: "555", preapproval_id: "pre-9", status: "processed", transaction_amount: 7450, payment: { id: 999, status: "approved" } })
    for (let i = 0; i < 3; i++) {
      const r = await post("/v1/webhooks/mercadopago?type=subscription_authorized_payment&data.id=555", { type: "subscription_authorized_payment", data: { id: "555" } }, mpHeaders("555"))
      expect(r.statusCode).toBe(200)
    }
    const applied = t.fx.billing.calls.filter((c) => c.m === "applyPlanPayment").map((c) => c.args[0])
    expect(applied[0]).toMatchObject({ householdId: H_GRATIS, proveedor: "mercadopago", referencia: "999", periodo: "mes", monto: 7450, estado: "aprobado", cupon: "MITAD", subscriptionRef: "pre-9" })
    expect(t.fx.billing.extensions).toEqual(["mercadopago:999"])
  })

  it("suscripción: crea o actualiza plan_subscriptions con el estado de la API", async () => {
    t.fx.mp.preapprovals.set("pre-10", { id: "pre-10", status: "cancelled", external_reference: mpRef(H_GRATIS, "anio") })
    await post("/v1/webhooks/mercadopago?type=preapproval&data.id=pre-10", { type: "preapproval", data: { id: "pre-10" } }, mpHeaders("pre-10"))
    expect(t.fx.billing.subs[0]).toMatchObject({ household_id: H_GRATIS, proveedor_ref: "pre-10", estado: "cancelada", periodo: "anio" })
  })

  it("firma inválida: 401; referencia ajena: 200 ignorado; falla de la pasarela: 500 (Mercado Pago reintenta)", async () => {
    expect((await post("/v1/webhooks/mercadopago?type=payment&data.id=1", { type: "payment", data: { id: "1" } }, mpHeaders("1", "secreto-falso"))).statusCode).toBe(401)
    t.fx.mp.pays.set("2", { id: 2, status: "approved", transaction_amount: 1, external_reference: "de-otra-app" })
    expect((await post("/v1/webhooks/mercadopago?type=payment&data.id=2", { type: "payment", data: { id: "2" } }, mpHeaders("2"))).json()).toEqual({ ok: true, ignorado: "referencia ajena" })
    const boom = await post("/v1/webhooks/mercadopago?type=payment&data.id=3", { type: "payment", data: { id: "3" } }, mpHeaders("3"))
    expect(boom.statusCode).toBe(500)
    expect(boom.json().msg).not.toMatch(/404/)
  })
})

describe("sin llaves de las pasarelas", () => {
  it("en producción la firma de Mercado Pago es obligatoria", async () => {
    const p = await createF2iApp({ billing: { mercadopagoWebhookSecret: undefined, production: true } })
    try {
      const r = await p.app.inject({ method: "POST", url: "/v1/webhooks/mercadopago?type=payment&data.id=1", payload: { data: { id: "1" } } })
      expect(r.statusCode).toBe(502)
      expect(p.fx.billing.calls).toHaveLength(0)
    } finally {
      await p.close()
    }
  })
})
