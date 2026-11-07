import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/errors"

const h = vi.hoisted(() => ({
  on: false,
  actions: { adminOverview: vi.fn(async () => ({ personas: 1 })) },
  server: { adminCleanOrphanHouseholds: vi.fn(async () => 3), adminSetSuspended: vi.fn(async () => {}) },
  wa: { adminWaDeleteTemplate: vi.fn(async () => ({ ok: true, msg: "acción" })) },
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

vi.mock("@/lib/api/session", () => ({ apiOn: (m: string) => h.on && m === "admin" }))
const ACTIONS = ["adminOverview", "adminClients", "adminFeedback", "adminUpdateFeedback", "adminRevenue", "adminGrantPremium", "adminRevokeCourtesy"]
const SERVER = ["adminUser", "adminSetSuspended", "adminRecoveryLink", "adminSetPlatformAdmin", "adminDeleteUser", "adminAddNote", "adminDeleteNote", "adminInviteUser", "adminHouseholds", "adminAssignPlan", "adminSubscriptions", "adminUpdateSubscription", "adminManualPayment", "adminUpdatePayment", "adminBroadcast", "adminAdmins", "adminAddAdminByEmail", "adminAuditLog", "adminSystem", "adminSaveSettings", "adminCleanOrphanHouseholds", "adminNotifyLog", "adminTestDefaults", "adminGlobalIntegrations", "adminSaveGlobalIntegration", "adminSendTest", "adminTestGlobal"]
const fill = (names: string[], given: Record<string, unknown>) => ({ ...Object.fromEntries(names.map((n) => [n, vi.fn()])), ...given })
vi.mock("./actions", () => fill(ACTIONS, h.actions))
vi.mock("./server", () => fill(SERVER, h.server))
vi.mock("./whatsapp", () => fill(["adminWaState", "adminWaSaveSettings", "adminWaSaveTemplate", "adminWaDeleteTemplate", "adminWaPreview", "adminWaSendTest"], h.wa))
vi.mock("@/lib/api/client", async () => {
  const u = await import("@/lib/api/unwrap")
  return { browserApi: () => ({ admin: h.api }), unwrap: u.unwrap, unwrapData: u.unwrapData }
})

const api = await import("./api")

beforeEach(() => {
  vi.clearAllMocks()
  h.on = false
})

describe("consola admin por la API (interruptor admin)", () => {
  it("apagado: llama la Server Action de siempre y no toca el cliente", async () => {
    expect(await api.adminOverview()).toEqual({ personas: 1 })
    expect(await api.adminCleanOrphanHouseholds()).toBe(3)
    expect(h.actions.adminOverview).toHaveBeenCalledOnce()
    expect(h.api.overview).not.toHaveBeenCalled()
    expect(h.api.cleanOrphans).not.toHaveBeenCalled()
  })

  it("encendido: lecturas y comandos por /v1/admin con la misma forma", async () => {
    h.on = true
    expect(await api.adminOverview()).toEqual({ personas: 7 })
    expect(await api.adminCleanOrphanHouseholds()).toBe(5)
    expect(h.actions.adminOverview).not.toHaveBeenCalled()
    expect(h.server.adminCleanOrphanHouseholds).not.toHaveBeenCalled()
  })

  it("encendido: el error de la API llega como ApiError con su mensaje en español (como el throw de la acción)", async () => {
    h.on = true
    const e = await api.adminSetSuspended("u1", true).catch((x) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e.message).toBe("No puedes suspender tu propia cuenta.")
    expect(h.api.setSuspended).toHaveBeenCalledWith({ params: { userId: "u1" }, body: { suspend: true } })
    expect(h.server.adminSetSuspended).not.toHaveBeenCalled()
  })

  it("V7-H3: integraciones globales y WhatsApp por la API; los errores vuelven como { ok:false, msg } (como las acciones)", async () => {
    expect(await api.adminWaDeleteTemplate("aviso")).toEqual({ ok: true, msg: "acción" })
    expect(h.api.waDeleteTemplate).not.toHaveBeenCalled()
    h.on = true
    expect(await api.adminSaveGlobalIntegration("telegram", { modo: "opcional", planes: [], values: {} })).toEqual({ ok: false, msg: "Falta: Token del bot" })
    expect(h.api.saveIntegration).toHaveBeenCalledWith({ params: { kind: "telegram" }, body: { modo: "opcional", planes: [], values: {} } })
    expect(await api.adminTestGlobal("telegram")).toEqual({ ok: false, msg: "Primero guarda la configuración." })
    const draft = { name: "aviso", language: "es_CO", category: "UTILITY" as const, header: { type: "none" as const }, body: "Hola {{1}}", examples: ["Ana"], footer: "", buttons: [] }
    expect(await api.adminWaSaveTemplate(draft)).toEqual({ ok: true, msg: "Plantilla enviada a Meta" })
    expect(h.api.waSaveTemplate).toHaveBeenCalledWith({ body: { draft } })
    expect(await api.adminWaDeleteTemplate("aviso", "123456")).toEqual({ ok: false, msg: "(#100) Meta no respondió" })
    expect(h.api.waDeleteTemplate).toHaveBeenCalledWith({ params: { name: "aviso" }, query: { id: "123456" } })
    expect(h.wa.adminWaDeleteTemplate).toHaveBeenCalledTimes(1)
  })
})
