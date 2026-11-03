import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/errors"

const h = vi.hoisted(() => ({
  on: false,
  actions: { adminOverview: vi.fn(async () => ({ personas: 1 })) },
  server: { adminCleanOrphanHouseholds: vi.fn(async () => 3), adminSetSuspended: vi.fn(async () => {}) },
  api: {
    overview: vi.fn(async () => ({ status: 200, body: { personas: 7 }, headers: new Headers() })),
    cleanOrphans: vi.fn(async () => ({ status: 200, body: { ok: true, data: { msg: "Listo", borrados: 5 } }, headers: new Headers() })),
    setSuspended: vi.fn(async () => ({ status: 403, body: { ok: false, msg: "No puedes suspender tu propia cuenta.", code: "ROLE_DENIED" }, headers: new Headers() })),
  },
}))

vi.mock("@/lib/api/session", () => ({ apiOn: (m: string) => h.on && m === "admin" }))
const ACTIONS = ["adminOverview", "adminClients", "adminFeedback", "adminUpdateFeedback", "adminRevenue", "adminGrantPremium", "adminRevokeCourtesy"]
const SERVER = ["adminUser", "adminSetSuspended", "adminRecoveryLink", "adminSetPlatformAdmin", "adminDeleteUser", "adminAddNote", "adminDeleteNote", "adminInviteUser", "adminHouseholds", "adminAssignPlan", "adminSubscriptions", "adminUpdateSubscription", "adminManualPayment", "adminUpdatePayment", "adminBroadcast", "adminAdmins", "adminAddAdminByEmail", "adminAuditLog", "adminSystem", "adminSaveSettings", "adminCleanOrphanHouseholds", "adminNotifyLog", "adminTestDefaults", "adminGlobalIntegrations", "adminSaveGlobalIntegration", "adminSendTest", "adminTestGlobal"]
const fill = (names: string[], given: Record<string, unknown>) => ({ ...Object.fromEntries(names.map((n) => [n, vi.fn()])), ...given })
vi.mock("./actions", () => fill(ACTIONS, h.actions))
vi.mock("./server", () => fill(SERVER, h.server))
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
})
