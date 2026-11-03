import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ on: false }))
const api = vi.hoisted(() => ({ billing: { checkout: vi.fn(), renewal: vi.fn() } }))

vi.mock("./actions", () => ({
  startCheckout: vi.fn(async () => ({ ok: true, url: "accion" })),
  paysRenewal: vi.fn(async () => false),
  paymentOptions: vi.fn(async () => undefined),
  previewCoupon: vi.fn(async () => undefined),
  cancelRenewal: vi.fn(async () => undefined),
}))
vi.mock("@/lib/api/session", () => ({ apiOn: () => state.on, activeHouseholdId: () => "h1" }))
vi.mock("@/lib/api/client", async () => ({ browserApi: () => api, ...(await import("@/lib/api/unwrap")) }))

const res = (status: number, body: unknown) => ({ status, body, headers: new Headers() })

describe("features/planes/api", () => {
  beforeEach(() => { vi.clearAllMocks(); state.on = false })

  it("apagado llama a la Server Action de siempre", async () => {
    const actions = await import("./actions")
    const { startCheckout } = await import("./api")
    expect(await startCheckout("wompi", "mes")).toEqual({ ok: true, url: "accion" })
    expect(actions.startCheckout).toHaveBeenCalledWith("wompi", "mes")
  })

  it("encendido: checkout por la API; pasarela caída = { ok:false, msg }; rol = lanza", async () => {
    state.on = true
    const { startCheckout, paysRenewal } = await import("./api")
    api.billing.checkout.mockResolvedValue(res(200, { ok: true, data: { url: "https://pago" } }))
    expect(await startCheckout("wompi", "anio", "premium", "CUPON")).toEqual({ ok: true, url: "https://pago" })
    expect(api.billing.checkout).toHaveBeenCalledWith({ params: { householdId: "h1" }, body: { proveedor: "wompi", periodo: "anio", plan: "premium", cupon: "CUPON" } })
    api.billing.checkout.mockResolvedValue(res(502, { ok: false, code: "UPSTREAM", msg: "No disponible" }))
    expect(await startCheckout("wompi", "mes")).toEqual({ ok: false, msg: "No disponible" })
    api.billing.checkout.mockResolvedValue(res(403, { ok: false, code: "ROLE_DENIED", msg: "Solo el dueño" }))
    await expect(startCheckout("wompi", "mes")).rejects.toThrow("Solo el dueño")
    api.billing.renewal.mockResolvedValue(res(200, { paga: true }))
    expect(await paysRenewal()).toBe(true)
  })
})
