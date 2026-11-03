// Puerto de escritura del libro (F2-D): los dos adaptadores hacen la misma escritura que la web (useSave/useSoftDelete y
// las RPC) y traducen los errores de la base; Kysely manda el contexto RLS con x-mirai-enlaces en cada transacción.
import { describe, expect, it } from "vitest"
import { captureKysely, fakeSupabase, USER_SCOPE } from "../../../test/setup/db-doubles"
import type { SupabaseJsFactory } from "../../core/db/supabase-js.factory"
import { PgKyselyBookStore, pgValue } from "./adapters/pg-kysely.book-store"
import { SupabaseJsBookStore } from "./adapters/supabase-js.book-store"
import { storeError } from "./book-store"
import { touched } from "./cascades"

describe("SupabaseJsBookStore", () => {
  it("editar es update por id y libro (no upsert); crear es insert; la fila 1:1 hace upsert por book_id", async () => {
    const { sb, chains } = fakeSupabase(() => ({ data: [{ id: "x" }], error: null }))
    const s = new SupabaseJsBookStore(sb)
    await s.update(USER_SCOPE, "goals", "b", "x", { nombre: "Viaje" })
    await s.insert(USER_SCOPE, "goals", [{ id: "x", book_id: "b", nombre: "Viaje" }])
    await s.upsertSingle(USER_SCOPE, "emergency_funds", "b", { activo: true })
    expect(chains.map((c) => [c.table, c.calls])).toEqual([
      ["goals", [["update", { nombre: "Viaje" }], ["eq", "id", "x"], ["eq", "book_id", "b"], ["select", "*"]]],
      ["goals", [["insert", [{ id: "x", book_id: "b", nombre: "Viaje" }]], ["select", "*"]]],
      ["emergency_funds", [["upsert", { activo: true, book_id: "b" }, { onConflict: "book_id" }], ["select", "*"], ["single"]]],
    ])
  })

  it("rows: libro, sin borradas (salvo alive:false), filtros, orden y páginas de 1000", async () => {
    let n = 0
    const { sb, chains } = fakeSupabase(() => ({ data: Array.from({ length: n++ === 0 ? 1000 : 3 }, (_, i) => ({ id: i })), error: null }))
    const rows = await new SupabaseJsBookStore(sb).rows(USER_SCOPE, "expenses", "b", { eq: { member_id: null, origen: "importar" }, in: ["id", ["a", "b"]], order: { column: "fecha", ascending: false }, select: ["id"] })
    expect(rows).toHaveLength(1003)
    expect(chains[0].calls).toEqual([["select", "id"], ["eq", "book_id", "b"], ["is", "deleted_at", null], ["is", "member_id", null], ["eq", "origen", "importar"], ["in", "id", ["a", "b"]], ["order", "fecha", { ascending: false }], ["range", 0, 999]])
    expect(chains[1].calls.at(-1)).toEqual(["range", 1000, 1999])
    const { sb: sb2, chains: c2 } = fakeSupabase()
    await new SupabaseJsBookStore(sb2).rows(USER_SCOPE, "expenses", "b", { alive: false, limit: 1 })
    expect(c2[0].calls).toEqual([["select", "*"], ["eq", "book_id", "b"], ["range", 0, 0]])
  })

  it("rpc con los argumentos tal cual y errores de la función traducidos", async () => {
    const calls: unknown[][] = []
    const err = { code: "P0001", message: "Ese periodo ya está pagado" }
    const sb = { for: () => ({ rpc: async (...a: unknown[]) => (calls.push(a), a[0] === "pay_fixed_expense" ? { data: null, error: err } : { data: 5, error: null }) }) } as unknown as SupabaseJsFactory
    const s = new SupabaseJsBookStore(sb)
    expect(await s.rpc(USER_SCOPE, "fund_save", { p_book: "b", p_valor: 1, p_fecha: "2026-11-02" })).toBe(5)
    await expect(s.rpc(USER_SCOPE, "pay_fixed_expense", { p_fixed: "f", p_periodo: "2026-11", p_fecha: "2026-11-02", p_valor: 1 })).rejects.toMatchObject({ code: "CONFLICT", msg: "Ese periodo ya está pagado" })
    expect(calls[0]).toEqual(["fund_save", { p_book: "b", p_valor: 1, p_fecha: "2026-11-02" }])
  })
})

describe("storeError", () => {
  it("textos de las funciones en el código que corresponde", () => {
    expect(storeError({ code: "P0001", message: "Sin permiso" })).toMatchObject({ code: "ROLE_DENIED" })
    expect(storeError({ code: "P0001", message: "Tarjeta no encontrada" })).toMatchObject({ code: "NOT_FOUND", msg: "Tarjeta no encontrada." })
    expect(storeError({ code: "P0001", message: "Este gasto ya está enlazado con otro registro" })).toMatchObject({ code: "CONFLICT" })
    expect(storeError({ code: "P0001", message: "Escribe el valor" })).toMatchObject({ code: "VALIDATION", msg: "Escribe el valor" })
    expect(storeError({ code: "42501", message: "new row violates row-level security policy" })).toMatchObject({ code: "ROLE_DENIED" })
    expect(storeError({ code: "23505", message: "dup" })).toMatchObject({ code: "CONFLICT" })
  })
})

describe("PgKyselyBookStore", () => {
  it("cada operación corre con el contexto RLS de la persona y x-mirai-enlaces (las cascadas de la base)", async () => {
    const { factory, log } = captureKysely(() => [{ id: "x" }])
    await new PgKyselyBookStore(factory).update(USER_SCOPE, "goals", "b", "x", { nombre: "Viaje" })
    expect(log[0].sql).toBe("set local role authenticated")
    expect(log[1].params).toEqual(expect.arrayContaining([JSON.stringify({ "x-mirai-enlaces": "1" })]))
  })

  it("insert/update citan identificadores, jsonb como texto y nada del cliente en el SQL", async () => {
    const { factory, queries } = captureKysely(() => [{ id: "x" }])
    const s = new PgKyselyBookStore(factory)
    await s.insert(USER_SCOPE, "incomes", [{ id: "x", book_id: "b", concepto: "Sueldo'); drop table x;--", reparto: { tipo: "salario" }, deducciones: null }])
    await s.update(USER_SCOPE, "expenses", "b", "x", { deleted_at: null, member_ids: ["m1"] })
    const [ins, upd] = queries()
    expect(ins.sql).toBe('insert into "incomes" ("id", "book_id", "concepto", "reparto", "deducciones") values ($1, $2, $3, $4, $5) returning *')
    expect(ins.params).toEqual(["x", "b", "Sueldo'); drop table x;--", '{"tipo":"salario"}', null])
    expect(upd.sql).toBe('update "expenses" set "deleted_at" = $1, "member_ids" = $2 where id = $3 and book_id = $4 returning *')
    expect(upd.params).toEqual([null, ["m1"], "x", "b"])
    expect(pgValue("savings_challenges", "marcas", [1, 2])).toBe("[1,2]")
    await expect(s.insert(USER_SCOPE, "goals; drop", [{ id: "x" }])).rejects.toBeTruthy()
  })

  it("rpc con argumentos nombrados; escalares y jsonb salen como el valor de la función", async () => {
    const { factory, queries } = captureKysely((sql) => (sql.includes("fund_save") ? [{ fund_save: 350000 }] : [{ id: "a1", saldo_base: 5 }]))
    const s = new PgKyselyBookStore(factory)
    expect(await s.rpc(USER_SCOPE, "fund_save", { p_book: "b", p_valor: 1, p_fecha: "2026-11-02", p_nota: undefined })).toBe(350000)
    expect(await s.rpc(USER_SCOPE, "asset_cuadrar", { p_asset: "a1", p_saldo: 5 })).toEqual({ id: "a1", saldo_base: 5 })
    expect(queries()[0].sql).toBe("select * from public.fund_save(p_book => $1, p_valor => $2, p_fecha => $3)")
  })

  it("fila 1:1: insert … on conflict (book_id) do update", async () => {
    const { factory, queries } = captureKysely(() => [{ book_id: "b", activo: true }])
    await new PgKyselyBookStore(factory).upsertSingle(USER_SCOPE, "emergency_funds", "b", { activo: true })
    expect(queries()[0].sql).toBe('insert into "emergency_funds" ("activo", "book_id") values ($1, $2) on conflict (book_id) do update set "activo" = excluded."activo" returning *')
  })
})

describe("cascades", () => {
  it("la tabla escrita primero, luego lo que arrastran sus triggers (solo tablas en vivo)", () => {
    expect(touched("goal_movements")).toEqual(["goal_movements", "goals"])
    expect(touched("categories", ["nada", "categories"])).toEqual(["categories"])
  })
})
