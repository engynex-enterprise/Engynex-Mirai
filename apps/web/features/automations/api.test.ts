import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  api: {
    defaults: vi.fn(async () => ({ status: 200, body: { ok: true, data: { creadas: 3 } }, headers: new Headers() })),
    drain: vi.fn(async () => ({ status: 502, body: { ok: false, code: "UPSTREAM", msg: "No pudimos revisar" }, headers: new Headers() })),
    test: vi.fn(async () => ({ status: 400, body: { ok: false, code: "VALIDATION", msg: "Agrega un disparador para poder probar.", details: { issues: [{ msg: "Falta el disparador" }] } }, headers: new Headers() })),
    runs: vi.fn(async () => ({ status: 200, body: [{ id: "r1" }], headers: new Headers() })),
  },
}))

vi.mock("@/lib/api/session", () => ({ activeBookId: () => "b1" }))
vi.mock("@/lib/api/client", async () => {
  const u = await import("@/lib/api/unwrap")
  return { browserApi: () => ({ automations: h.api }), unwrap: u.unwrap, unwrapData: u.unwrapData }
})

const api = await import("./api")
const graph = { nodes: [], edges: [] } as never

beforeEach(() => { vi.clearAllMocks() })

describe("automatizaciones por la API", () => {
  it("plantillas, drain (nunca lanza), probar con los pendientes del error y ejecuciones", async () => {
    expect(await api.ensureDefaultAutomations()).toEqual({ ok: true, creadas: 3 })
    expect(await api.runPendingAutomations()).toEqual({ ok: false, n: 0 })
    expect(await api.testAutomation({ id: "a1", graph })).toEqual({ ok: false, msg: "Agrega un disparador para poder probar.", steps: [], issues: [{ msg: "Falta el disparador" }] })
    expect(h.api.test).toHaveBeenCalledWith({ params: { bookId: "b1", id: "a1" }, body: { graph, monto: null, descripcion: null } })
    expect(await api.loadRuns("b1", "a1", 30)).toEqual([{ id: "r1" }])
    expect(h.api.runs).toHaveBeenCalledWith({ params: { bookId: "b1" }, query: { limit: 30, automationId: "a1" } })
  })
})
