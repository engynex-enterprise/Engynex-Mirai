import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  feedback: {
    send: vi.fn(async () => ({ status: 200, body: { ok: true, data: { id: "fb-api" } }, headers: new Headers() })),
    mine: vi.fn(async () => ({ status: 200, body: [{ id: "f1" }], headers: new Headers() })),
    remove: vi.fn(async () => ({ status: 409, body: { ok: false, code: "CONFLICT", msg: "Ya la revisamos: no se puede borrar." }, headers: new Headers() })),
  },
  upload: vi.fn(async () => ({ key: "u1/captura.png" })),
}))

vi.mock("@/lib/files/upload", () => ({ uploadFile: h.upload }))
vi.mock("@/lib/api/client", async () => {
  const u = await import("@/lib/api/unwrap")
  return { browserApi: () => ({ feedback: h.feedback }), unwrap: u.unwrap, unwrapData: u.unwrapData }
})

const api = await import("./api")
const NEW = { tipo: "error", mensaje: "No guarda", household_id: "00000000-0000-4000-8000-000000000001", pagina: "/gastos", contexto: { version: "5" } }

beforeEach(() => { vi.clearAllMocks() })

describe("opiniones por la API", () => {
  it("POST /v1/feedback con householdId, mis opiniones y el 409 con su mensaje", async () => {
    expect(await api.sendFeedback(NEW)).toBe("fb-api")
    expect(h.feedback.send).toHaveBeenCalledWith({ body: { tipo: "error", rating: null, mensaje: "No guarda", captura: null, householdId: NEW.household_id, pagina: "/gastos", contexto: { version: "5" } } })
    expect(await api.loadMyFeedback()).toEqual([{ id: "f1" }])
    await expect(api.deleteFeedback("f1")).rejects.toThrow("Ya la revisamos: no se puede borrar.")
  })

  it("la captura sube al bucket feedback y devuelve su ruta", async () => {
    const file = new File(["x"], "captura.png", { type: "image/png" })
    expect(await api.uploadCaptura(file)).toBe("u1/captura.png")
    expect(h.upload).toHaveBeenCalledWith({ bucket: "feedback", body: file, name: "captura.png" })
  })
})
