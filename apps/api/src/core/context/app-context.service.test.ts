import { describe, expect, it, vi } from "vitest"
import { rawFor, USERS, B_GRATIS, B_PREMIUM, H_PREMIUM } from "../../../test/setup/fixtures"
import type { AuthUser } from "../auth/token-verifier"
import type { SupabaseJsFactory } from "../db/supabase-js.factory"
import { SupabaseJsAppContextRepo } from "./adapters/supabase-js.app-context.repo"
import { AppContextRepo } from "./app-context.repo"
import { AppContextService, CONTEXT_TTL_MS } from "./app-context.service"

const user = (id: string): AuthUser => ({ id, email: null, role: "authenticated", isAnonymous: false, token: `tok-${id}`, claims: { sub: id }, expiresIn: 3600 })

class Repo extends AppContextRepo {
  load = vi.fn(async (s: { userId: string }) => rawFor(s.userId))
  planOf = vi.fn(async () => ({ id: "premium", nombre: "Premium", funciones: ["ia"], anuncios: false, limites: {}, precio_mes: 1 }))
}

describe("AppContextService", () => {
  it("cachea 30 s por persona y comparte el viaje entre peticiones simultáneas", async () => {
    const repo = new Repo()
    const svc = new AppContextService(repo)
    const u = user(USERS.owner)
    await Promise.all([svc.raw(u, 0), svc.raw(u, 10), svc.raw(u, CONTEXT_TTL_MS - 1)])
    expect(repo.load).toHaveBeenCalledTimes(1)
    await svc.raw(u, CONTEXT_TTL_MS + 1)
    expect(repo.load).toHaveBeenCalledTimes(2)
    svc.invalidate(u.id)
    await svc.raw(u, CONTEXT_TTL_MS + 2)
    expect(repo.load).toHaveBeenCalledTimes(3)
  })

  it("si la base falla no deja el error en caché", async () => {
    const repo = new Repo()
    repo.load.mockRejectedValueOnce(new Error("x"))
    const svc = new AppContextService(repo)
    await expect(svc.raw(user(USERS.viewer))).rejects.toThrow()
    await expect(svc.raw(user(USERS.viewer))).resolves.toBeTruthy()
  })

  it("bookAccess: libro, rol fino y plan; null si no es miembro", async () => {
    const svc = new AppContextService(new Repo())
    expect(await svc.bookAccess(user(USERS.owner), B_PREMIUM)).toMatchObject({ book: { id: B_PREMIUM, household_id: H_PREMIUM }, access: "owner", plan: { id: "premium" } })
    expect(await svc.bookAccess(user(USERS.registra), B_GRATIS)).toMatchObject({ access: "registra", household: { role: "viewer", access: "registra" }, plan: { id: "gratis" } })
    expect(await svc.bookAccess(user(USERS.viewer), B_PREMIUM)).toBeNull()
  })

  it("me(): plan aparte si mirai_app_context no lo trajo (respaldo con consultas sueltas)", async () => {
    const repo = new Repo()
    repo.load.mockImplementation(async (s) => {
      const r = rawFor(s.userId)
      return { ...r, households: r.households.map(({ plan: _p, ...h }) => h) }
    })
    const ctx = await new AppContextService(repo).me(user(USERS.editor))
    expect(repo.planOf).toHaveBeenCalled()
    expect(ctx.plan.id).toBe("premium")
  })

  it("me() sin hogar: NOT_FOUND con redirect", async () => {
    await expect(new AppContextService(new Repo()).me(user(USERS.outsider))).rejects.toMatchObject({ code: "NOT_FOUND", details: { redirect: "/bienvenida" } })
  })
})

describe("SupabaseJsAppContextRepo", () => {
  it("usa mirai_app_context con el cliente de la persona", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: rawFor(USERS.owner), error: null })
    const sb = { for: vi.fn(() => ({ rpc })) } as unknown as SupabaseJsFactory
    const r = await new SupabaseJsAppContextRepo(sb).load({ kind: "user", userId: USERS.owner, token: "t", claims: {} })
    expect(rpc).toHaveBeenCalledWith("mirai_app_context")
    expect(r.households).toHaveLength(2)
    expect((sb.for as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ kind: "user", token: "t" })
  })

  it("un error de RLS/red no cae al respaldo: sale como DomainError", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" } })
    const sb = { for: vi.fn(() => ({ rpc })) } as unknown as SupabaseJsFactory
    await expect(new SupabaseJsAppContextRepo(sb).load({ kind: "user", userId: "u", token: "t", claims: {} })).rejects.toMatchObject({ code: "UPSTREAM" })
  })
})
