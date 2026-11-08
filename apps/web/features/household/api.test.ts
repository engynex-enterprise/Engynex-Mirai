import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/errors"

const api = vi.hoisted(() => ({
  households: { invite: vi.fn(), changeRole: vi.fn(), acceptInvitation: vi.fn() },
}))
const switchBook = vi.hoisted(() => vi.fn(async () => {}))

vi.mock("@/lib/api/session", () => ({ activeHouseholdId: () => "h1" }))
vi.mock("@/lib/api/client", async () => ({ browserApi: () => api, ...(await import("@/lib/api/unwrap")) }))
vi.mock("@/components/app/actions", () => ({ switchBook }))

const ok = (data: unknown) => ({ status: 200, body: { ok: true, data }, headers: new Headers() })
const err = (status: number, body: unknown) => ({ status, body, headers: new Headers() })

describe("features/household/api", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("invita por la API con el hogar activo", async () => {
    const { invitePerson } = await import("./api")
    api.households.invite.mockResolvedValue(ok({ invitationId: "i1", share: { url: "u", text: "t", wa: "w" }, delivery: {}, msg: "enviada" }))
    const r = await invitePerson({ destino: "a@b.co", access: "viewer" })
    expect(api.households.invite).toHaveBeenCalledWith({ params: { householdId: "h1" }, body: { destino: "a@b.co", access: "viewer" } })
    expect(r).toMatchObject({ ok: true, invitationId: "i1", msg: "enviada" })
  })

  it("convierte details.reason y el límite del plan en `code`", async () => {
    const { invitePerson, inviteFailure } = await import("./api")
    api.households.invite.mockResolvedValue(err(409, { ok: false, code: "CONFLICT", msg: "Ya la invitaste", details: { reason: "pendiente", invitationId: "i9" } }))
    expect(await invitePerson({ destino: "a@b.co", access: "viewer" })).toEqual({ ok: false, msg: "Ya la invitaste", code: "pendiente", invitationId: "i9" })
    expect(inviteFailure(ApiError.from(402, { ok: false, code: "PLAN_REQUIRED", msg: "Tu plan permite 2" }))).toEqual({ ok: false, msg: "Tu plan permite 2", code: "limite" })
    expect(inviteFailure(new Error("x"))).toEqual({ ok: false, msg: "x" })
  })

  it("cambiar a dueño se rechaza sin llamar a la API", async () => {
    const { changeRole } = await import("./api")
    expect(await changeRole("u1", "owner")).toEqual({ ok: false, msg: "Ese rol no existe. Para que alguien sea dueño, pásale el hogar." })
    expect(api.households.changeRole).not.toHaveBeenCalled()
    api.households.changeRole.mockResolvedValue(err(403, { ok: false, code: "ROLE_DENIED", msg: "Tu rol no permite…" }))
    expect(await changeRole("u1", "editor")).toEqual({ ok: false, msg: "Tu rol no permite…" })
  })

  it("aceptar por la API deja abierto el libro nuevo con switchBook", async () => {
    const { acceptInvitation } = await import("./api")
    api.households.acceptInvitation.mockResolvedValue(ok({ householdId: "h2", bookId: "b2", ya: false, msg: "¡Listo!" }))
    expect(await acceptInvitation("tok")).toEqual({ ok: true, msg: "¡Listo!" })
    expect(switchBook).toHaveBeenCalledWith("b2")
  })
})
