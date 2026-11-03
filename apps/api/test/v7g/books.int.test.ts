// V7-G (E1, E18): libros y sus ajustes de punta a punta con la app real y RowStore en memoria: rol del hogar, límite
// de libros del plan, papelera con «Deshacer», ajustes validados, errores en español, idempotencia y alcance (siempre
// la sesión de la persona: la RLS vuelve a revisar).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { B_AJENO, B_GRATIS, B_PREMIUM, H_GRATIS, H_PREMIUM, USERS } from "../setup/fixtures"
import { createV7gApp, type V7gApp } from "./app"

let t: V7gApp
/** Fila de book_settings con los valores por defecto de la tabla (20261031000100_core.sql). */
const SETTINGS = {
  book_id: B_GRATIS, meta: "", umbral: 25000, limite: 250000, trm: { USD: 4100, EUR: 4450 }, trm_auto: true, pct: { n: 50, g: 30, a: 20 }, emerg_meta: 6, anticipo: 5,
  usura: 26, usura_auto: true, corte_q: 15, alerta_pres: 100, estricto: "equilibrado", defaults: {}, notif: {}, ia: {}, relaciones: ["Familiar"], apps: [], setup: {},
  uvt: {}, smmlv: {}, gami: true, nomina: {}, updated_at: "2026-11-01T00:00:00Z",
}
const NUEVO = "0000aaaa-0000-4000-8000-00000000aaaa"
const OTRO = "0000bbbb-0000-4000-8000-00000000bbbb"

beforeAll(async () => {
  t = await createV7gApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  const r = t.fx.rows
  r.reset()
  r.seed("books", [
    { id: B_GRATIS, household_id: H_GRATIS, nombre: "Casa", tipo: "personal", icon: "home", is_default: true, sample: false, deleted_at: null },
    { id: B_PREMIUM, household_id: H_PREMIUM, nombre: "Negocio", tipo: "negocio", icon: "store", is_default: true, sample: false, deleted_at: null },
  ])
  r.seed("profiles", Object.values(USERS).map((id) => ({ id, last_book_id: null, nombre: "x" })))
  r.seed("book_settings", [SETTINGS])
  r.rpcImpl.create_book = (a) => {
    r.seed("books", [{ id: NUEVO, household_id: a.p_household, nombre: a.p_nombre, tipo: a.p_tipo, icon: a.p_icon, is_default: false, sample: false, deleted_at: null }])
    return NUEVO
  }
  t.changes.length = 0
})

describe("POST /v1/books", () => {
  it("crea con create_book en el hogar, queda como último libro y todo va con la sesión de la persona", async () => {
    const r = await t.call("POST", "/v1/books", "owner", { householdId: H_PREMIUM, nombre: "  Arriendos ", tipo: "negocio", icon: "building" })
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ ok: true, data: { bookId: NUEVO } })
    expect(t.fx.rows.rpcs).toMatchObject([{ fn: "create_book", args: { p_household: H_PREMIUM, p_nombre: "Arriendos", p_tipo: "negocio", p_icon: "building" }, scope: { kind: "user", userId: USERS.owner } }])
    expect(t.fx.rows.all<{ id: string; last_book_id: string }>("profiles").find((p) => p.id === USERS.owner)?.last_book_id).toBe(NUEVO)
    expect(t.fx.rows.calls.every((c) => c.scope.kind === "user")).toBe(true)
  })

  it("Gratis con su libro ya creado → 402 con el mensaje de la web", async () => {
    const r = await t.call("POST", "/v1/books", "editor", { householdId: H_GRATIS, nombre: "Negocio" })
    expect(r.status).toBe(402)
    expect(r.body).toMatchObject({ ok: false, code: "PLAN_REQUIRED", msg: "Tu plan incluye 1 libro(s) de cuentas. Cambia de plan para llevar también tu negocio o tus arriendos." })
    expect(t.fx.rows.rpcs).toEqual([])
  })

  it("rol y hogar: «Ver» o «Registra» → 403; un hogar ajeno → 404", async () => {
    expect((await t.call("POST", "/v1/books", "viewer", { householdId: H_GRATIS, nombre: "X" })).body).toMatchObject({ code: "ROLE_DENIED" })
    expect((await t.call("POST", "/v1/books", "registra", { householdId: H_GRATIS, nombre: "X" })).status).toBe(403)
    expect((await t.call("POST", "/v1/books", "editor", { householdId: H_PREMIUM, nombre: "X" })).body).toMatchObject({ code: "NOT_FOUND", msg: "No encontramos ese hogar." })
  })

  it("validación en español", async () => {
    const r = await t.call("POST", "/v1/books", "owner", { householdId: H_PREMIUM, nombre: "  ", tipo: "casa" })
    expect(r.status).toBe(400)
    expect(JSON.stringify(r.body)).toContain("Escribe el nombre del libro")
    expect(JSON.stringify(r.body)).toContain("Tipo de libro inválido")
  })

  it("con Idempotency-Key, repetir no crea otro libro", async () => {
    const h = { "idempotency-key": "crear-libro-123456" }
    const a = await t.call("POST", "/v1/books", "owner", { householdId: H_PREMIUM, nombre: "Arriendos" }, h)
    const b = await t.call("POST", "/v1/books", "owner", { householdId: H_PREMIUM, nombre: "Arriendos" }, h)
    expect(b.body).toEqual(a.body)
    expect(b.headers["idempotent-replayed"]).toBe("true")
    expect(t.fx.rows.rpcs).toHaveLength(1)
  })

  it("un error de la base que no es de permiso sale con el mensaje genérico de la web", async () => {
    t.fx.rows.rpcImpl.create_book = () => {
      throw new Error("boom")
    }
    const r = await t.call("POST", "/v1/books", "owner", { householdId: H_PREMIUM, nombre: "Arriendos" })
    expect(r.status).toBe(500)
    expect(r.body).toMatchObject({ code: "INTERNAL", msg: "No pudimos crear el libro. Intenta de nuevo." })
  })
})

describe("PATCH /v1/books/:bookId", () => {
  it("«Edita» cambia nombre e ícono; «Registra» no; un libro ajeno es 404", async () => {
    const r = await t.call("PATCH", `/v1/books/${B_GRATIS}`, "editor", { nombre: "Casa nueva", icon: "house" })
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({ id: B_GRATIS, nombre: "Casa nueva", icon: "house", is_default: true })
    expect((await t.call("PATCH", `/v1/books/${B_GRATIS}`, "registra", { nombre: "X" })).status).toBe(403)
    expect((await t.call("PATCH", `/v1/books/${B_AJENO}`, "owner", { nombre: "X" })).body).toMatchObject({ code: "NOT_FOUND", msg: "No encontramos ese libro." })
    expect((await t.call("PATCH", `/v1/books/${B_GRATIS}`, "editor", {})).body).toMatchObject({ code: "VALIDATION" })
  })
})

describe("DELETE /v1/books/:bookId y «Deshacer»", () => {
  beforeEach(() => {
    t.fx.rows.seed("books", [{ id: OTRO, household_id: H_GRATIS, nombre: "Arriendos", tipo: "otro", icon: "book", is_default: false, sample: false, deleted_at: null }])
  })

  it("el libro principal no se borra (409) y solo el dueño puede borrar (403)", async () => {
    expect((await t.call("DELETE", `/v1/books/${B_GRATIS}`, "owner", { confirm: "Casa" })).body).toMatchObject({ code: "CONFLICT", msg: "Este es el libro principal del hogar: no se puede borrar." })
    expect((await t.call("DELETE", `/v1/books/${B_GRATIS}`, "admin", { confirm: "Casa" })).status).toBe(403)
  })

  it("hay que escribir el nombre; luego va a la papelera y se puede deshacer", async () => {
    // El contexto de prueba solo trae los libros principales: se borra «Negocio» (que deja de ser el principal) y el
    // hogar Premium tiene otro libro vivo.
    t.fx.rows.seed("books", [{ id: "0000cccc-0000-4000-8000-00000000cccc", household_id: H_PREMIUM, nombre: "Otro", tipo: "otro", icon: "book", is_default: false, sample: false, deleted_at: null }])
    const libros = t.fx.rows.t("books")
    libros.find((b) => b.id === B_PREMIUM)!.is_default = false
    expect((await t.call("DELETE", `/v1/books/${B_PREMIUM}`, "owner", { confirm: "otro nombre" })).body).toMatchObject({ code: "VALIDATION", msg: "Escribe el nombre del libro exactamente para confirmar" })
    const r = await t.call("DELETE", `/v1/books/${B_PREMIUM}`, "owner", { confirm: " negocio " })
    expect(r.body).toEqual({ ok: true, data: { msg: "Enviamos «Negocio» a la papelera." } })
    expect(libros.find((b) => b.id === B_PREMIUM)?.deleted_at).toBeTruthy()

    const u = await t.call("POST", `/v1/trash/books/${B_PREMIUM}/restore`, "owner")
    expect(u.status).toBe(200)
    expect(u.body.data).toMatchObject({ id: B_PREMIUM, deleted_at: null })
  })

  it("el último libro vivo del hogar no se borra", async () => {
    t.fx.rows.t("books").find((b) => b.id === B_PREMIUM)!.is_default = false
    expect((await t.call("DELETE", `/v1/books/${B_PREMIUM}`, "owner", { confirm: "Negocio" })).body).toMatchObject({ code: "CONFLICT", msg: "Es el único libro del hogar: crea otro antes de borrar este." })
  })

  it("restaurar: solo el dueño del hogar, con el límite del plan y nunca un libro ajeno", async () => {
    t.fx.rows.t("books").find((b) => b.id === OTRO)!.deleted_at = "2026-11-01T00:00:00Z"
    expect((await t.call("POST", `/v1/trash/books/${OTRO}/restore`, "editor")).status).toBe(403)
    // Gratis (1 libro) con «Casa» vivo: no cabe otro.
    expect((await t.call("POST", `/v1/trash/books/${OTRO}/restore`, "owner")).body).toMatchObject({ code: "PLAN_REQUIRED" })
    expect((await t.call("POST", `/v1/trash/books/${B_AJENO}/restore`, "owner")).status).toBe(404)
  })
})

describe("GET/PATCH /v1/books/:bookId/settings", () => {
  it("cualquier rol lee; «Edita» cambia y avisa en vivo", async () => {
    expect((await t.call("GET", `/v1/books/${B_GRATIS}/settings`, "viewer")).body).toMatchObject({ book_id: B_GRATIS, corte_q: 15 })
    const r = await t.call("PATCH", `/v1/books/${B_GRATIS}/settings`, "editor", { gami: false, pct: { n: 60, g: 20, a: 20 }, uvt: { "2026": 52374 } })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ gami: false, pct: { n: 60, g: 20, a: 20 }, uvt: { "2026": 52374 } })
    expect(t.changes).toEqual([{ table: "book_settings", bookId: B_GRATIS, id: B_GRATIS, op: "UPDATE" }])
  })

  it("«Registra» no cambia ajustes y los valores fuera de rango salen en español", async () => {
    expect((await t.call("PATCH", `/v1/books/${B_GRATIS}/settings`, "registra", { gami: false })).status).toBe(403)
    const r = await t.call("PATCH", `/v1/books/${B_GRATIS}/settings`, "editor", { corte_q: 30, estricto: "muy", trm: { dolar: 4000 } })
    expect(r.status).toBe(400)
    const s = JSON.stringify(r.body)
    for (const m of ["Entre el día 1 y el 27", "Usa prudente, equilibrado o flexible", "trm.dolar"]) expect(s).toContain(m)
  })

  it("sin ajustes guardados → 404 en español", async () => {
    expect((await t.call("GET", `/v1/books/${B_PREMIUM}/settings`, "owner")).body).toMatchObject({ code: "NOT_FOUND", msg: "No encontramos los ajustes de este libro." })
  })
})
