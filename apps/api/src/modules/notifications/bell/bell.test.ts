// Campana: mismas consultas que notifications-sheet.tsx (siempre por user_id) en los dos adaptadores.
import { describe, expect, it } from "vitest"
import { captureKysely, fakeSupabase, USER_SCOPE } from "../../../../test/setup/db-doubles"
import { PgKyselyBellRepo } from "./adapters/pg-kysely.bell.repo"
import { SupabaseJsBellRepo } from "./adapters/supabase-js.bell.repo"

const B = "00000000-0000-4000-8000-000000000101"

describe("SupabaseJsBellRepo", () => {
  it("list: del libro o generales, los 50 más recientes", async () => {
    const { sb, chains } = fakeSupabase()
    await new SupabaseJsBellRepo(sb).list(USER_SCOPE, { userId: "u-1", bookId: B, sinLeer: true, limit: 50 })
    expect(chains[0].calls).toEqual([["select", "*"], ["eq", "user_id", "u-1"], ["or", `book_id.eq.${B},book_id.is.null`], ["is", "read_at", null], ["order", "created_at", { ascending: false }], ["limit", 50]])
  })
  it("markRead y markAll filtran por la persona; sin filas = null / 0", async () => {
    const { sb, chains } = fakeSupabase(() => ({ data: [], error: null }))
    const repo = new SupabaseJsBellRepo(sb)
    expect(await repo.markRead(USER_SCOPE, { userId: "u-1", id: "n1", at: "T" })).toBeNull()
    expect(await repo.markAll(USER_SCOPE, { userId: "u-1", at: "T" })).toBe(0)
    expect(chains[0].calls).toEqual([["update", { read_at: "T" }], ["eq", "id", "n1"], ["eq", "user_id", "u-1"], ["select", "id,read_at"]])
    expect(chains[1].calls).toEqual([["update", { read_at: "T" }], ["eq", "user_id", "u-1"], ["is", "read_at", null], ["select", "id"]])
  })
})

describe("PgKyselyBellRepo", () => {
  it("list con el libro o generales y marcar todas", async () => {
    const { factory, queries } = captureKysely((q) => (q.startsWith("update") ? [{}, {}] : []))
    const repo = new PgKyselyBellRepo(factory)
    await repo.list(USER_SCOPE, { userId: "u-1", bookId: B, sinLeer: false, limit: 10 })
    expect(queries()[0]).toEqual({ sql: 'select * from "notifications" where "user_id" = $1 and ("book_id" = $2 or "book_id" is null) order by "created_at" desc limit $3', params: ["u-1", B, 10] })
    expect(await repo.markAll(USER_SCOPE, { userId: "u-1", at: "T" })).toBe(2)
  })
})
