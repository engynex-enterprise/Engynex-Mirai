// insights: periodo de la consulta y los adaptadores (mismas consultas que loadChatBook / loadRentaData / useList de
// la web; Kysely con el mismo filtro de libro y borrado lógico). Las cifras se prueban en test/read.int.test.ts.
import { describe, expect, it } from "vitest"
import type { LoadedBook } from "@mirai/domain/book-data"
import { captureKysely, fakeSupabase, USER_SCOPE } from "../../../test/setup/db-doubles"
import { PgKyselyInsightsRepo } from "./adapters/pg-kysely.insights.repo"
import { SupabaseJsInsightsRepo } from "./adapters/supabase-js.insights.repo"
import { periodoDe } from "./insights.service"
import { PgKyselyRefsRepo } from "./refs/adapters/pg-kysely.refs.repo"
import { SupabaseJsRefsRepo } from "./refs/adapters/supabase-js.refs.repo"

const book = { settings: { corte_q: 15 } } as LoadedBook

describe("periodoDe", () => {
  it("mes por defecto, quincenas, año y rango validado", () => {
    expect(periodoDe(book, "2026-10-31", {})).toEqual({ a: "2026-10-01", b: "2026-10-31", tipo: "mes" })
    expect(periodoDe(book, "2026-10-31", { tipo: "q1", mes: "2026-02" })).toMatchObject({ a: "2026-02-01", b: "2026-02-15", tipo: "q1" })
    expect(periodoDe(book, "2026-10-31", { tipo: "anio" })).toMatchObject({ a: "2026-01-01", b: "2026-12-31", tipo: "anio" })
    expect(periodoDe(book, "2026-10-31", { tipo: "rango", a: "2026-01-01", b: "2026-01-31" })).toEqual({ a: "2026-01-01", b: "2026-01-31", tipo: "rango" })
    expect(() => periodoDe(book, "2026-10-31", { tipo: "rango", a: "2026-02-01", b: "2026-01-31" })).toThrow("La fecha inicial debe ser antes de la final.")
  })
})

describe("SupabaseJsInsightsRepo", () => {
  it("extras: las 6 consultas de loadChatBook (libro u hogar, sin borradas)", async () => {
    const { sb, chains } = fakeSupabase((t) => ({ data: [{ t }], error: null }))
    const r = await new SupabaseJsInsightsRepo(sb).extras(USER_SCOPE, { bookId: "b", householdId: "h" })
    expect(r.fondo).toEqual([{ t: "fund_movements" }])
    expect(chains.map((c) => c.table)).toEqual(["fund_movements", "tax_assets", "income_categories", "allowances", "allowance_movements", "family_members"])
    expect(chains[5].calls).toEqual([["select", "id,nombre"], ["eq", "household_id", "h"], ["is", "deleted_at", null]])
    expect(chains[0].calls).toEqual([["select", "fecha,valor,tipo,expense_id"], ["eq", "book_id", "b"], ["is", "deleted_at", null]])
  })

  it("renta: como loadRentaData (integrantes en orden; si ref_* falla, constantes del código)", async () => {
    const { sb, chains } = fakeSupabase((t) => (t === "ref_uvt" ? { data: null, error: { message: "caída" } } : t === "ref_smmlv" ? { data: [{ year: 2026, valor: 9 }], error: null } : { data: [], error: null }))
    const r = await new SupabaseJsInsightsRepo(sb).renta(USER_SCOPE, { bookId: "b", householdId: "h" })
    expect(r.ref).toEqual({ uvt: {}, smmlv: {} })
    expect(chains[0].calls).toEqual([["select", "*"], ["eq", "household_id", "h"], ["is", "deleted_at", null], ["order", "sort"], ["order", "created_at"]])
    expect(chains[1].calls).toEqual([["select", "id,nombre"], ["eq", "book_id", "b"]])
  })

  it("un error de PostgREST sale como DomainError", async () => {
    const { sb } = fakeSupabase(() => ({ data: null, error: { code: "57014", message: "timeout" } }))
    await expect(new SupabaseJsInsightsRepo(sb).snapshots(USER_SCOPE, "b")).rejects.toMatchObject({ code: "UPSTREAM" })
  })
})

describe("PgKyselyInsightsRepo", () => {
  it("extras y fotos del patrimonio con el mismo filtro", async () => {
    const { factory, queries } = captureKysely()
    const repo = new PgKyselyInsightsRepo(factory)
    await repo.extras(USER_SCOPE, { bookId: "b", householdId: "h" })
    await repo.snapshots(USER_SCOPE, "b")
    const sqls = queries().map((q) => q.sql)
    expect(sqls).toContain('select "fecha", "valor", "tipo", "expense_id" from "fund_movements" where "book_id" = $1 and "deleted_at" is null')
    expect(sqls).toContain('select "id", "nombre" from "family_members" where "household_id" = $1 and "deleted_at" is null')
    expect(sqls.at(-1)).toBe('select "mes", "patrimonio" from "net_worth_snapshots" where "book_id" = $1 and "deleted_at" is null')
  })
})

describe("refs", () => {
  it("supabase-js: TRM más reciente primero con límite y festivos de un año", async () => {
    const { sb, chains } = fakeSupabase()
    const repo = new SupabaseJsRefsRepo(sb)
    await repo.trm(USER_SCOPE, 1)
    await repo.festivos(USER_SCOPE, { year: 2026 })
    expect(chains[0].calls).toEqual([["select", "fecha,valor,fuente"], ["order", "fecha", { ascending: false }], ["limit", 1]])
    expect(chains[1].calls).toEqual([["select", "fecha,nombre"], ["gte", "fecha", "2026-01-01"], ["lte", "fecha", "2026-12-31"], ["order", "fecha", { ascending: true }]])
  })
  it("Kysely: calendario de renta por dígitos y año", async () => {
    const { factory, queries } = captureKysely()
    await new PgKyselyRefsRepo(factory).rentaCalendar(USER_SCOPE, { digitos: "07", year: 2026 })
    expect(queries()[0]).toEqual({ sql: 'select "year", "digitos", "regimen", "fecha" from "ref_renta_calendar" where "digitos" = $1 and "year" = $2 order by "year" desc, "fecha" asc', params: ["07", 2026] })
  })
})
