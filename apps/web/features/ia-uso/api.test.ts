import { beforeEach, describe, expect, it, vi } from "vitest"

const s = vi.hoisted(() => ({ on: false }))
const actions = vi.hoisted(() => ({ myAiUsage: vi.fn(async () => ({ fuente: "acción" })) }))
const api = vi.hoisted(() => ({ ai: { usage: vi.fn() } }))
vi.mock("./actions", () => actions)
vi.mock("@/lib/api/session", () => ({ apiOn: (m: string) => s.on && m === "ai", activeBookId: () => "b" }))
vi.mock("@/lib/api/client", async () => ({ browserApi: () => api, ...(await import("@/lib/api/unwrap")) }))

import { myAiUsage } from "./api"

describe("features/ia-uso/api (interruptor ai)", () => {
  beforeEach(() => { vi.clearAllMocks(); s.on = false })
  it("apagado: la acción; encendido: GET /v1/books/:b/ai/usage", async () => {
    expect(await myAiUsage()).toEqual({ fuente: "acción" })
    s.on = true
    api.ai.usage.mockResolvedValueOnce({ status: 200, body: { fuente: "api" }, headers: new Headers() })
    expect(await myAiUsage()).toEqual({ fuente: "api" })
    api.ai.usage.mockResolvedValueOnce({ status: 500, body: null, headers: new Headers() })
    await expect(myAiUsage()).rejects.toThrow("Algo salió mal de nuestro lado")
    expect(actions.myAiUsage).toHaveBeenCalledTimes(1)
  })
})
