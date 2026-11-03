import { beforeEach, describe, expect, it, vi } from "vitest"

const on = { v: false }
const actions = { saveIntegration: vi.fn(async () => undefined), toggleIntegration: vi.fn(), deleteIntegration: vi.fn(), testIntegration: vi.fn(), listModels: vi.fn() }
const integrations = { save: vi.fn() }
const ai = { integrationTest: vi.fn(), integrationModels: vi.fn() }
const status = (s: number, body: unknown) => ({ status: s, body, headers: new Headers() })

vi.mock("./actions", () => actions)
vi.mock("@/lib/api/session", () => ({ apiOn: (m: string) => m === "integrations" && on.v, activeBookId: () => "book-1" }))
vi.mock("@/lib/api/client", async () => ({ ...(await import("@/lib/api/unwrap")), browserApi: () => ({ integrations, ai }) }))

const api = await import("./api")

beforeEach(() => { vi.clearAllMocks(); on.v = false })

describe("features/integrations/api", () => {
  it("apagado: la Server Action", async () => {
    await api.saveIntegration("openai", { apiKey: "x" })
    expect(actions.saveIntegration).toHaveBeenCalledWith("openai", { apiKey: "x" })
    expect(integrations.save).not.toHaveBeenCalled()
  })

  it("encendido: PUT con enabled por defecto; un error lanza el mensaje de la API", async () => {
    on.v = true
    integrations.save.mockResolvedValue(status(200, { ok: true, data: { kind: "openai" } }))
    await api.saveIntegration("openai", { apiKey: "x" })
    expect(integrations.save).toHaveBeenCalledWith({ params: { bookId: "book-1", kind: "openai" }, body: { values: { apiKey: "x" }, enabled: true } })
    integrations.save.mockResolvedValue(status(403, { ok: false, code: "ROLE_DENIED", msg: "Tu rol no permite cambiar las integraciones." }))
    await expect(api.saveIntegration("openai", {})).rejects.toThrow("Tu rol no permite cambiar las integraciones.")
  })

  it("encendido: probar y modelos conservan la forma { ok, msg } / { ok, models }", async () => {
    on.v = true
    ai.integrationTest.mockResolvedValue(status(200, { ok: true, data: { ok: false, msg: "Clave inválida" } }))
    expect(await api.testIntegration("openai")).toEqual({ ok: false, msg: "Clave inválida" })
    ai.integrationModels.mockResolvedValue(status(200, { ok: true, data: { models: [{ value: "m", label: "M" }], rec: "m" } }))
    expect(await api.listModels("openai")).toEqual({ ok: true, models: [{ value: "m", label: "M" }], rec: "m" })
    ai.integrationModels.mockResolvedValue(status(400, { ok: false, code: "VALIDATION", msg: "Este proveedor no tiene lista de modelos." }))
    expect(await api.listModels("x")).toEqual({ ok: false, models: [], msg: "Este proveedor no tiene lista de modelos." })
  })
})
