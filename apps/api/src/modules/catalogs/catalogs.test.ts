// Pruebas unitarias del módulo de ejemplo: servicio con un repositorio falso y adaptador supabase-js con un cliente
// falso que registra la consulta (paridad con useCategories de apps/web).
import { describe, expect, it, vi } from "vitest"
import { FakeCatalogsRepo } from "../../../test/setup/fakes"
import { B_GRATIS, USERS } from "../../../test/setup/fixtures"
import type { RequestContextService } from "../../core/context/request-context.service"
import type { SupabaseJsFactory } from "../../core/db/supabase-js.factory"
import { SupabaseJsCatalogsRepo } from "./adapters/supabase-js.catalogs.repo"
import { CatalogsService } from "./catalogs.service"

describe("CatalogsService", () => {
  it("usa el libro que revisó BookGuard y el alcance de la persona", async () => {
    const repo = new FakeCatalogsRepo()
    const db = { kind: "user" as const, userId: USERS.viewer, token: "t", claims: {} }
    const ctx = { db, book: { book: { id: B_GRATIS } } } as unknown as RequestContextService
    const rows = await new CatalogsService(repo, ctx).listCategories({ grupo: "necesidades" })
    expect(rows.map((r) => r.nombre)).toEqual(["Arriendo", "Mercado"])
    expect(repo.calls[0]).toEqual({ scope: db, q: { bookId: B_GRATIS, grupo: "necesidades" } })
  })
})

function fakeQuery(result: { data: unknown; error: unknown }) {
  const calls: [string, ...unknown[]][] = []
  const q: Record<string, unknown> = {}
  for (const m of ["from", "select", "eq", "is"]) q[m] = (...a: unknown[]) => (calls.push([m, ...a]), q)
  q.order = (...a: unknown[]) => (calls.push(["order", ...a]), Promise.resolve(result))
  return { client: q, calls }
}

describe("SupabaseJsCatalogsRepo", () => {
  it("misma consulta que useList('categories', { order: sort }) de la web", async () => {
    const { client, calls } = fakeQuery({ data: [{ id: "c" }], error: null })
    const sb = { for: vi.fn(() => client) } as unknown as SupabaseJsFactory
    const scope = { kind: "user" as const, userId: "u", token: "t", claims: {} }
    expect(await new SupabaseJsCatalogsRepo(sb).listCategories(scope, { bookId: B_GRATIS })).toEqual([{ id: "c" }])
    expect(calls).toEqual([["from", "categories"], ["select", "*"], ["eq", "book_id", B_GRATIS], ["is", "deleted_at", null], ["order", "sort", { ascending: true }]])
    expect((sb.for as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(scope)
  })

  it("un error de PostgREST sale como DomainError (42501 → ROLE_DENIED)", async () => {
    const { client } = fakeQuery({ data: null, error: { code: "42501", message: "rls" } })
    const sb = { for: () => client } as unknown as SupabaseJsFactory
    await expect(new SupabaseJsCatalogsRepo(sb).listCategories({ kind: "user", userId: "u", token: "t", claims: {} }, { bookId: "b", grupo: "x" })).rejects.toMatchObject({ code: "ROLE_DENIED" })
  })
})
