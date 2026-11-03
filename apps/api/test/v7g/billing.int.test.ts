// V7-G (grupo D): GET /v1/plans (sin sesión) y GET /v1/households/:householdId/subscription («Mi plan») con la app
// real y RowStore en memoria: filtros y orden de los planes públicos, alcances (SystemScope solo en lo público, la RLS de
// la persona en el hogar), pagos solo para el dueño y 404 sin revelar hogares ajenos.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { H_GRATIS, H_PREMIUM } from "../setup/fixtures"
import { createV7gApp, type V7gApp } from "./app"

let t: V7gApp
const plan = (id: string, o: Record<string, unknown> = {}) => ({
  id, nombre: id[0].toUpperCase() + id.slice(1), descripcion: "", precio_mes: 0, precio_anio: 0, funciones: [], anuncios: false, limites: {}, activo: true, publico: true, destacado: false, orden: 1, ia_creditos: null, ...o,
})

beforeAll(async () => {
  t = await createV7gApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.fx.rows.reset()
  t.fx.rows.seed("plans", [
    plan("premium", { precio_mes: 14900, precio_anio: 149000, funciones: ["ia", "banco"], orden: 2, destacado: true, limites: { libros: 5, personas: 8, raro: "x" } }),
    plan("gratis", { anuncios: true, orden: 1, limites: { libros: 1, personas: 2 } }),
    plan("familia", { precio_mes: 9900, orden: 2 }),
    plan("oculto", { publico: false }),
    plan("viejo", { activo: false }),
  ])
})

describe("GET /v1/plans", () => {
  it("sin sesión: solo los públicos y activos, en orden (orden y precio), con límites limpios", async () => {
    const r = await t.call("GET", "/v1/plans", null)
    expect(r.status).toBe(200)
    expect((r.body as unknown as { id: string }[]).map((p) => p.id)).toEqual(["gratis", "familia", "premium"])
    expect((r.body as unknown as Record<string, unknown>[])[2]).toEqual({ id: "premium", nombre: "Premium", descripcion: "", precio_mes: 14900, precio_anio: 149000, funciones: ["ia", "banco"], anuncios: false, limites: { libros: 5, personas: 8 }, destacado: true, orden: 2 })
    expect(t.fx.rows.scopesOf("plans")).toEqual(["system"])
  })
})

describe("GET /v1/households/:householdId/subscription", () => {
  beforeEach(() => {
    t.fx.rows.rpcImpl.household_subscription = (a) => (a.h === H_PREMIUM ? [{ id: "s-1", plan: "premium", periodo: "mes", estado: "activa", proveedor: "mercadopago", vence_at: "2026-12-01T00:00:00Z" }] : [])
    t.fx.rows.seed("plan_payments", [
      { id: "p-1", household_id: H_PREMIUM, proveedor: "mercadopago", referencia: "r1", periodo: "mes", monto: "14900", estado: "aprobado", metodo: "tarjeta", paid_at: "2026-11-01T00:00:00Z", created_at: "2026-11-01T00:00:00Z", factura_ref: null, plan: "premium" },
      { id: "p-2", household_id: H_PREMIUM, proveedor: "wompi", referencia: "r2", periodo: "mes", monto: 14900, estado: "pendiente", metodo: null, paid_at: null, created_at: "2026-11-02T00:00:00Z", factura_ref: null, plan: "premium" },
      { id: "p-3", household_id: H_GRATIS, proveedor: "wompi", referencia: "r3", periodo: "anio", monto: 149000, estado: "rechazado", metodo: "nequi", paid_at: null, created_at: "2026-10-01T00:00:00Z", factura_ref: null, plan: "premium" },
    ])
  })

  it("el dueño ve la suscripción vigente y sus pagos (sin los pendientes ni los de otro hogar), con su sesión", async () => {
    const r = await t.call("GET", `/v1/households/${H_PREMIUM}/subscription`, "owner")
    expect(r.status).toBe(200)
    expect(r.body).toEqual({
      sub: { id: "s-1", plan: "premium", periodo: "mes", estado: "activa", proveedor: "mercadopago", vence_at: "2026-12-01T00:00:00Z" },
      pagos: [{ id: "p-1", proveedor: "mercadopago", referencia: "r1", periodo: "mes", monto: 14900, estado: "aprobado", metodo: "tarjeta", paid_at: "2026-11-01T00:00:00Z", created_at: "2026-11-01T00:00:00Z", factura_ref: null, plan: "premium" }],
    })
    expect(t.fx.rows.rpcs).toMatchObject([{ fn: "household_subscription", args: { h: H_PREMIUM }, scope: { kind: "user" } }])
    expect(t.fx.rows.scopesOf("plan_payments")).toEqual(["user"])
  })

  it("cualquier integrante ve la suscripción; los pagos solo el dueño", async () => {
    for (const role of ["viewer", "editor", "admin"] as const) {
      const r = await t.call("GET", `/v1/households/${H_GRATIS}/subscription`, role)
      expect(r.status, role).toBe(200)
      expect(r.body).toEqual({ sub: null, pagos: null })
    }
    expect(t.fx.rows.scopesOf("plan_payments")).toEqual([])
  })

  it("hogar ajeno: 404 sin revelar que existe; sin sesión: 401", async () => {
    const r = await t.call("GET", `/v1/households/${H_PREMIUM}/subscription`, "editor")
    expect(r.status).toBe(404)
    expect(r.body).toMatchObject({ ok: false, code: "NOT_FOUND", msg: "No encontramos ese hogar." })
    expect(t.fx.rows.rpcs).toEqual([])
    expect((await t.call("GET", `/v1/households/${H_PREMIUM}/subscription`, null)).status).toBe(401)
  })
})
