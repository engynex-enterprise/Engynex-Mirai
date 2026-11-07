// V7-H2: endpoints que faltaban para que Ajustes, Puesta en marcha, Logros, Perfil, Planeación, Agenda, Renta y
// Reportes de la web dejen de leer la base directo. App real con RowStore en memoria y dobles de los repositorios de
// logros, hogares y contador: todo con la sesión de la persona (la RLS vuelve a revisar), roles y errores en español.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { RentaData } from "@mirai/domain/integral-extras"
import type { DbScope } from "../../src/core/db/scope"
import { GamiRepo } from "../../src/modules/gami/gami.repository"
import { HouseholdsRepo } from "../../src/modules/households/households.repository"
import { AccountantRepo } from "../../src/modules/tax/accountant.repository"
import { familyRow, FakeAccountantRepo, FakeHouseholdsRepo } from "../f2i/fakes"
import { B_AJENO, B_GRATIS, H_GRATIS, H_PREMIUM, USERS } from "../setup/fixtures"
import { FakeGamiRepo } from "../setup/read-fakes"
import { createV7gApp, type V7gApp } from "./app"

class SpyAccountantRepo extends FakeAccountantRepo {
  rentaCalls: { scope: DbScope; bookId: string; ownerId: string | null; opts?: { todos?: boolean } }[] = []
  override async renta(scope?: DbScope, bookId?: string, ownerId?: string | null, opts?: { todos?: boolean }): Promise<RentaData> {
    this.rentaCalls.push({ scope: scope!, bookId: bookId!, ownerId: ownerId ?? null, opts })
    return super.renta()
  }
}

let t: V7gApp
const gami = new FakeGamiRepo()
const households = new FakeHouseholdsRepo()
const accountant = new SpyAccountantRepo()
const B = `/v1/books/${B_GRATIS}`
const FAM = "f0000000-0000-4000-8000-000000000001"
const live = { book_id: B_GRATIS, deleted_at: null }
const gone = { book_id: B_GRATIS, deleted_at: "2026-10-01T00:00:00Z" }

beforeAll(async () => {
  t = await createV7gApp({ overrides: [[GamiRepo, gami], [HouseholdsRepo, households], [AccountantRepo, accountant]] })
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.fx.rows.reset()
  households.family_ = [
    familyRow({ id: FAM, household_id: H_GRATIS, nombre: "Lucía", sort: 1 }),
    familyRow({ id: "f0000000-0000-4000-8000-000000000002", household_id: H_GRATIS, nombre: "Borrado", deleted_at: "2026-10-01T00:00:00Z" }),
    familyRow({ id: "f0000000-0000-4000-8000-000000000003", household_id: H_PREMIUM, nombre: "Ajeno" }),
  ]
  households.calls = []
  accountant.rentaCalls = []
})

describe("GET /v1/books/:bookId/audit", () => {
  beforeEach(() => {
    t.fx.rows.seed("profiles", [{ id: USERS.owner, nombre: "Ana", email: "owner@correo.co" }, { id: USERS.editor, nombre: "", email: "editor@correo.co" }])
    t.fx.rows.seed("audit_log", [
      { id: 1, book_id: B_GRATIS, tabla: "expenses", accion: "insert", actor: USERS.owner, resumen: "Mercado", created_at: "2026-10-01T10:00:00Z" },
      { id: 2, book_id: B_GRATIS, tabla: "goals", accion: "update", actor: USERS.editor, resumen: null, created_at: "2026-10-02T10:00:00Z" },
      { id: 3, book_id: B_GRATIS, tabla: "incomes", accion: "delete", actor: null, resumen: "Sueldo", created_at: "2026-10-03T10:00:00Z" },
      { id: 4, book_id: B_AJENO, tabla: "expenses", accion: "insert", actor: USERS.owner, resumen: "Ajeno", created_at: "2026-10-04T10:00:00Z" },
    ])
  })

  it("del más reciente, con el nombre (o correo) de quien lo hizo y «Sistema» sin persona; solo este libro", async () => {
    const r = await t.call("GET", `${B}/audit`, "viewer")
    expect(r.status).toBe(200)
    expect((r.body as unknown as { id: string; quien: string }[]).map((x) => [x.id, x.quien])).toEqual([["3", "Sistema"], ["2", "editor@correo.co"], ["1", "Ana"]])
    expect(t.fx.rows.calls.every((c) => c.scope.kind === "user" && c.scope.userId === USERS.viewer)).toBe(true)
  })

  it("respeta el límite y lo valida en español", async () => {
    expect((await t.call("GET", `${B}/audit?limit=1`, "viewer")).body).toHaveLength(1)
    const bad = await t.call("GET", `${B}/audit?limit=0`, "viewer")
    expect(bad.status).toBe(400)
    expect(JSON.stringify(bad.body)).toContain("Mínimo 1")
  })

  it("un libro ajeno no se ve", async () => {
    expect((await t.call("GET", `/v1/books/${B_AJENO}/audit`, "viewer")).status).toBe(404)
    expect((await t.call("GET", `${B}/audit`, null)).status).toBe(401)
  })
})

describe("GET /v1/books/:bookId/setup-counts", () => {
  it("cuenta solo lo vivo de este libro: cuentas 11…, deudas y préstamos por tipo, topes > 0, contactos", async () => {
    const r = t.fx.rows
    r.seed("incomes", [{ id: "i1", ...live }, { id: "i2", ...gone }])
    r.seed("fixed_expenses", [{ id: "x1", ...live }])
    r.seed("expenses", [{ id: "e1", ...live }, { id: "e2", ...live }, { id: "e3", book_id: B_AJENO, deleted_at: null }])
    r.seed("goals", [])
    r.seed("assets", [{ id: "a1", cod: "1105", ...live }, { id: "a2", cod: "11", ...live }, { id: "a3", cod: "1516", ...live }, { id: "a4", cod: "1110", ...gone }])
    r.seed("loans", [{ id: "l1", kind: "pagar", ...live }, { id: "l2", kind: "cobrar", ...live }, { id: "l3", kind: "cobrar", ...live }])
    r.seed("categories", [{ id: "c1", tope: 0, ...live }, { id: "c2", tope: 500000, ...live }])
    r.seed("contacts", [{ id: "k1", ...live }])
    const res = await t.call("GET", `${B}/setup-counts`, "registra")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ingresos: 1, fijos: 1, gastos: 2, metas: 0, cuentas: 2, deudas: 1, prestamos: 2, topes: 1, contactos: 1 })
    expect(r.calls.every((c) => c.scope.kind === "user")).toBe(true)
  })
})

describe("GET /v1/books/:bookId/month-summaries/:mes", () => {
  it("el resumen guardado del mes, o null; mes inválido → 400", async () => {
    t.fx.rows.seed("monthly_summaries", [{ id: "s1", mes: "2026-10", contenido: { titular: "Buen mes" }, ...live }, { id: "s2", mes: "2026-09", contenido: { titular: "Borrado" }, ...gone }])
    expect((await t.call("GET", `${B}/month-summaries/2026-10`, "viewer")).body).toEqual({ contenido: { titular: "Buen mes" } })
    expect((await t.call("GET", `${B}/month-summaries/2026-09`, "viewer")).body).toEqual({ contenido: null })
    expect((await t.call("GET", `${B}/month-summaries/2026-13`, "viewer")).status).toBe(400)
  })
})

describe("GET /v1/me/telegram", () => {
  it("dice si el chat propio está vinculado, sin el id del chat", async () => {
    t.fx.rows.seed("telegram_links", [{ user_id: USERS.owner, chat_id: "987654", linked_at: "2026-10-01T00:00:00Z" }, { user_id: USERS.viewer, chat_id: null, linked_at: null }])
    const r = await t.call("GET", "/v1/me/telegram", "owner")
    expect(r.body).toEqual({ linked: true, linked_at: "2026-10-01T00:00:00Z" })
    expect(JSON.stringify(r.body)).not.toContain("987654")
    expect((await t.call("GET", "/v1/me/telegram", "viewer")).body).toEqual({ linked: false, linked_at: null })
    expect((await t.call("GET", "/v1/me/telegram", "editor")).body).toEqual({ linked: false, linked_at: null })
    expect(t.fx.rows.scopesOf("telegram_links").every((s) => s === "user")).toBe(true)
  })
})

describe("GET /v1/books/:bookId/gami/state", () => {
  it("el estado guardado tal cual (la web calcula), con la sesión de la persona", async () => {
    gami.calls = []
    const r = await t.call("GET", `${B}/gami/state`, "viewer")
    expect(r.status).toBe(200)
    expect(r.body).toEqual(gami.st)
    expect(gami.calls).toMatchObject([{ m: "state", q: { bookId: B_GRATIS, userId: USERS.viewer }, scope: { kind: "user" } }])
    expect((await t.call("GET", `/v1/books/${B_AJENO}/gami/state`, "viewer")).status).toBe(404)
  })
})

describe("GET /v1/books/:bookId/renta", () => {
  it("la Declaración del titular: su perfil y todos los documentos, con su sesión", async () => {
    const r = await t.call("GET", `${B}/renta`, "viewer")
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ perfil: { nombre: "Ana" }, liabilitiesNamed: [] })
    expect(accountant.rentaCalls).toHaveLength(1)
    expect(accountant.rentaCalls[0]).toMatchObject({ bookId: B_GRATIS, ownerId: USERS.viewer, opts: { todos: true }, scope: { kind: "user", userId: USERS.viewer } })
  })

  it("un libro ajeno → 404 sin leer nada", async () => {
    expect((await t.call("GET", `/v1/books/${B_AJENO}/renta`, "owner")).status).toBe(404)
    expect(accountant.rentaCalls).toEqual([])
  })
})

describe("integrantes del hogar", () => {
  const F = `/v1/households/${H_GRATIS}/family`

  it("GET: los vivos del hogar, para cualquier integrante", async () => {
    const r = await t.call("GET", F, "viewer")
    expect(r.status).toBe(200)
    expect((r.body as unknown as { nombre: string }[]).map((f) => f.nombre)).toEqual(["Lucía"])
    expect(households.calls.find((c) => c.m === "family")?.scope).toBe("user")
    expect((await t.call("GET", `/v1/households/${H_PREMIUM}/family`, "viewer")).status).toBe(404)
  })

  it("PATCH: «Colabora» cambia el cupo y los datos de dependiente; «Registra» no", async () => {
    const ok = await t.call("PATCH", `${F}/${FAM}`, "editor", { cupo: 300000, dep_de: null, estudia: true, doc: "TI 123" })
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({ ok: true, data: { id: FAM, msg: "Guardado" } })
    expect(households.family_[0]).toMatchObject({ cupo: 300000, estudia: true, doc: "TI 123", nombre: "Lucía" })
    expect(households.calls.find((c) => c.m === "patchFamily")?.scope).toBe("user")
    const no = await t.call("PATCH", `${F}/${FAM}`, "registra", { cupo: 1 })
    expect(no.status).toBe(403)
    expect(no.body).toMatchObject({ code: "ROLE_DENIED" })
  })

  it("PATCH: integrante borrado o de otro hogar → 404; nada para guardar o campos raros → 400", async () => {
    expect((await t.call("PATCH", `${F}/f0000000-0000-4000-8000-000000000002`, "editor", { cupo: 1 })).body).toMatchObject({ code: "NOT_FOUND", msg: "Ese integrante ya no está en el hogar." })
    expect((await t.call("PATCH", `${F}/f0000000-0000-4000-8000-000000000003`, "editor", { cupo: 1 })).status).toBe(404)
    expect((await t.call("PATCH", `${F}/${FAM}`, "editor", {})).status).toBe(400)
    const neg = await t.call("PATCH", `${F}/${FAM}`, "editor", { cupo: -5 })
    expect(neg.status).toBe(400)
    expect(JSON.stringify(neg.body)).toContain("El valor no puede ser negativo")
  })
})
