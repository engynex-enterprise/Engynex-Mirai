import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/errors"

const h = vi.hoisted(() => ({
  api: {
    overview: vi.fn(async () => ({ status: 200, body: { personas: 7 }, headers: new Headers() })),
    cleanOrphans: vi.fn(async () => ({ status: 200, body: { ok: true, data: { msg: "Listo", borrados: 5 } }, headers: new Headers() })),
    setSuspended: vi.fn(async () => ({ status: 403, body: { ok: false, msg: "No puedes suspender tu propia cuenta.", code: "ROLE_DENIED" }, headers: new Headers() })),
    saveIntegration: vi.fn(async () => ({ status: 400, body: { ok: false, msg: "Falta: Token del bot", code: "VALIDATION" }, headers: new Headers() })),
    testIntegration: vi.fn(async () => ({ status: 200, body: { ok: true, data: { ok: false, msg: "Primero guarda la configuración." } }, headers: new Headers() })),
    waSaveTemplate: vi.fn(async () => ({ status: 200, body: { ok: true, data: { msg: "Plantilla enviada a Meta" } }, headers: new Headers() })),
    waDeleteTemplate: vi.fn(async () => ({ status: 502, body: { ok: false, msg: "(#100) Meta no respondió", code: "UPSTREAM" }, headers: new Headers() })),
  },
}))

vi.mock("@/lib/api/client", async () => {
  const u = await import("@/lib/api/unwrap")
  return { browserApi: () => ({ admin: h.api }), unwrap: u.unwrap, unwrapData: u.unwrapData }
})

const api = await import("./api")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("consola admin por la API", () => {
  it("lecturas y comandos por /v1/admin", async () => {
    expect(await api.adminOverview()).toEqual({ personas: 7 })
    expect(await api.adminCleanOrphanHouseholds()).toBe(5)
    expect(h.api.overview).toHaveBeenCalledOnce()
  })

  it("el error de la API llega como ApiError con su mensaje en español", async () => {
    const e = await api.adminSetSuspended("u1", true).catch((x) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e.message).toBe("No puedes suspender tu propia cuenta.")
    expect(h.api.setSuspended).toHaveBeenCalledWith({ params: { userId: "u1" }, body: { suspend: true } })
  })

  it("integraciones globales y WhatsApp: los errores vuelven como { ok:false, msg }", async () => {
    expect(await api.adminSaveGlobalIntegration("telegram", { modo: "opcional", planes: [], values: {} })).toEqual({ ok: false, msg: "Falta: Token del bot" })
    expect(h.api.saveIntegration).toHaveBeenCalledWith({ params: { kind: "telegram" }, body: { modo: "opcional", planes: [], values: {} } })
    expect(await api.adminTestGlobal("telegram")).toEqual({ ok: false, msg: "Primero guarda la configuración." })
    const draft = { name: "aviso", language: "es_CO", category: "UTILITY" as const, header: { type: "none" as const }, body: "Hola {{1}}", examples: ["Ana"], footer: "", buttons: [] }
    expect(await api.adminWaSaveTemplate(draft)).toEqual({ ok: true, msg: "Plantilla enviada a Meta" })
    expect(h.api.waSaveTemplate).toHaveBeenCalledWith({ body: { draft } })
    expect(await api.adminWaDeleteTemplate("aviso", "123456")).toEqual({ ok: false, msg: "(#100) Meta no respondió" })
    expect(h.api.waDeleteTemplate).toHaveBeenCalledWith({ params: { name: "aviso" }, query: { id: "123456" } })
  })
})
