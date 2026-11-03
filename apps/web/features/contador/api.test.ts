import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const h = vi.hoisted(() => ({
  cfg: null as null | { url: string; flags: Record<string, boolean> },
  open: vi.fn(),
  action: vi.fn(async () => ({ bloqueado: "plan" as const })),
  admin: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: h.admin }))
vi.mock("@/lib/api/rollout", () => ({ globalApiOn: vi.fn(async () => h.cfg) }))
vi.mock("@/lib/api/server", () => ({ publicServerApi: () => ({ accountantPortal: { open: h.open } }) }))
vi.mock("./actions", () => ({ contadorOpen: h.action }))

const { contadorOpen } = await import("./api")

beforeEach(() => {
  vi.clearAllMocks()
  h.cfg = null
})

describe("portal del contador por la API (interruptor accountant, solo \"on\")", () => {
  it("apagado: la Server Action de siempre", async () => {
    expect(await contadorOpen("tok")).toEqual({ bloqueado: "plan" })
    expect(h.action).toHaveBeenCalledWith("tok")
    expect(h.open).not.toHaveBeenCalled()
  })

  it("encendido: abre por la API; 404/429 = null como la acción", async () => {
    h.cfg = { url: "https://api.test", flags: { accountant: true } }
    h.open.mockResolvedValueOnce({ status: 200, body: { share: { id: "s" }, data: {} }, headers: new Headers() })
    expect(await contadorOpen("tok")).toEqual({ share: { id: "s" }, data: {} })
    h.open.mockResolvedValueOnce({ status: 404, body: { ok: false, msg: "No", code: "NOT_FOUND" }, headers: new Headers() })
    expect(await contadorOpen("tok")).toBeNull()
    h.open.mockResolvedValueOnce({ status: 429, body: { ok: false, msg: "Espera", code: "RATE_LIMITED" }, headers: new Headers() })
    expect(await contadorOpen("tok")).toBeNull()
    expect(h.action).not.toHaveBeenCalled()
  })

  it("encendido: si la API no responde (red o 5xx) lee con lo de siempre", async () => {
    h.cfg = { url: "https://api.test", flags: { accountant: true } }
    h.open.mockResolvedValueOnce({ status: 502, body: undefined, headers: new Headers() })
    expect(await contadorOpen("tok")).toEqual({ bloqueado: "plan" })
    h.open.mockRejectedValueOnce(new Error("red"))
    expect(await contadorOpen("tok")).toEqual({ bloqueado: "plan" })
    expect(h.action).toHaveBeenCalledTimes(2)
  })
})
