// V7-G (grupo B): respaldos guardados, restaurar, formatear, importar v4, libro de ejemplo y exportar mis datos, de
// punta a punta con la app real y dobles en memoria (RowStore, BookStore y el almacén de respaldos). Revisan roles,
// plan, errores en español, idempotencia y el alcance de cada operación (SystemScope donde la web usa supabaseAdmin,
// la sesión de la persona donde la web usa la suya).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BOOK_TABLES } from "@mirai/contracts/book-tables"
import { FORMAT_BLOCK_IDS } from "@mirai/contracts/modules/import"
import { rowStoreError } from "../../src/core/store/row-store"
import { FORMAT_BLOCKS, sanitizeDump } from "../../src/modules/import/data.service"
import { B_GRATIS, B_PREMIUM, H_GRATIS, H_PREMIUM, USERS } from "../setup/fixtures"
import { createV7gApp, type V7gApp } from "./app"

let t: V7gApp
const id = (n: number) => `${String(n).padStart(8, "0")}-7000-4000-8000-${String(n).padStart(12, "0")}`
const FAM = id(1)
const CAT = id(2)
const G1 = id(3)
const NEW_BOOK = id(99)

beforeAll(async () => {
  t = await createV7gApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.fx.rows.reset()
  t.fx.book.reset()
  Object.assign(t.fx.backups, { saved: [], rows: [], files: new Map(), removed: [] })
  t.changes.length = 0
  // Libro gratis con ajustes y un par de registros (lo que lee BookDumpService para el respaldo "antes de restaurar").
  t.fx.book.seed("book_settings", [{ book_id: B_GRATIS, umbral: 25000, gami: true }])
  t.fx.book.seed("book_settings", [{ book_id: B_PREMIUM, umbral: 30000 }])
  t.fx.book.seed("expenses", [
    { id: G1, book_id: B_GRATIS, descripcion: "Mercado", valor: 50000, created_by: USERS.owner },
    { id: id(4), book_id: B_GRATIS, descripcion: "Bus", valor: 3000, created_by: USERS.editor },
  ])
  // Lo que ve RowStore: integrantes del hogar, ajustes y filas del libro.
  t.fx.rows.seed("family_members", [{ id: FAM, household_id: H_GRATIS, nombre: "Ana", es_titular: true, deleted_at: null }])
  t.fx.rows.seed("book_settings", [{ book_id: B_GRATIS, umbral: 25000 }, { book_id: NEW_BOOK, umbral: 1 }])
  t.fx.rows.seed("expenses", [{ id: G1, book_id: B_GRATIS, descripcion: "Mercado", deleted_at: null }, { id: id(5), book_id: B_GRATIS, descripcion: "Pan", deleted_at: "2026-01-01T00:00:00Z" }])
  t.fx.rows.seed("incomes", [{ id: id(6), book_id: B_GRATIS, concepto: "Sueldo", deleted_at: null }])
})

const U = (p: string, book = B_GRATIS) => `/v1/books/${book}${p}`
const dumpOf = (over: Record<string, unknown> = {}) => ({
  app: "mirai", v: 5, book_id: B_GRATIS, household_id: H_GRATIS, nombre: "Casa", fecha: "2026-10-01T00:00:00.000Z",
  settings: { book_id: "otro", updated_at: "x", umbral: 99000 },
  data: {
    categories: [{ id: CAT, nombre: "Mercado", book_id: "otro-libro" }],
    expenses: [{ id: id(10), descripcion: "Arriendo", category_id: CAT, member_id: FAM, payment_method_id: id(777), tags_ids: [CAT, id(778)] }, "basura", [1]],
    tablaRara: [{ id: id(11) }],
  },
  ...over,
})
const saveBackup = async (book = B_GRATIS, body: unknown = dumpOf()) => {
  await t.fx.backups.save({ bookId: book, tipo: "manual", body: JSON.stringify(body), fecha: "2026-10-01T00:00:00.000Z", userId: USERS.owner })
  return t.fx.backups.rows[0]
}

describe("contrato", () => {
  it("los bloques de Formatear del contrato son los del servicio", () => {
    expect([...FORMAT_BLOCK_IDS].sort()).toEqual(Object.keys(FORMAT_BLOCKS).sort())
  })
})

describe("sanitizeDump", () => {
  it("solo tablas del libro y objetos; referencias fuera del respaldo y del hogar quedan en null", () => {
    const out = sanitizeDump(dumpOf() as never, new Set([FAM]))
    expect(Object.keys(out).sort()).toEqual([...BOOK_TABLES].sort())
    expect(out.expenses).toEqual([{ id: id(10), descripcion: "Arriendo", category_id: CAT, member_id: FAM, payment_method_id: null, tags_ids: [CAT] }])
    expect(out.categories[0].book_id).toBe("otro-libro") // book_id se pisa al insertar
  })
})

describe("GET /backups y /backups/:id/url (permiso «ajustes»)", () => {
  it("Administra ve la lista y el enlace de 2 minutos; Colabora y Solo mira no", async () => {
    const b = await saveBackup()
    const r = await t.call("GET", U("/backups"), "admin")
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject([{ id: b.id, tipo: "manual", path: b.path }])
    expect((await t.call("GET", U(`/backups/${b.id}/url`), "owner")).body).toEqual({ url: `https://archivos.test/backups/${b.path}?expira=120` })
    for (const role of ["editor", "viewer"] as const) {
      const d = await t.call("GET", U("/backups"), role)
      expect(d.status).toBe(403)
      expect(d.body.code).toBe("ROLE_DENIED")
    }
  })

  it("un respaldo que no existe o es de otro libro → 404 «Respaldo no encontrado»", async () => {
    const b = await saveBackup(B_PREMIUM)
    const r = await t.call("GET", U(`/backups/${b.id}/url`), "owner")
    expect(r.status).toBe(404)
    expect(r.body).toMatchObject({ code: "NOT_FOUND", msg: "Respaldo no encontrado" })
  })
})

describe("POST /backups/:id/restore y /import/json (rol «Administra»)", () => {
  it("respalda antes, borra y vuelve a insertar con SystemScope, con el libro de la ruta y las referencias limpias", async () => {
    const b = await saveBackup()
    const r = await t.call("POST", U(`/backups/${b.id}/restore`), "admin")
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ ok: true, data: { tablas: BOOK_TABLES.length, filas: 2 } })
    expect(t.fx.backups.saved.map((s) => s.tipo)).toEqual(["manual", "antes_restaurar"])
    expect(JSON.parse(t.fx.backups.saved[1].body)).toMatchObject({ v: 5, book_id: B_GRATIS, data: { expenses: [{ id: G1 }, { id: id(4) }] } })
    expect(t.fx.rows.all("expenses")).toMatchObject([{ id: id(10), book_id: B_GRATIS, payment_method_id: null, member_id: FAM }])
    expect(t.fx.rows.all("incomes")).toEqual([])
    expect(t.fx.rows.all("categories")).toMatchObject([{ id: CAT, book_id: B_GRATIS }])
    expect(t.fx.rows.all("book_settings").find((s) => s.book_id === B_GRATIS)).toEqual({ book_id: B_GRATIS, umbral: 99000 })
    expect(new Set(t.fx.rows.calls.map((c) => c.scope.kind))).toEqual(new Set(["system"]))
    expect(t.changes.some((c) => c.table === "expenses" && c.bookId === B_GRATIS)).toBe(true)
  })

  it("Colabora no puede; respaldo de otro hogar o que no es v5 → 400 con el mensaje de la web (sin borrar nada)", async () => {
    expect((await t.call("POST", U("/import/json"), "editor", { json: JSON.stringify(dumpOf()) })).status).toBe(403)
    const otro = await t.call("POST", U("/import/json"), "admin", { json: JSON.stringify(dumpOf({ household_id: H_PREMIUM })) })
    expect(otro.status).toBe(400)
    expect(otro.body.msg).toBe("Este respaldo es de otro hogar. Para traer datos de otro hogar usa Importar.")
    const v4 = await t.call("POST", U("/import/json"), "admin", { json: JSON.stringify({ v: 3, cfg: {} }) })
    expect(v4.body.msg).toBe("No es un respaldo de Mirai 5. Para respaldos de la versión anterior usa Importar.")
    const roto = await t.call("POST", U("/import/json"), "admin", { json: "{no es json" })
    expect(roto.body).toMatchObject({ code: "VALIDATION", msg: "El archivo no es un JSON válido" })
    expect(t.fx.rows.all("expenses")).toHaveLength(2)
    expect(t.fx.backups.saved).toEqual([])
  })

  it("restaurar un JSON válido del mismo hogar funciona igual que un respaldo guardado", async () => {
    const r = await t.call("POST", U("/import/json"), "owner", { json: JSON.stringify(dumpOf()) })
    expect(r.body).toMatchObject({ ok: true, data: { filas: 2 } })
  })
})

describe("DELETE /backups/:id (rol «Administra»)", () => {
  it("borra archivo y fila; repetirlo no falla; Colabora no puede", async () => {
    const b = await saveBackup()
    expect((await t.call("DELETE", U(`/backups/${b.id}`), "editor")).status).toBe(403)
    expect((await t.call("DELETE", U(`/backups/${b.id}`), "admin")).body).toEqual({ ok: true, data: { deleted: true } })
    expect(t.fx.backups.removed).toEqual([b.path])
    expect((await t.call("DELETE", U(`/backups/${b.id}`), "admin")).body).toEqual({ ok: true, data: { deleted: false } })
  })
})

describe("POST /data/format (formatBlocks)", () => {
  it("exige BORRAR, respalda antes y manda a la papelera solo lo vivo de los bloques escogidos (SystemScope)", async () => {
    const mal = await t.call("POST", U("/data/format"), "admin", { blocks: ["gastos"], confirm: "borrar no" })
    expect(mal.body).toMatchObject({ code: "VALIDATION", msg: "Escribe BORRAR para confirmar" })
    expect((await t.call("POST", U("/data/format"), "admin", { blocks: ["nada"], confirm: "BORRAR" })).status).toBe(400)
    expect((await t.call("POST", U("/data/format"), "editor", { blocks: ["gastos"], confirm: "BORRAR" })).status).toBe(403)

    const r = await t.call("POST", U("/data/format"), "admin", { blocks: ["gastos"], confirm: " borrar " })
    expect(r.body).toEqual({ ok: true, data: { borrados: 1 } })
    expect(t.fx.backups.saved.map((s) => s.tipo)).toEqual(["antes_restaurar"])
    const [g1, pan] = t.fx.rows.all<{ deleted_at: string | null }>("expenses")
    expect(g1.deleted_at).toBeTruthy()
    expect(pan.deleted_at).toBe("2026-01-01T00:00:00Z")
    expect(t.fx.rows.all("incomes")[0].deleted_at).toBeNull()
    expect(t.fx.rows.scopesOf("expenses")).toEqual(["system"])
  })
})

const V4 = {
  v: 3,
  cfg: { categorias: [{ nombre: "Mercado", grupo: "n" }], medios: [{ nombre: "Efectivo" }], umbral: 30000 },
  perfil: { miembros: [{ id: "m1", nombre: "Ana", rol: "Titular", cupo: 5 }, { id: "m2", nombre: "Leo", rol: "Hijo" }] },
  gastos: [{ id: "g1", fecha: "2026-10-01", desc: "Mercado", cat: "Mercado", valor: 80000, medio: "Efectivo", quien: "m2" }],
  grupos: [{ nombre: "Paseo", personas: ["Ana"], gastos: [] }],
}

describe("POST /import/v4 (importV4Backup)", () => {
  it("Colabora importa con su sesión (UserScope): catálogos por nombre, titular y gastos", async () => {
    const r = await t.call("POST", U("/import/v4"), "editor", { json: JSON.stringify(V4) })
    expect(r.status).toBe(200)
    expect(r.body.data).toEqual({ family_members: 1, categories: 1, payment_methods: 1, expenses: 1, shared_groups: 1 })
    const [gasto] = t.fx.rows.all<Record<string, unknown>>("expenses").filter((g) => g.origen === "importar")
    const cat = t.fx.rows.all<{ id: string; nombre: string }>("categories")[0]
    const leo = t.fx.rows.all<{ id: string; nombre: string }>("family_members").find((m) => m.nombre === "Leo")!
    expect(gasto).toMatchObject({ book_id: B_GRATIS, descripcion: "Mercado", valor: 80000, category_id: cat.id, member_id: leo.id })
    expect(t.fx.rows.all("family_members").find((m) => m.id === FAM)).toMatchObject({ cupo: 5 })
    expect(t.fx.rows.all("book_settings").find((s) => s.book_id === B_GRATIS)).toMatchObject({ umbral: 30000 })
    expect(new Set(t.fx.rows.calls.map((c) => c.scope.kind))).toEqual(new Set(["user"]))
    expect(t.fx.rows.calls.every((c) => c.scope.kind === "user" && c.scope.userId === USERS.editor)).toBe(true)
  })

  it("con premium_db y plan Gratis deja por fuera los grupos (familia) y la renta", async () => {
    t.fx.rows.seed("platform_settings", [{ id: true, premium_db: true }])
    const r = await t.call("POST", U("/import/v4"), "editor", { json: JSON.stringify({ S: { ...V4, renta: { 2025: {} } } }) })
    expect(r.body.data).not.toHaveProperty("shared_groups")
    expect(t.fx.rows.all("shared_groups")).toEqual([])
  })

  it("Registra sus gastos no puede; un archivo que no es de la v4 → 400 en español", async () => {
    expect((await t.call("POST", U("/import/v4"), "registra", { json: JSON.stringify(V4) })).status).toBe(403)
    const r = await t.call("POST", U("/import/v4"), "editor", { json: JSON.stringify({ hola: 1 }) })
    expect(r.body).toMatchObject({ code: "VALIDATION", msg: "No parece un respaldo de Mirai 4.0" })
    expect((await t.call("POST", U("/import/v4"), "editor", { json: "" })).body.code).toBe("VALIDATION")
  })
})

describe("POST /import/sample (loadSampleBook)", () => {
  it("con el plan Gratis (1 libro) → 402 con el mensaje de createBook", async () => {
    const r = await t.call("POST", U("/import/sample"), "editor")
    expect(r.status).toBe(402)
    expect(r.body).toMatchObject({ code: "PLAN_REQUIRED", msg: "Tu plan incluye 1 libro(s) de cuentas. Cambia de plan para llevar también tu negocio o tus arriendos." })
    expect(t.fx.rows.rpcs).toEqual([])
  })

  it("crea el libro en el hogar de la ruta (create_book con la sesión), lo marca como ejemplo e importa con fechas al día; idempotente", async () => {
    t.fx.rows.rpcImpl.create_book = () => NEW_BOOK
    const key = { "idempotency-key": "ejemplo-navarro-0001" }
    const r = await t.call("POST", U("/import/sample", B_PREMIUM), "owner", undefined, key)
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({ bookId: NEW_BOOK })
    const report = (r.body.data as { report: Record<string, number> }).report
    expect(report.expenses).toBeGreaterThan(0)
    expect(t.fx.rows.rpcs).toEqual([{ fn: "create_book", args: { p_household: H_PREMIUM, p_nombre: "Ejemplo · familia Navarro", p_tipo: "otro", p_icon: "sparkles" }, scope: expect.objectContaining({ kind: "user", userId: USERS.owner }) }])
    const gastos = t.fx.rows.all<{ book_id: string; fecha: string }>("expenses").filter((g) => g.book_id === NEW_BOOK)
    expect(gastos).toHaveLength(report.expenses)
    // Fechas corridas: el gasto más reciente del ejemplo queda cerca de hoy (no en octubre de 2026).
    const ultima = gastos.map((g) => g.fecha).sort().at(-1)!
    expect(Math.abs(new Date(ultima).getTime() - Date.now()) / 864e5).toBeLessThan(40)

    const again = await t.call("POST", U("/import/sample", B_PREMIUM), "owner", undefined, key)
    expect(again.body).toEqual(r.body)
    expect(again.headers["idempotent-replayed"]).toBe("true")
    expect(t.fx.rows.rpcs).toHaveLength(1)
  })

  it("si la base rechaza crear el libro (sin permiso) → 403 en español", async () => {
    // Como los adaptadores reales: el texto de la función de la base pasa por rowStoreError.
    t.fx.rows.rpcImpl.create_book = () => {
      throw rowStoreError({ code: "P0001", message: "No tienes permiso en este hogar" })
    }
    const r = await t.call("POST", U("/import/sample", B_PREMIUM), "owner")
    expect(r.status).toBe(403)
    expect(r.body).toMatchObject({ code: "ROLE_DENIED", msg: "Tu rol no permite hacer esto en este hogar." })
    expect(t.fx.rows.all("expenses").filter((g) => g.book_id === NEW_BOOK)).toEqual([])
  })
})

describe("GET /v1/account/export (exportMyData)", () => {
  beforeEach(() => {
    t.fx.rows.seed("profiles", [{ id: USERS.owner, nombre: "Ana" }, { id: USERS.editor, nombre: "Edi" }])
    t.fx.rows.seed("user_preferences", [{ user_id: USERS.editor, theme: "dark" }])
    t.fx.rows.seed("consents", [{ id: id(20), user_id: USERS.editor, document: "terminos" }, { id: id(21), user_id: USERS.owner, document: "terminos" }])
    t.fx.rows.seed("household_members", [{ household_id: H_GRATIS, user_id: USERS.editor, role: "editor", created_at: "2026-01-01" }])
    t.fx.rows.seed("push_subscriptions", [{ user_id: USERS.editor, user_agent: "Firefox", created_at: "2026-01-02", endpoint: "https://secreto" }])
  })

  it("Colabora: sus datos y solo los movimientos que registró (nunca los de otros); SystemScope filtrado por la persona", async () => {
    const r = await t.call("GET", "/v1/account/export", "editor")
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({
      cuenta: { email: "editor@correo.co" }, perfil: { id: USERS.editor, nombre: "Edi" }, preferencias: { theme: "dark" },
      consentimientos: [{ document: "terminos", user_id: USERS.editor }], hogares: [{ household_id: H_GRATIS, role: "editor", created_at: "2026-01-01" }],
      avisos: [], dispositivos_push: [{ user_agent: "Firefox", created_at: "2026-01-02" }], telegram: null,
    })
    expect(JSON.stringify(r.body)).not.toContain("https://secreto")
    const libros = r.body.libros as { book_id: string; solo_mis_registros?: boolean; data: { expenses: { id: string }[] } }[]
    expect(libros).toHaveLength(1)
    expect(libros[0]).toMatchObject({ book_id: B_GRATIS, solo_mis_registros: true })
    expect(libros[0].data.expenses.map((g) => g.id)).toEqual([id(4)])
    expect(new Set(t.fx.rows.calls.map((c) => c.scope.kind))).toEqual(new Set(["system"]))
  })

  it("Dueño: libros completos (BookDump v5) de sus hogares", async () => {
    const r = await t.call("GET", "/v1/account/export", "owner")
    const libros = r.body.libros as { app?: string; v?: number; book_id: string; data: { expenses: unknown[] } }[]
    expect(libros.map((l) => [l.book_id, l.app, l.v])).toEqual([[B_GRATIS, "mirai", 5], [B_PREMIUM, "mirai", 5]])
    expect(libros[0].data.expenses).toHaveLength(2)
  })

  it("sin sesión → 401", async () => {
    expect((await t.call("GET", "/v1/account/export", null)).status).toBe(401)
  })
})
