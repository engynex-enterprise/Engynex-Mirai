import { beforeEach, describe, expect, it, vi } from "vitest"

const s = vi.hoisted(() => ({ on: false }))
const actions = vi.hoisted(() => ({
  adminAiUsage: vi.fn(async () => ({ fuente: "acción" })), adminSaveAiSettings: vi.fn(), adminSetPlanAiCupo: vi.fn(), adminSetModelPrice: vi.fn(), adminClearAiCache: vi.fn(async () => 3),
}))
const api = vi.hoisted(() => ({ aiAdmin: { usage: vi.fn(), clearCache: vi.fn(), setPlanCupo: vi.fn() } }))
vi.mock("./ia-server", () => actions)
vi.mock("@/lib/api/session", () => ({ apiOn: (m: string) => s.on && m === "admin" }))
vi.mock("@/lib/api/client", async () => ({ browserApi: () => api, ...(await import("@/lib/api/unwrap")) }))

import { adminAiUsage, adminClearAiCache, adminSetPlanAiCupo } from "./ia-api"

const ok = (data: unknown) => ({ status: 200, body: { ok: true, data }, headers: new Headers() })

describe("features/admin/ia-api (interruptor admin)", () => {
  beforeEach(() => { vi.clearAllMocks(); s.on = false })
  it("apagado: las Server Actions de siempre", async () => {
    expect(await adminAiUsage(7)).toEqual({ fuente: "acción" })
    expect(await adminClearAiCache()).toBe(3)
    expect(api.aiAdmin.usage).not.toHaveBeenCalled()
  })
  it("encendido: /v1/admin/ai/* con la misma forma; errores lanzados", async () => {
    s.on = true
    api.aiAdmin.usage.mockResolvedValueOnce({ status: 200, body: { fuente: "api" }, headers: new Headers() })
    expect(await adminAiUsage(7)).toEqual({ fuente: "api" })
    expect(api.aiAdmin.usage.mock.calls[0][0]).toEqual({ query: { dias: 7 } })
    api.aiAdmin.clearCache.mockResolvedValueOnce(ok({ borradas: 5 }))
    expect(await adminClearAiCache()).toBe(5)
    api.aiAdmin.setPlanCupo.mockResolvedValueOnce({ status: 403, body: { ok: false, msg: "Solo el administrador de Mirai puede ver esto.", code: "ROLE_DENIED" }, headers: new Headers() })
    await expect(adminSetPlanAiCupo("premium", 10)).rejects.toThrow("Solo el administrador de Mirai")
    expect(actions.adminAiUsage).toHaveBeenCalledTimes(0)
  })
})
