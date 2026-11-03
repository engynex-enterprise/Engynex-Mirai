// book-tables (lectura): validación de la consulta contra la lista blanca y los dos adaptadores (misma consulta que
// useList/loadBookPart de la web en supabase-js; SQL citado y con los hijos embebidos en Kysely).
import { describe, expect, it } from "vitest"
import { BOOK_TABLE_COLUMNS, BOOK_TABLE_COLUMNS_COMPLETE } from "@mirai/contracts/book-table-columns"
import { BOOK_TABLE_POLICY } from "@mirai/contracts/book-tables"
import { captureKysely, fakeSupabase, USER_SCOPE } from "../../../test/setup/db-doubles"
import { PgKyselyBookTablesRepo } from "./adapters/pg-kysely.book-tables.repo"
import { SupabaseJsBookTablesRepo } from "./adapters/supabase-js.book-tables.repo"
import { parseList, parseParts } from "./book-tables.service"

describe("parseList / parseParts", () => {
  it("la lista blanca cubre las 42 tablas de la política y todas tienen id, book_id y deleted_at", () => {
    expect(BOOK_TABLE_COLUMNS_COMPLETE).toBe(true)
    expect(Object.keys(BOOK_TABLE_COLUMNS).sort()).toEqual(Object.keys(BOOK_TABLE_POLICY).sort())
    for (const cols of Object.values(BOOK_TABLE_COLUMNS)) expect(cols).toEqual(expect.arrayContaining(["id", "book_id", "deleted_at"]))
  })

  it("arma la consulta y rechaza columnas o filtros fuera de la lista", () => {
    expect(parseList("b", "expenses", { select: " id , valor ", order: "fecha", "eq.member_id": "null", "eq.hormiga": "true" })).toEqual({
      bookId: "b", table: "expenses", select: ["id", "valor"], eq: [["member_id", null], ["hormiga", "true"]], order: { column: "fecha", ascending: true },
    })
    expect(parseList("b", "goals", { select: "*" })).toEqual({ bookId: "b", table: "goals", select: "*", eq: [] })
    expect(() => parseList("b", "goals", { order: "valor.desc" })).toThrow("La columna «valor» no existe en goals.")
    expect(() => parseList("b", "goals", { "eq.user_id": "x" })).toThrow(/no existe en goals/)
    expect(() => parseList("b", "goals", { limit: "5" })).toThrow(/^Filtro desconocido/)
  })

  it("partes: todas por defecto, en el orden de BOOK_PARTS y sin repetir", () => {
    expect(parseParts()).toHaveLength(19)
    expect(parseParts("loans, expenses,loans")).toEqual(["expenses", "loans"])
    expect(() => parseParts("expenses,ingresos")).toThrow(/«ingresos» no existe/)
  })
})

describe("SupabaseJsBookTablesRepo", () => {
  it("list: misma cadena que useList (libro, sin borradas, eq/is y orden)", async () => {
    const { sb, chains } = fakeSupabase(() => ({ data: [{ id: "g1" }], error: null }))
    const rows = await new SupabaseJsBookTablesRepo(sb).list(USER_SCOPE, { bookId: "b", table: "expenses", select: ["id", "valor"], eq: [["member_id", null], ["hormiga", "true"]], order: { column: "fecha", ascending: false } })
    expect(rows).toEqual([{ id: "g1" }])
    expect(chains[0]).toEqual({ table: "expenses", calls: [["select", "id,valor"], ["eq", "book_id", "b"], ["is", "deleted_at", null], ["is", "member_id", null], ["eq", "hormiga", "true"], ["order", "fecha", { ascending: false }]] })
  })

  it("part: misma consulta que loadBookPart (hijos embebidos; book_settings sin filtro de borrado)", async () => {
    const { sb, chains } = fakeSupabase()
    const repo = new SupabaseJsBookTablesRepo(sb)
    await repo.part(USER_SCOPE, "b", "loans")
    await repo.part(USER_SCOPE, "b", "book_settings")
    expect(chains[0].calls).toEqual([["select", "*, loan_payments(*)"], ["eq", "book_id", "b"], ["is", "deleted_at", null]])
    expect(chains[1].calls).toEqual([["select", "*"], ["eq", "book_id", "b"]])
  })

  it("un error de PostgREST sale como DomainError", async () => {
    const { sb } = fakeSupabase(() => ({ data: null, error: { code: "42501", message: "rls" } }))
    await expect(new SupabaseJsBookTablesRepo(sb).part(USER_SCOPE, "b", "expenses")).rejects.toMatchObject({ code: "ROLE_DENIED" })
  })
})

describe("PgKyselyBookTablesRepo", () => {
  it("list: identificadores citados y valores como parámetros", async () => {
    const { factory, queries } = captureKysely(() => [{ id: "g1" }])
    const rows = await new PgKyselyBookTablesRepo(factory).list(USER_SCOPE, { bookId: "b", table: "expenses", select: ["id", "valor"], eq: [["member_id", null], ["descripcion", "x' or 1=1"]], order: { column: "fecha", ascending: false } })
    expect(rows).toEqual([{ id: "g1" }])
    expect(queries()[0]).toEqual({ sql: 'select "id", "valor" from "expenses" where book_id = $1 and deleted_at is null and "member_id" is null and "descripcion" = $2 order by "fecha" desc', params: ["b", "x' or 1=1"] })
  })

  it("part: anida los hijos por la llave foránea, como el embebido de PostgREST", async () => {
    const { factory, queries } = captureKysely((q) =>
      q.includes('from "credit_cards"') ? [{ id: "c1" }, { id: "c2" }] : q.includes('from "card_purchases"') ? [{ id: "p1", card_id: "c1" }, { id: "p2", card_id: "c1" }] : [],
    )
    const rows = await new PgKyselyBookTablesRepo(factory).part(USER_SCOPE, "b", "credit_cards")
    expect(rows).toEqual([{ id: "c1", card_purchases: [{ id: "p1", card_id: "c1" }, { id: "p2", card_id: "c1" }], card_payments: [] }, { id: "c2", card_purchases: [], card_payments: [] }])
    expect(queries().map((q) => q.sql)).toEqual([
      'select * from "credit_cards" where book_id = $1 and deleted_at is null',
      'select * from "card_purchases" where "card_id" in ($1, $2)',
      'select * from "card_payments" where "card_id" in ($1, $2)',
    ])
    const { factory: f2, queries: q2 } = captureKysely()
    expect(await new PgKyselyBookTablesRepo(f2).part(USER_SCOPE, "b", "emergency_funds")).toEqual([])
    expect(q2().map((q) => q.sql)).toEqual(['select * from "emergency_funds" where book_id = $1'])
  })
})
