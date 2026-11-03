// F2-D-1: CRUD genérico del libro (PUT / DELETE / restore de /v1/books/:bookId/t/:table/:id) de punta a punta con la
// app real y una base en memoria: roles de BOOK_TABLE_POLICY, «Registra sus gastos» solo con lo suyo, plan, esquema
// zod por tabla, referencias del mismo libro, papelera y aviso de cambios (EventsService → tiempo real y outbox).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BOOK_TABLE_POLICY } from "@mirai/contracts/book-tables"
import { BOOK_TABLE_SCHEMAS } from "@mirai/contracts/book-table-schemas"
import { todayBogota } from "@mirai/domain/dates"
import { B_AJENO, B_GRATIS, B_PREMIUM, USERS } from "../setup/fixtures"
import { createF2dApp, type F2dApp } from "./app"
import { uid } from "./fakes"
import { ID, seedBook } from "./seed"

let t: F2dApp
const today = todayBogota()
const T = (table: string, id: string, book = B_GRATIS) => `/v1/books/${book}/t/${table}/${id}`

beforeAll(async () => {
  t = await createF2dApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.fx.store.reset()
  t.changes.length = 0
  seedBook(t.fx.store, today)
})

describe("política: todas las tablas genéricas que se escriben tienen esquema", () => {
  it("BOOK_TABLE_SCHEMAS = tablas con generic y write ≠ system", () => {
    const want = Object.entries(BOOK_TABLE_POLICY).filter(([, p]) => p.generic && p.write !== "system").map(([k]) => k).sort()
    expect(Object.keys(BOOK_TABLE_SCHEMAS).sort()).toEqual(want)
  })
})

describe("PUT /t/:table/:id (useSave)", () => {
  it("crea con el id del navegador, pone book_id y created_by, y avisa el cambio", async () => {
    const id = uid(500)
    const r = await t.call("PUT", T("categories", id), "editor", { nombre: "Mascotas", grupo: "g", icon: "dog" })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ id, book_id: B_GRATIS, nombre: "Mascotas", created_by: USERS.editor })
    expect(t.changes).toEqual([{ table: "categories", bookId: B_GRATIS, id, op: "INSERT" }])
    for (const c of t.fx.store.calls) expect(c.scope).toMatchObject({ kind: "user", userId: USERS.editor })
  })

  it("repetirlo con el mismo id edita (idempotente) y un cambio parcial no exige los obligatorios", async () => {
    const id = uid(501)
    await t.call("PUT", T("categories", id), "editor", { nombre: "Mascotas" })
    const r = await t.call("PUT", T("categories", id), "editor", { icon: "cat" })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ nombre: "Mascotas", icon: "cat" })
    expect(t.fx.store.all("categories").filter((c) => c.id === id)).toHaveLength(1)
    expect(t.changes.at(-1)).toMatchObject({ op: "UPDATE" })
  })

  it("valida con el esquema de la tabla: obligatorios, tipos, columnas desconocidas y del sistema", async () => {
    const id = uid(502)
    const falta = await t.call("PUT", T("categories", id), "editor", { grupo: "g" })
    expect(falta.status).toBe(400)
    expect(falta.body).toMatchObject({ ok: false, code: "VALIDATION", details: { nombre: expect.any(String) } })
    const enumMal = await t.call("PUT", T("categories", id), "editor", { nombre: "X", grupo: "lujos" })
    expect(enumMal.body).toMatchObject({ code: "VALIDATION", details: { grupo: expect.any(String) } })
    for (const extra of [{ created_by: USERS.owner }, { book_id: B_PREMIUM }, { deleted_at: null }, { hackeo: 1 }]) {
      const r = await t.call("PUT", T("categories", id), "editor", { nombre: "X", ...extra })
      expect(r.status, JSON.stringify(extra)).toBe(400)
    }
    // Las columnas de enlaces solo las escriben las RPC (link-fixed, pay, use-fund…).
    const enlace = await t.call("PUT", T("expenses", uid(503)), "editor", { descripcion: "X", valor: 1, fixed_expense_id: ID.arriendo, periodo: "2026-11" })
    expect(enlace.status).toBe(400)
    expect(t.fx.store.all("categories").some((c) => c.id === id)).toBe(false)
  })

  it("las referencias tienen que ser filas vivas de ESTE libro", async () => {
    const r = await t.call("PUT", T("expenses", uid(504)), "editor", { descripcion: "Pan", valor: 2000, category_id: ID.ajena })
    expect(r.status).toBe(400)
    expect(r.body).toMatchObject({ code: "VALIDATION", details: { fields: { category_id: expect.stringMatching(/no es de este libro/) } } })
    const ok = await t.call("PUT", T("expenses", uid(505)), "editor", { descripcion: "Pan", valor: 2000, category_id: ID.mercado, payment_method_id: ID.nequi })
    expect(ok.status).toBe(200)
  })

  it("rol: «Solo mira» no escribe; «Registra sus gastos» solo sus gastos e ingresos", async () => {
    expect((await t.call("PUT", T("expenses", uid(506)), "viewer", { descripcion: "X", valor: 1 })).status).toBe(403)
    const cat = await t.call("PUT", T("categories", uid(507)), "registra", { nombre: "Mía" })
    expect(cat.status).toBe(403)
    expect(cat.body).toMatchObject({ code: "ROLE_DENIED", msg: expect.stringMatching(/^Tu rol no permite/) })
    const propio = await t.call("PUT", T("expenses", uid(508)), "registra", { descripcion: "Onces", valor: 4000 })
    expect(propio.status).toBe(200)
    expect(propio.body).toMatchObject({ created_by: USERS.registra })
    expect((await t.call("PUT", T("expenses", ID.gastoRegistra), "registra", { valor: 3500 })).status).toBe(200)
    const ajeno = await t.call("PUT", T("expenses", ID.gastoOwner), "registra", { valor: 1 })
    expect(ajeno.status).toBe(403)
    expect(ajeno.body).toMatchObject({ msg: "Tu rol solo te deja cambiar lo que registraste tú." })
    expect((await t.call("DELETE", T("expenses", ID.gastoOwner), "registra")).status).toBe(403)
    expect((await t.call("PUT", T("expenses", ID.gastoOwner), "editor", { valor: 19000 })).status).toBe(200)
  })

  it("plan: tablas Premium (impuestos, familia) dan 402 en Gratis; en Premium se escriben", async () => {
    const r = await t.call("PUT", T("tax_years", uid(509)), "owner", { member_id: uid(600), year: 2025 })
    expect(r.status).toBe(402)
    expect(r.body).toMatchObject({ code: "PLAN_REQUIRED", msg: expect.stringMatching(/no está incluido en tu plan/) })
    const p = await t.call("PUT", T("tax_years", uid(510), B_PREMIUM), "owner", { member_id: uid(600), year: 2025 })
    expect(p.status).toBe(200)
  })

  it("tablas que no van por el CRUD genérico, libros ajenos e ids de otro libro: 404", async () => {
    for (const table of ["chat_threads", "automation_runs", "monthly_summaries", "emergency_funds", "book_settings", "nada"]) {
      expect((await t.call("PUT", T(table, uid(511)), "owner", { x: 1 })).status, table).toBe(404)
    }
    expect((await t.call("PUT", T("categories", uid(512), B_AJENO), "owner", { nombre: "X" })).status).toBe(404)
    expect((await t.call("PUT", T("categories", uid(513), B_PREMIUM), "viewer", { nombre: "X" })).status).toBe(404)
    const cruzado = await t.call("PUT", T("categories", ID.ajena), "owner", { nombre: "Robada" })
    expect(cruzado.status).toBe(404)
    expect(t.fx.store.all("categories").find((c) => c.id === ID.ajena)?.nombre).toBe("Ajena")
  })
})

describe("DELETE y restore (useSoftDelete + Deshacer)", () => {
  it("borra lógico, repetirlo no cambia nada, editar en la papelera da 409 y restaurar la revive", async () => {
    const del = await t.call("DELETE", T("goals", ID.meta), "editor")
    expect(del.status).toBe(200)
    expect(del.body).toMatchObject({ ok: true, data: { id: ID.meta, deleted_at: expect.any(String) } })
    const otra = await t.call("DELETE", T("goals", ID.meta), "editor")
    expect((otra.body as { data: { deleted_at: string } }).data.deleted_at).toBe((del.body as { data: { deleted_at: string } }).data.deleted_at)
    expect((await t.call("PUT", T("goals", ID.meta), "editor", { nombre: "Otra" })).status).toBe(409)
    const res = await t.call("POST", T("goals", ID.meta) + "/restore", "editor")
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, data: { id: ID.meta, deleted_at: null } })
  })

  it("borrar un gasto avisa también las tablas que arrastran sus triggers (tarjeta, fijo, suscripción, fondo…)", async () => {
    await t.call("DELETE", T("expenses", ID.gastoOwner), "owner")
    const tablas = t.changes.map((c) => c.table)
    expect(tablas[0]).toBe("expenses")
    expect(tablas).toEqual(expect.arrayContaining(["card_purchases", "fixed_expense_payments", "subscriptions", "shared_group_expenses", "fund_movements", "emergency_funds"]))
    expect(new Set(t.changes.map((c) => c.bookId))).toEqual(new Set([B_GRATIS]))
  })

  it("borrar una fila Premium no exige el plan (para limpiar al bajar a Gratis); restaurarla sí", async () => {
    t.fx.store.seed("shared_groups", [{ id: uid(520), book_id: B_GRATIS, nombre: "Paseo", personas: [] }])
    expect((await t.call("DELETE", T("shared_groups", uid(520)), "editor")).status).toBe(200)
    expect((await t.call("POST", T("shared_groups", uid(520)) + "/restore", "editor")).status).toBe(402)
  })

  it("404 si la fila no existe o es de otro libro", async () => {
    expect((await t.call("DELETE", T("goals", uid(521)), "editor")).status).toBe(404)
    expect((await t.call("DELETE", T("categories", ID.ajena), "owner")).status).toBe(404)
  })
})
