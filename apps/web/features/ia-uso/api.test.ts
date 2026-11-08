import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ ai: { usage: vi.fn() } }))
vi.mock("@/lib/api/session", () => ({ activeBookId: () => "b" }))
vi.mock("@/lib/api/client", async () => ({ browserApi: () => api, ...(await import("@/lib/api/unwrap")) }))

import { myAiUsage } from "./api"

describe("features/ia-uso/api", () => {
  beforeEach(() => { vi.clearAllMocks() })
  it("GET /v1/books/:b/ai/usage; los errores se lanzan", async () => {
    api.ai.usage.mockResolvedValueOnce({ status: 200, body: { fuente: "api" }, headers: new Headers() })
    expect(await myAiUsage()).toEqual({ fuente: "api" })
    expect(api.ai.usage.mock.calls[0][0]).toEqual({ params: { bookId: "b" } })
    api.ai.usage.mockResolvedValueOnce({ status: 500, body: null, headers: new Headers() })
    await expect(myAiUsage()).rejects.toThrow("Algo salió mal de nuestro lado")
  })
})
