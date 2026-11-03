// gami: el adaptador arma el estado igual que useGamiState y el código de referido distingue la colisión (23505).
import { describe, expect, it } from "vitest"
import { captureKysely, fakeSupabase, USER_SCOPE } from "../../../test/setup/db-doubles"
import { systemScope } from "../../core/db/scope"
import { PgKyselyGamiRepo } from "./adapters/pg-kysely.gami.repo"
import { SupabaseJsGamiRepo } from "./adapters/supabase-js.gami.repo"

const DATA: Record<string, { data: unknown; error: null; count?: number }> = {
  gami_visits: { data: [{ dia: "2026-10-31" }, { dia: "2026-10-30" }], error: null },
  gami_badges: { data: [{ badge: "gasto1", unlocked_at: "2026-10-01" }], error: null },
  gami_missions: { data: Array.from({ length: 14 }, (_, i) => ({ semana: `2026-W${String(40 - i).padStart(2, "0")}`, mision: "m" })), error: null },
  gami_state: { data: { max_level: 3, init_date: "2026-01-01" }, error: null },
  book_settings: { data: { gami: false }, error: null },
  chat_threads: { data: null, error: null, count: 4 },
  advisor_consultations: { data: null, error: null, count: 2 },
  savings_challenges: { data: [{ tipo: "52", base: "1000", marcas: null }], error: null },
  emergency_funds: { data: { activo: true, saldo: "5" }, error: null },
  profiles: { data: { nombre: "Ana" }, error: null },
}

describe("SupabaseJsGamiRepo", () => {
  it("state: las mismas consultas y el mismo armado de useGamiState (12 semanas de misiones)", async () => {
    const { sb, chains } = fakeSupabase((t) => DATA[t])
    const st = await new SupabaseJsGamiRepo(sb).state(USER_SCOPE, { bookId: "b", userId: "u-1" })
    expect(st).toMatchObject({ on: false, visitas: ["2026-10-31", "2026-10-30"], unl: { gasto1: "2026-10-01" }, maxLevel: 3, chats: 4, consejos: 2, fondo: { on: true, saldo: 5 }, nombre: "Ana" })
    expect(Object.keys(st.mis)).toHaveLength(12)
    expect(st.retos[0]).toMatchObject({ base: 1000, marcas: [] })
    expect(chains[0].calls).toEqual([["select", "dia"], ["eq", "book_id", "b"], ["eq", "user_id", "u-1"], ["order", "dia", { ascending: false }], ["limit", 400]])
    expect(chains[5].calls[0]).toEqual(["select", "id", { count: "exact", head: true }])
  })

  it("crearCodigo: true si entra, false si el código ya existe, y otro error sale como DomainError", async () => {
    const sys = systemScope("prueba")
    for (const [error, want] of [[null, true], [{ code: "23505", message: "dup" }, false]] as const) {
      const { sb } = fakeSupabase(() => ({ data: null, error }))
      expect(await new SupabaseJsGamiRepo(sb).crearCodigo(sys, "u", "ABC")).toBe(want)
    }
    const { sb } = fakeSupabase(() => ({ data: null, error: { code: "42501", message: "rls" } }))
    await expect(new SupabaseJsGamiRepo(sb).crearCodigo(sys, "u", "ABC")).rejects.toMatchObject({ code: "ROLE_DENIED" })
  })
})

describe("PgKyselyGamiRepo", () => {
  it("cuenta chats y consejos en la base y la colisión del código es false", async () => {
    const { factory, queries } = captureKysely((q) => (q.includes("count(*)") ? [{ n: 7 }] : []))
    const st = await new PgKyselyGamiRepo(factory).state(USER_SCOPE, { bookId: "b", userId: "u-1" })
    expect(st).toMatchObject({ on: true, chats: 7, consejos: 7, maxLevel: 1, fondo: null, nombre: "" })
    expect(queries().some((q) => q.sql === 'select count(*)::int as "n" from "chat_threads" where "book_id" = $1')).toBe(true)
    const dup = captureKysely(() => {
      throw Object.assign(new Error("dup"), { code: "23505" })
    })
    expect(await new PgKyselyGamiRepo(dup.factory).crearCodigo(systemScope("prueba"), "u", "ABC")).toBe(false)
  })
})
