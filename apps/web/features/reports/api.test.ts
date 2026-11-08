import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ ai: { monthSummary: vi.fn() } }))
vi.mock("@/lib/api/session", () => ({ activeBookId: () => "b" }))
vi.mock("@/lib/api/client", async () => ({ browserApi: () => api, ...(await import("@/lib/api/unwrap")) }))

import { generateMonthSummary } from "./api"

describe("features/reports/api", () => {
  beforeEach(() => { vi.clearAllMocks() })
  it("la API; los errores se lanzan con el mensaje en español", async () => {
    api.ai.monthSummary.mockResolvedValueOnce({ status: 200, body: { ok: true, data: { titular: "api" } }, headers: new Headers() })
    expect(await generateMonthSummary("2026-10")).toEqual({ titular: "api" })
    expect(api.ai.monthSummary.mock.calls[0][0].params).toEqual({ bookId: "b", mes: "2026-10" })
    api.ai.monthSummary.mockResolvedValueOnce({ status: 403, body: { ok: false, msg: "Tu rol no permite…", code: "ROLE_DENIED" }, headers: new Headers() })
    await expect(generateMonthSummary("2026-10")).rejects.toThrow("Tu rol no permite…")
    await expect(generateMonthSummary("10-2026")).rejects.toThrow("Mes inválido")
  })
})
