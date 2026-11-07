import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  on: false,
  feedback: {
    send: vi.fn(async () => ({ status: 200, body: { ok: true, data: { id: "fb-api" } }, headers: new Headers() })),
    mine: vi.fn(async () => ({ status: 200, body: [{ id: "f1" }], headers: new Headers() })),
    remove: vi.fn(async () => ({ status: 409, body: { ok: false, code: "CONFLICT", msg: "Ya la revisamos: no se puede borrar." }, headers: new Headers() })),
  },
  db: { insert: vi.fn(), select: vi.fn(), del: vi.fn() },
}))

vi.mock("@/lib/api/session", () => ({ apiOn: (m: string) => h.on && (m === "feedback" || m === "me") }))
vi.mock("@/lib/files/upload", () => ({ filesViaApi: () => false, uploadFile: vi.fn() }))
vi.mock("@/lib/api/client", async () => {
  const u = await import("@/lib/api/unwrap")
  return { browserApi: () => ({ feedback: h.feedback }), unwrap: u.unwrap, unwrapData: u.unwrapData }
})
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      insert: (row: unknown) => { h.db.insert(row); return { select: () => ({ single: async () => ({ data: { id: "fb-db" }, error: null }) }) } },
      select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: "db" }], error: null }) }) }),
      delete: () => ({ eq: async (_k: string, id: string) => { h.db.del(id); return { error: null } } }),
    }),
  }),
}))

const api = await import("./api")
const NEW = { tipo: "error", mensaje: "No guarda", household_id: "00000000-0000-4000-8000-000000000001", pagina: "/gastos", contexto: { version: "5" } }

beforeEach(() => { vi.clearAllMocks(); h.on = false })

describe("opiniones (interruptor feedback)", () => {
  it("apagado: tabla feedback directa", async () => {
    expect(await api.sendFeedback(NEW)).toBe("fb-db")
    expect(h.db.insert).toHaveBeenCalledWith(expect.objectContaining({ tipo: "error", household_id: NEW.household_id, rating: null, captura: null }))
    expect(await api.loadMyFeedback("u1")).toEqual([{ id: "db" }])
    await api.deleteFeedback("f1")
    expect(h.db.del).toHaveBeenCalledWith("f1")
    expect(h.feedback.send).not.toHaveBeenCalled()
  })

  it("encendido: POST /v1/feedback con householdId, mis opiniones y el 409 con su mensaje", async () => {
    h.on = true
    expect(await api.sendFeedback(NEW)).toBe("fb-api")
    expect(h.feedback.send).toHaveBeenCalledWith({ body: { tipo: "error", rating: null, mensaje: "No guarda", captura: null, householdId: NEW.household_id, pagina: "/gastos", contexto: { version: "5" } } })
    expect(await api.loadMyFeedback("u1")).toEqual([{ id: "f1" }])
    await expect(api.deleteFeedback("f1")).rejects.toThrow("Ya la revisamos: no se puede borrar.")
    expect(h.db.insert).not.toHaveBeenCalled()
  })
})
