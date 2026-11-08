import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ aiAdmin: { usage: vi.fn(), clearCache: vi.fn(), setPlanCupo: vi.fn() } }))
vi.mock("@/lib/api/client", async () => ({ browserApi: () => api, ...(await import("@/lib/api/unwrap")) }))

import { adminAiUsage, adminClearAiCache, adminSetPlanAiCupo } from "./ia-api"

const ok = (data: unknown) => ({ status: 200, body: { ok: true, data }, headers: new Headers() })

describe("features/admin/ia-api", () => {
  beforeEach(() => { vi.clearAllMocks() })
  it("/v1/admin/ai/*; errores lanzados", async () => {
    api.aiAdmin.usage.mockResolvedValueOnce({ status: 200, body: { fuente: "api" }, headers: new Headers() })
    expect(await adminAiUsage(7)).toEqual({ fuente: "api" })
    expect(api.aiAdmin.usage.mock.calls[0][0]).toEqual({ query: { dias: 7 } })
    api.aiAdmin.clearCache.mockResolvedValueOnce(ok({ borradas: 5 }))
    expect(await adminClearAiCache()).toBe(5)
    api.aiAdmin.setPlanCupo.mockResolvedValueOnce({ status: 403, body: { ok: false, msg: "Solo el administrador de Mirai puede ver esto.", code: "ROLE_DENIED" }, headers: new Headers() })
    await expect(adminSetPlanAiCupo("premium", 10)).rejects.toThrow("Solo el administrador de Mirai")
  })
})
