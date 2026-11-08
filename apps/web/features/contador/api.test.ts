import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const h = vi.hoisted(() => ({ open: vi.fn() }))

vi.mock("@/lib/api/server", () => ({ publicServerApi: () => ({ accountantPortal: { open: h.open } }) }))

const { contadorOpen } = await import("./api")

beforeEach(() => vi.clearAllMocks())

describe("portal del contador por la API", () => {
  it("abre por la API; 404/429 = null", async () => {
    h.open.mockResolvedValueOnce({ status: 200, body: { share: { id: "s" }, data: {} }, headers: new Headers() })
    expect(await contadorOpen("tok")).toEqual({ share: { id: "s" }, data: {} })
    h.open.mockResolvedValueOnce({ status: 404, body: { ok: false, msg: "No", code: "NOT_FOUND" }, headers: new Headers() })
    expect(await contadorOpen("tok")).toBeNull()
    h.open.mockResolvedValueOnce({ status: 429, body: { ok: false, msg: "Espera", code: "RATE_LIMITED" }, headers: new Headers() })
    expect(await contadorOpen("tok")).toBeNull()
  })

  it("si la API no responde (red o 5xx): null, el portal muestra que no está disponible", async () => {
    h.open.mockResolvedValueOnce({ status: 502, body: undefined, headers: new Headers() })
    expect(await contadorOpen("tok")).toBeNull()
    h.open.mockRejectedValueOnce(new Error("red"))
    expect(await contadorOpen("tok")).toBeNull()
  })
})
