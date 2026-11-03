// Pruebas de los adaptadores de RowStore sin red: supabase-js con un cliente falso que registra la cadena y Kysely con
// un driver que captura el SQL (test/setup/db-doubles.ts). Revisan filtros, jsonb, upsert, errores en español y que
// update/delete nunca salgan sin filtro.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { captureKysely, fakeSupabase, USER_SCOPE } from "../../../test/setup/db-doubles"
import { systemScope } from "../db/scope"
import { DomainError } from "../errors/domain-error"
import { JSON_COLUMNS } from "./json-columns"
import { PgKyselyRowStore, pgValue } from "./pg-kysely.row-store"
import { hasWhere, likeEscape, rowStoreError } from "./row-store"
import { SupabaseJsRowStore } from "./supabase-js.row-store"

describe("RowStore: utilidades", () => {
  it("hasWhere: un filtro vacío no cuenta", () => {
    expect(hasWhere({})).toBe(false)
    expect(hasWhere({ eq: {} })).toBe(false)
    expect(hasWhere({ notNull: [] })).toBe(false)
    expect(hasWhere({ eq: { id: "x" } })).toBe(true)
    expect(hasWhere({ notNull: ["a"] })).toBe(true)
  })

  it("likeEscape escapa los comodines del texto de la persona", () => {
    expect(likeEscape("50%_off\\")).toBe("50\\%\\_off\\\\")
  })

  it("rowStoreError: textos de la base con su código", () => {
    expect(rowStoreError({ code: "P0001", message: "Sin permiso" }).code).toBe("ROLE_DENIED")
    expect(rowStoreError({ code: "P0001", message: "Libro no encontrado" })).toMatchObject({ code: "NOT_FOUND", msg: "Libro no encontrado." })
    expect(rowStoreError({ code: "P0001", message: "Tu plan incluye 1 libro" })).toMatchObject({ code: "VALIDATION", msg: "Tu plan incluye 1 libro" })
    expect(rowStoreError({ code: "23505", message: "dup" }).code).toBe("CONFLICT")
  })

  it("JSON_COLUMNS coincide con las columnas Json de los tipos de la base", () => {
    const src = readFileSync(join(__dirname, "../../../../../packages/db/src/database.types.ts"), "utf8").split("Views:")[0]
    const found: string[] = []
    for (const m of src.matchAll(/"([a-z_0-9]+)": \{\s*Row: \{\s*([^}]*)\}/g))
      for (const c of m[2].matchAll(/"([a-z_0-9]+)": ([^,]+?)(?=,"|\s*$)/g)) if (/Json/.test(c[2])) found.push(`${m[1]}.${c[1]}`)
    expect([...JSON_COLUMNS].sort()).toEqual(found.sort())
  })

  it("pgValue: jsonb como texto; text[] tal cual", () => {
    expect(pgValue("automations", "grafo", { nodes: [] })).toBe('{"nodes":[]}')
    expect(pgValue("savings_challenges", "marcas", [1, 2])).toBe("[1,2]")
    expect(pgValue("plans", "funciones", ["ia"])).toEqual(["ia"])
    expect(pgValue("plans", "nombre", undefined)).toBeNull()
  })
})

describe("SupabaseJsRowStore", () => {
  it("select arma la cadena de filtros, orden, columnas y rango", async () => {
    const { sb, chains } = fakeSupabase(() => ({ data: [{ id: "1" }], error: null }))
    const s = new SupabaseJsRowStore(sb)
    const rows = await s.select(USER_SCOPE, "feedback", {
      columns: ["id", "mensaje"], eq: { user_id: "u-1", rating: null }, in: { estado: ["nuevo", "visto"] }, notNull: ["respuesta"], gte: { created_at: "2026-01-01" }, ilike: { mensaje: "50%" },
      order: [{ column: "created_at", ascending: false }], limit: 20,
    })
    expect(rows).toEqual([{ id: "1" }])
    expect(chains[0].table).toBe("feedback")
    expect(chains[0].calls).toEqual([
      ["select", "id,mensaje"], ["eq", "user_id", "u-1"], ["is", "rating", null], ["in", "estado", ["nuevo", "visto"]], ["not", "respuesta", "is", null],
      ["gte", "created_at", "2026-01-01"], ["ilike", "mensaje", "%50\\%%"], ["order", "created_at", { ascending: false }], ["range", 0, 19],
    ])
  })

  it("select sin límite pagina de 1.000 en 1.000", async () => {
    let n = 0
    const { sb, chains } = fakeSupabase(() => ({ data: Array.from({ length: n++ === 0 ? 1000 : 3 }, (_, i) => ({ i })), error: null }))
    const rows = await new SupabaseJsRowStore(sb).select(USER_SCOPE, "notifications")
    expect(rows).toHaveLength(1003)
    expect(chains.map((c) => c.calls.at(-1))).toEqual([["range", 0, 999], ["range", 1000, 1999]])
  })

  it("upsert con onConflict e ignoreDuplicates; update/delete exigen filtro", async () => {
    const { sb, chains } = fakeSupabase(() => ({ data: [], error: null, count: 2 }))
    const s = new SupabaseJsRowStore(sb)
    await s.upsert(USER_SCOPE, "gami_badges", [{ book_id: "b", badge: "x" }], { onConflict: ["book_id", "badge"], ignoreDuplicates: true })
    expect(chains[0].calls[0]).toEqual(["upsert", [{ book_id: "b", badge: "x" }], { onConflict: "book_id,badge", ignoreDuplicates: true }])
    expect(await s.delete(USER_SCOPE, "backups", { eq: { id: "1" } })).toBe(2)
    await expect(s.update(USER_SCOPE, "profiles", {}, { nombre: "x" })).rejects.toMatchObject({ code: "INTERNAL" })
    await expect(s.delete(USER_SCOPE, "profiles", { eq: {} })).rejects.toBeInstanceOf(DomainError)
  })

  it("los errores de PostgREST salen como DomainError en español", async () => {
    const { sb } = fakeSupabase(() => ({ data: null, error: { code: "42501", message: "rls" } }))
    await expect(new SupabaseJsRowStore(sb).select(USER_SCOPE, "profiles")).rejects.toMatchObject({ code: "ROLE_DENIED", msg: "Tu rol no permite hacer esto en este hogar." })
  })
})

describe("PgKyselyRowStore", () => {
  it("select con filtros, orden, límite y desplazamiento; con UserScope fija el rol y los claims", async () => {
    const { factory, log, queries } = captureKysely(() => [{ id: "1" }])
    await new PgKyselyRowStore(factory).select(USER_SCOPE, "feedback", { columns: ["id"], eq: { user_id: "u-1", rating: null }, in: { estado: [] }, ilike: { mensaje: "a_b" }, order: [{ column: "created_at", ascending: false }], limit: 5, offset: 10 })
    expect(log[0].sql).toBe("set local role authenticated")
    const q = queries()[0]
    expect(q.sql).toBe('select "id" from "feedback" where "user_id" = $1 and "rating" is null and false and "mensaje" ilike $2 order by "created_at" desc limit $3 offset $4')
    expect(q.params).toEqual(["u-1", "%a\\_b%", 5, 10])
  })

  it("insert con varias filas (default donde falta), jsonb como texto y returning", async () => {
    const { factory, queries } = captureKysely(() => [{ id: "a" }, { id: "b" }])
    const out = await new PgKyselyRowStore(factory).insert(systemScope("prueba"), "automations", [{ nombre: "A", grafo: { n: 1 } }, { nombre: "B", icon: "x" }])
    expect(out).toHaveLength(2)
    const q = queries()[0]
    expect(q.sql).toBe('insert into "automations" ("nombre", "grafo", "icon") values ($1, $2, default), ($3, default, $4) returning *')
    expect(q.params).toEqual(["A", '{"n":1}', "B", "x"])
  })

  it("upsert: do update de las columnas que no son llave, o do nothing", async () => {
    const { factory, queries } = captureKysely()
    const s = new PgKyselyRowStore(factory)
    await s.upsert(USER_SCOPE, "user_preferences", [{ user_id: "u-1", theme: "dark" }], { onConflict: ["user_id"] })
    await s.upsert(USER_SCOPE, "gami_visits", [{ book_id: "b", user_id: "u", dia: "2026-11-02" }], { onConflict: ["book_id", "user_id", "dia"], ignoreDuplicates: true })
    expect(queries().map((q) => q.sql)).toEqual([
      'insert into "user_preferences" ("user_id", "theme") values ($1, $2) on conflict ("user_id") do update set "theme" = excluded."theme" returning *',
      'insert into "gami_visits" ("book_id", "user_id", "dia") values ($1, $2, $3) on conflict ("book_id", "user_id", "dia") do nothing returning *',
    ])
  })

  it("update, delete y count", async () => {
    const { factory, queries } = captureKysely((s) => (/count/.test(s) ? [{ n: 3 }] : []))
    const s = new PgKyselyRowStore(factory)
    await s.update(USER_SCOPE, "book_settings", { eq: { book_id: "b" } }, { gami: false, pct: { n: 50 }, nada: undefined })
    await s.delete(USER_SCOPE, "backups", { eq: { id: "1", book_id: "b" } })
    expect(await s.count(USER_SCOPE, "chat_threads", { eq: { book_id: "b" } })).toBe(3)
    expect(queries().map((q) => [q.sql, q.params])).toEqual([
      ['update "book_settings" set "gami" = $1, "pct" = $2 where "book_id" = $3 returning *', [false, '{"n":50}', "b"]],
      ['delete from "backups" where "id" = $1 and "book_id" = $2', ["1", "b"]],
      ['select count(*)::int as n from "chat_threads" where "book_id" = $1', ["b"]],
    ])
    await expect(s.update(USER_SCOPE, "profiles", {}, { nombre: "x" })).rejects.toMatchObject({ code: "INTERNAL" })
  })

  it("rpc con argumentos con nombre: escalar o filas", async () => {
    const { factory, queries } = captureKysely((s) => (/create_book/.test(s) ? [{ create_book: "bk-1" }] : [{ a: 1 }, { a: 2 }]))
    const s = new PgKyselyRowStore(factory)
    expect(await s.rpc(USER_SCOPE, "create_book", { p_household: "h", p_nombre: "Casa", p_tipo: undefined })).toBe("bk-1")
    expect(await s.rpc(USER_SCOPE, "household_subscription", { p_household: "h" })).toEqual([{ a: 1 }, { a: 2 }])
    expect(queries()[0].sql).toBe("select * from public.create_book(p_household => $1, p_nombre => $2)")
  })

  it("identificadores raros no llegan al SQL", async () => {
    const { factory } = captureKysely()
    await expect(new PgKyselyRowStore(factory).select(USER_SCOPE, "feedback", { eq: { "x; drop table y": 1 } })).rejects.toBeTruthy()
  })
})
