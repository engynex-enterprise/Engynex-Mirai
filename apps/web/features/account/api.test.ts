import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ on: false }))
const api = vi.hoisted(() => ({
  account: { removePassword: vi.fn(), requestEmailChange: vi.fn(), signOutEverywhere: vi.fn() },
  households: { transferCandidates: vi.fn() },
}))
const signOut = vi.hoisted(() => vi.fn(async () => ({})))

vi.mock("./actions", () => ({
  removeMethod: vi.fn(async () => ({ ok: true, msg: "acción" })),
  requestEmailChange: vi.fn(async () => ({ ok: true, msg: "acción" })),
  signOutEverywhere: vi.fn(async () => ({ ok: true, msg: "acción" })),
  loadTransferCandidates: vi.fn(async () => ({ ok: true, msg: "", people: [], tienePago: false, hogar: "" })),
  loadAccount: vi.fn(async () => undefined),
  resendEmailChange: vi.fn(async () => undefined),
  cancelEmailChange: vi.fn(async () => undefined),
  revokeSession: vi.fn(async () => undefined),
  requestTransfer: vi.fn(async () => undefined),
  respondTransfer: vi.fn(async () => undefined),
  cancelTransfer: vi.fn(async () => undefined),
  leaveHousehold: vi.fn(async () => undefined),
  deleteHousehold: vi.fn(async () => undefined),
}))
vi.mock("@/lib/api/session", () => ({ apiOn: () => state.on, activeHouseholdId: () => "h1" }))
vi.mock("@/lib/api/client", async () => ({ browserApi: () => api, ...(await import("@/lib/api/unwrap")) }))
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({ auth: { signOut } }) }))

const ok = (data: unknown) => ({ status: 200, body: { ok: true, data }, headers: new Headers() })
const H = "11111111-1111-4111-8111-111111111111"

describe("features/account/api", () => {
  beforeEach(() => { vi.clearAllMocks(); state.on = false })

  it("apagado llama a la Server Action de siempre", async () => {
    const actions = await import("./actions")
    const { removeMethod } = await import("./api")
    expect(await removeMethod({ kind: "password" })).toEqual({ ok: true, msg: "acción" })
    expect(actions.removeMethod).toHaveBeenCalled()
    expect(api.account.removePassword).not.toHaveBeenCalled()
  })

  it("encendido: reauth de la API vuelve como code", async () => {
    state.on = true
    const { removeMethod } = await import("./api")
    api.account.removePassword.mockResolvedValue({ status: 409, body: { ok: false, code: "CONFLICT", msg: "Vuelve a entrar", details: { reason: "reauth" } }, headers: new Headers() })
    expect(await removeMethod({ kind: "password" })).toEqual({ ok: false, msg: "Vuelve a entrar", code: "reauth" })
    expect(await removeMethod({ kind: "google", identityId: "x" } as never)).toEqual({ ok: false, msg: "Esa forma de entrar no existe." })
  })

  it("encendido: correo de prueba = code prueba", async () => {
    state.on = true
    const { requestEmailChange } = await import("./api")
    api.account.requestEmailChange.mockResolvedValue(ok({ msg: "Correo de prueba", prueba: true }))
    expect(await requestEmailChange("a@b.test")).toEqual({ ok: true, code: "prueba", msg: "Correo de prueba" })
  })

  it("encendido: cerrar todas las sesiones también limpia la de este navegador", async () => {
    state.on = true
    const { signOutEverywhere } = await import("./api")
    api.account.signOutEverywhere.mockResolvedValue(ok({ msg: "Cerramos" }))
    expect(await signOutEverywhere()).toEqual({ ok: true, msg: "Cerramos" })
    expect(signOut).toHaveBeenCalledWith({ scope: "local" })
  })

  it("encendido: candidatos con `owner` → `ok`; error de red → forma vacía", async () => {
    state.on = true
    const { loadTransferCandidates } = await import("./api")
    api.households.transferCandidates.mockResolvedValue({ status: 200, body: { owner: true, msg: "", people: [], tienePago: true, hogar: "Casa" }, headers: new Headers() })
    expect(await loadTransferCandidates(H)).toEqual({ ok: true, msg: "", people: [], tienePago: true, hogar: "Casa" })
    api.households.transferCandidates.mockResolvedValue({ status: 500, body: null, headers: new Headers() })
    expect(await loadTransferCandidates(H)).toMatchObject({ ok: false, people: [], hogar: "" })
  })
})
