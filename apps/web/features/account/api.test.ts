import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  account: { removePassword: vi.fn(), requestEmailChange: vi.fn(), signOutEverywhere: vi.fn() },
  households: { transferCandidates: vi.fn() },
}))
const signOut = vi.hoisted(() => vi.fn(async () => {}))

vi.mock("@/lib/api/session", () => ({ activeHouseholdId: () => "h1" }))
vi.mock("@/lib/api/client", async () => ({ browserApi: () => api, ...(await import("@/lib/api/unwrap")) }))
vi.mock("@/lib/auth/mirai", () => ({ signOut }))

const ok = (data: unknown) => ({ status: 200, body: { ok: true, data }, headers: new Headers() })
const H = "11111111-1111-4111-8111-111111111111"

describe("features/account/api", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("reauth de la API vuelve como code", async () => {
    const { removeMethod } = await import("./api")
    api.account.removePassword.mockResolvedValue({ status: 409, body: { ok: false, code: "CONFLICT", msg: "Vuelve a entrar", details: { reason: "reauth" } }, headers: new Headers() })
    expect(await removeMethod({ kind: "password" })).toEqual({ ok: false, msg: "Vuelve a entrar", code: "reauth" })
    expect(await removeMethod({ kind: "google", identityId: "x" })).toEqual({ ok: false, msg: "Esa forma de entrar no existe." })
  })

  it("correo de prueba = code prueba", async () => {
    const { requestEmailChange } = await import("./api")
    api.account.requestEmailChange.mockResolvedValue(ok({ msg: "Correo de prueba", prueba: true }))
    expect(await requestEmailChange("a@b.test")).toEqual({ ok: true, code: "prueba", msg: "Correo de prueba" })
  })

  it("cerrar todas las sesiones también limpia la de este navegador", async () => {
    const { signOutEverywhere } = await import("./api")
    api.account.signOutEverywhere.mockResolvedValue(ok({ msg: "Cerramos" }))
    expect(await signOutEverywhere()).toEqual({ ok: true, msg: "Cerramos" })
    expect(signOut).toHaveBeenCalled()
  })

  it("si la API no cierra las sesiones, este navegador sigue con la suya", async () => {
    const { signOutEverywhere } = await import("./api")
    api.account.signOutEverywhere.mockResolvedValue({ status: 500, body: null, headers: new Headers() })
    expect((await signOutEverywhere()).ok).toBe(false)
    expect(signOut).not.toHaveBeenCalled()
  })

  it("candidatos con `owner` → `ok`; error de red → forma vacía", async () => {
    const { loadTransferCandidates } = await import("./api")
    api.households.transferCandidates.mockResolvedValue({ status: 200, body: { owner: true, msg: "", people: [], tienePago: true, hogar: "Casa" }, headers: new Headers() })
    expect(await loadTransferCandidates(H)).toEqual({ ok: true, msg: "", people: [], tienePago: true, hogar: "Casa" })
    api.households.transferCandidates.mockResolvedValue({ status: 500, body: null, headers: new Headers() })
    expect(await loadTransferCandidates(H)).toMatchObject({ ok: false, people: [], hogar: "" })
  })
})
