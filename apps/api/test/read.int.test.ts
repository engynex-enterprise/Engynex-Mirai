// Integración de punta a punta de F2-C (lecturas) con la app real sobre Fastify y dobles en los puertos:
// - cada ruta del libro: "Solo mira" lee (200) y quien no es miembro recibe 404 (BookGuard), con el JWT de la persona;
// - paridad: las vistas de la API dan EXACTAMENTE lo que calcula la web con el libro de ejemplo de la v4
//   (apps/web/lib/data/sample-v4.json) y los extras del flujo integral (impuestos estimados, renta, mesadas y fondo).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ApiError } from "@mirai/contracts/common"
import { agenda, notifs } from "@mirai/domain/agenda"
import { assembleBook } from "@mirai/domain/book-data"
import { proyeccionMeses } from "@mirai/domain/dashboard"
import { estadoIntegral, flujoIntegral, partesEstado, periodo } from "@mirai/domain/flujo-integral"
import { GBADGES, gamiXP, nivel } from "@mirai/domain/gami"
import { healthScore, indicadores } from "@mirai/domain/indicators"
import { insights } from "@mirai/domain/insights"
import { integralExtras, rentaDataFrom } from "@mirai/domain/integral-extras"
import { reportData } from "@mirai/domain/report"
import { vistaBalance, vistaDashboard, vistaInicio } from "@mirai/domain/vistas"
import { B_AJENO, B_GRATIS, B_PREMIUM, USERS } from "./setup/fixtures"
import { createReadApp, type ReadApp } from "./setup/read-fakes"
import { SAMPLE_HOY as HOY, sampleExtras, sampleParts, sampleRenta } from "./setup/sample-book"
import { userToken } from "./setup/tokens"

let t: ReadApp
const auth = async (role: keyof typeof USERS) => ({ authorization: `Bearer ${await userToken(USERS[role])}` })
const req = async (method: "GET" | "PATCH" | "POST", url: string, role: keyof typeof USERS = "viewer") => t.app.inject({ method, url, headers: await auth(role) })
const get = (url: string, role?: keyof typeof USERS) => req("GET", url, role)
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v))

beforeAll(async () => {
  t = await createReadApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  for (const f of [t.tables, t.insights, t.refs, t.gami, t.ads, t.bell]) f.calls.length = 0
  t.bell.reset()
  t.insights.rentaRows = sampleRenta()
})

const B = `/v1/books/${B_GRATIS}`
const BOOK_ROUTES = [
  "/t/expenses", "/snapshot", "/views/flujo-integral", "/views/estado-integral", "/views/inicio", "/views/balance", "/views/dashboard",
  "/views/proyeccion", "/views/indicadores", "/views/agenda", "/views/hallazgos", "/reports/2026-10", "/gami", "/ads/eligible?slot=inicio",
]

describe("rutas del libro: rol y membresía (BookGuard)", () => {
  it("los 5 roles leen; quien no es miembro y un libro ajeno dan 404 sin revelar que existe", async () => {
    for (const r of BOOK_ROUTES) {
      const hoy = /^\/(t|snapshot)\b/.test(r) ? "" : `${r.includes("?") ? "&" : "?"}hoy=${HOY}`
      for (const role of ["viewer", "registra", "owner"] as const) expect((await get(`${B}${r}${hoy}`, role)).statusCode, `${role} ${r}`).toBe(200)
      for (const [role, book] of [["outsider", B_GRATIS], ["viewer", B_PREMIUM], ["owner", B_AJENO]] as const) {
        const res = await get(`/v1/books/${book}${r}`, role)
        expect(res.statusCode, `${role} ${book} ${r}`).toBe(404)
        expect(ApiError.parse(res.json())).toMatchObject({ code: "NOT_FOUND", msg: "No encontramos ese libro." })
      }
    }
  })

  it("los repositorios reciben el alcance de la persona (UserScope con su JWT: la RLS vuelve a filtrar)", async () => {
    await get(`${B}/views/dashboard?hoy=${HOY}`)
    const scopes = [...t.tables.calls, ...t.insights.calls].map((c) => c.scope)
    expect(scopes.length).toBeGreaterThan(19)
    for (const s of scopes) expect(s).toMatchObject({ kind: "user", userId: USERS.viewer })
    expect(t.insights.calls.find((c) => c.m === "extras")?.q).toEqual({ bookId: B_GRATIS, householdId: expect.any(String) })
  })
})

describe("GET /v1/books/:bookId/t/:table (useList)", () => {
  it("select, eq y order con la lista blanca de columnas", async () => {
    const r = await get(`${B}/t/categories?select=id,nombre&order=nombre.desc&eq.grupo=n`)
    expect(r.statusCode).toBe(200)
    const rows = r.json() as { id: string; nombre: string }[]
    expect(rows.length).toBeGreaterThan(1)
    expect(Object.keys(rows[0]).sort()).toEqual(["id", "nombre"])
    expect(rows.map((x) => x.nombre)).toEqual([...rows.map((x) => x.nombre)].sort((a, b) => b.localeCompare(a)))
    expect(t.tables.calls[0].q).toEqual({ bookId: B_GRATIS, table: "categories", select: ["id", "nombre"], eq: [["grupo", "n"]], order: { column: "nombre", ascending: false } })
  })

  it("eq.campo=null filtra los vacíos y sin select trae todo", async () => {
    await get(`${B}/t/expenses?eq.fixed_expense_id=null`)
    expect(t.tables.calls[0].q).toMatchObject({ select: "*", eq: [["fixed_expense_id", null]] })
  })

  it("tabla que no va por el CRUD genérico o no existe: 404; columna o filtro inválido: 400 en español", async () => {
    for (const tb of ["chat_messages", "profiles", "no_existe"]) expect((await get(`${B}/t/${tb}`)).json()).toMatchObject({ code: "NOT_FOUND", msg: "No encontramos esa tabla." })
    const bad = await get(`${B}/t/expenses?select=id,password`)
    expect(bad.statusCode).toBe(400)
    expect(bad.json()).toMatchObject({ code: "VALIDATION", msg: "La columna «password» no existe en expenses.", details: { fields: { select: expect.any(String) } } })
    expect((await get(`${B}/t/expenses?order=valor;drop`)).statusCode).toBe(400)
    expect((await get(`${B}/t/expenses?foo=1`)).json()).toMatchObject({ code: "VALIDATION", msg: expect.stringMatching(/^Filtro desconocido/) })
    expect((await get(`${B}/t/expenses?eq.valor=1&eq.valor=2`)).json()).toMatchObject({ code: "VALIDATION" })
    expect(t.tables.calls).toHaveLength(0)
  })
})

describe("GET /v1/books/:bookId/snapshot (loadBookPart)", () => {
  it("todas las partes por defecto, o solo las pedidas, con los hijos embebidos", async () => {
    const all = (await get(`${B}/snapshot`)).json() as { parts: Record<string, unknown[]> }
    expect(Object.keys(all.parts)).toHaveLength(19)
    expect(json(assembleBook(all.parts as never, HOY))).toEqual(json(assembleBook(sampleParts(B_GRATIS), HOY)))
    const some = (await get(`${B}/snapshot?parts=loans,expenses,loans`)).json() as { parts: Record<string, unknown[]> }
    expect(Object.keys(some.parts)).toEqual(["expenses", "loans"])
    expect((some.parts.loans[0] as { loan_payments: unknown[] }).loan_payments).toBeInstanceOf(Array)
  })
  it("parte desconocida: 400; libro sin ajustes: 404", async () => {
    expect((await get(`${B}/snapshot?parts=expenses,salarios`)).json()).toMatchObject({ code: "VALIDATION", msg: expect.stringMatching(/«salarios» no existe/) })
    const saved = t.tables.books.get(B_GRATIS)!
    t.tables.books.set(B_GRATIS, { ...saved, book_settings: [] })
    try {
      expect((await get(`${B}/snapshot?parts=book_settings`)).json()).toMatchObject({ code: "NOT_FOUND", msg: "No encontramos los ajustes de este libro." })
    } finally {
      t.tables.books.set(B_GRATIS, saved)
    }
  })
})

describe("paridad: vistas de la API = cálculo de la web con el libro de ejemplo", () => {
  // Lo que hace el navegador: useBookData (assembleBook) + useIntegralExtras (con loadRentaData completo).
  const book = assembleBook(sampleParts(B_GRATIS), HOY)
  const renta = rentaDataFrom(book, { ...sampleRenta(), perfil: { nombre: "Alberto Navarro", digitos: "07", doc: "1" }, fechas: [], attachments: [], liabilities: [] })
  const X = integralExtras(book, HOY, { ...sampleExtras(), renta })
  const [y, m] = HOY.split("-").map(Number)
  const v = async (path: string) => {
    const r = await get(`${B}${path}${path.includes("?") ? "&" : "?"}hoy=${HOY}`)
    expect(r.statusCode, path).toBe(200)
    return r.json()
  }

  it("el libro de ejemplo ejercita los extras (predial, vehicular, mesadas y fondo)", () => {
    expect(Object.keys(X.estimados ?? {}).length).toBeGreaterThanOrEqual(2)
    expect(X.mesadas).toHaveLength(1)
    expect(book.expenses.length).toBeGreaterThan(10)
  })

  it("flujo integral: mes (por defecto), quincena, año y rango", async () => {
    expect(await v("/views/flujo-integral")).toEqual(json(flujoIntegral(book, periodo(book, "mes", y, m - 1), HOY, X)))
    expect(await v("/views/flujo-integral?tipo=q1&mes=2026-09")).toEqual(json(flujoIntegral(book, periodo(book, "q1", 2026, 8), HOY, X)))
    expect(await v("/views/flujo-integral?tipo=anio")).toEqual(json(flujoIntegral(book, periodo(book, "anio", y), HOY, X)))
    expect(await v("/views/flujo-integral?tipo=rango&a=2026-08-01&b=2027-01-31")).toEqual(json(flujoIntegral(book, { a: "2026-08-01", b: "2027-01-31", tipo: "rango" }, HOY, X)))
    expect((await get(`${B}/views/flujo-integral?tipo=rango&a=2026-09-01`)).json()).toMatchObject({ code: "VALIDATION", msg: expect.stringMatching(/fecha inicial \(a\) y la final \(b\)/) })
  })

  it("estado integral, Inicio, Balance y Dashboard", async () => {
    const E = estadoIntegral(book, HOY, X)
    expect(await v("/views/estado-integral")).toEqual(json({ estado: E, partes: { tengo: partesEstado(E.tengo), debo: partesEstado(E.debo) } }))
    expect(await v("/views/inicio")).toEqual(json(vistaInicio(book, HOY, X)))
    expect(await v("/views/balance")).toEqual(json(vistaBalance(book, HOY, X, "general", HOY.slice(0, 7))))
    expect(await v("/views/balance?tab=q2&mes=2026-09")).toEqual(json(vistaBalance(book, HOY, X, "q2", "2026-09")))
    const dash = await v("/views/dashboard")
    expect(dash).toEqual(json(vistaDashboard(book, HOY, X, "mes", t.insights.snaps)))
    expect(dash.estado.pat).toBe(E.pat)
    expect(await v("/views/dashboard?periodo=12m")).toEqual(json(vistaDashboard(book, HOY, X, "12m", t.insights.snaps)))
  })

  it("proyección, indicadores, agenda, hallazgos y reporte del mes", async () => {
    const liq = estadoIntegral(book, HOY, X).liquidez
    expect(await v("/views/proyeccion?meses=6")).toEqual(json({ liquidez: liq, meses: proyeccionMeses(book, HOY, X, 6, liq) }))
    const I = indicadores(book, HOY)
    expect(await v("/views/indicadores")).toEqual(json({ indicadores: I, salud: healthScore(I) }))
    expect(await v("/views/agenda")).toEqual(json({ agenda: agenda(book, HOY), avisos: notifs(book, HOY) }))
    const name = (id: string | null | undefined) => book.categories.find((c) => c.id === id)?.nombre ?? "Sin categoría"
    expect(await v("/views/hallazgos")).toEqual(json(insights(book.expenses, name, HOY)))
    expect(await v("/reports/2026-09")).toEqual(json(reportData(book, "2026-09", HOY)))
    expect((await get(`${B}/reports/2026-13`)).statusCode).toBe(400)
  })

  it("si la Declaración no carga, la renta queda sin estimado y la vista igual responde (como loadChatBook)", async () => {
    t.insights.rentaRows = new Error("tax_years caída")
    const sinRenta = integralExtras(book, HOY, { ...sampleExtras(), renta: null })
    expect(await v("/views/flujo-integral?tipo=anio")).toEqual(json(flujoIntegral(book, periodo(book, "anio", y), HOY, sinRenta)))
  })

  it("sin `hoy` usa la fecha de Colombia y solo pide la renta si el calendario la necesita", async () => {
    const r = await get(`${B}/views/estado-integral`)
    expect(r.statusCode).toBe(200)
    expect(t.insights.calls.filter((c) => c.m === "renta")).toHaveLength(1)
    t.insights.calls.length = 0
    await get(`${B}/views/indicadores`)
    expect(t.insights.calls).toHaveLength(0) // indicadores no usa los extras
  })
})

describe("GET /v1/refs/* (datos de referencia)", () => {
  it("con sesión, caché HTTP pública y los filtros validados", async () => {
    const r = await get("/v1/refs/uvt")
    expect(r.statusCode).toBe(200)
    expect(r.headers["cache-control"]).toBe("public, max-age=300, s-maxage=3600")
    expect(r.json()).toEqual([{ year: 2026, valor: 1, fuente: "prueba ref_uvt" }])
    expect((await get("/v1/refs/smmlv")).json()[0].fuente).toBe("prueba ref_smmlv")
    expect((await get("/v1/refs/trm")).json()).toHaveLength(1)
    expect((await get("/v1/refs/trm?limit=2")).json()).toHaveLength(2)
    expect((await get("/v1/refs/usura")).statusCode).toBe(200)
    expect((await get("/v1/refs/festivos?year=2026")).statusCode).toBe(200)
    expect((await get("/v1/refs/renta-calendar?digitos=07&year=2026")).json()).toEqual([{ year: 2026, digitos: "07", regimen: "general", fecha: "2026-08-12" }])
    expect((await get("/v1/refs/renta-regimenes")).statusCode).toBe(200)
    expect(t.refs.calls.find((c) => c.m === "festivos")?.q).toEqual({ year: 2026 })
    expect((await get("/v1/refs/renta-calendar?digitos=7")).json()).toMatchObject({ code: "VALIDATION" })
    expect((await get("/v1/refs/trm?limit=999")).statusCode).toBe(400)
    expect((await t.app.inject({ method: "GET", url: "/v1/refs/uvt" })).statusCode).toBe(401)
  })
})

describe("campana (GET /v1/notifications, PATCH …/:id/read, POST …/read-all)", () => {
  it("solo los avisos de la persona: del libro activo y los generales, los más recientes primero", async () => {
    const r = (await get(`/v1/notifications?bookId=${B_GRATIS}`)).json() as { id: string }[]
    expect(r.map((n) => n.id.slice(-4))).toEqual(["a001", "a002"])
    expect((await get("/v1/notifications")).json()).toHaveLength(3)
    expect((await get("/v1/notifications?sinLeer=1")).json()).toHaveLength(2)
    expect(t.bell.calls[0]).toMatchObject({ scope: { kind: "user", userId: USERS.viewer }, q: { userId: USERS.viewer, bookId: B_GRATIS, sinLeer: false, limit: 50 } })
  })
  it("marcar uno (el de otra persona da 404) y marcar todos", async () => {
    const one = await req("PATCH", "/v1/notifications/00000000-0000-4000-8000-00000000a001/read")
    expect(one.json()).toMatchObject({ ok: true, data: { id: "00000000-0000-4000-8000-00000000a001", read_at: expect.any(String) } })
    const ajena = await req("PATCH", "/v1/notifications/00000000-0000-4000-8000-00000000a004/read")
    expect(ajena.statusCode).toBe(404)
    expect(ajena.json()).toMatchObject({ code: "NOT_FOUND", msg: "No encontramos ese aviso." })
    expect((await req("PATCH", "/v1/notifications/no-es-uuid/read")).statusCode).toBe(400)
    expect((await req("POST", "/v1/notifications/read-all")).json()).toEqual({ ok: true, data: { marcadas: 1 } })
    expect((await get("/v1/notifications?sinLeer=1")).json()).toEqual([])
  })
})

describe("logros y referidos", () => {
  it("GET /v1/books/:bookId/gami = useGami de la web (puntos, nivel, racha e insignias)", async () => {
    const r = await get(`${B}/gami?hoy=${HOY}`)
    expect(r.statusCode).toBe(200)
    const g = r.json()
    const book = assembleBook(sampleParts(B_GRATIS), HOY)
    const st = t.gami.st
    const xp = gamiXP({ book, perfilNombre: st.nombre, fondo: st.fondo, retos: st.retos, consejos: st.consejos, chats: st.chats, visitas: st.visitas, unl: st.unl, mis: st.mis }, HOY)
    expect(g.xp).toEqual(json(xp))
    expect(g.nivel).toEqual(json(nivel(xp.total)))
    expect(g).toMatchObject({ on: true, hoy: HOY, racha: 3, rachaMax: 3, estado: { visitas: 4, chats: 2, consejos: 1 } })
    expect(g.misiones).toHaveLength(3)
    expect(g.misiones[0]).not.toHaveProperty("prog")
    expect(g.insignias).toHaveLength(GBADGES.length)
    expect(g.insignias.find((b: { id: string }) => b.id === GBADGES[0].id)).toMatchObject({ unlocked_at: "2026-10-01T00:00:00Z", tier: GBADGES[0].tier })
    expect(g.pendientes.badges).not.toContain(GBADGES[0].id)
    expect(t.gami.calls[0].q).toEqual({ bookId: B_GRATIS, userId: USERS.viewer })
  })

  it("GET /v1/me/referrals: crea el código la primera vez (reintenta si choca) y solo muestra el primer nombre", async () => {
    t.gami.colisiones = 1
    const r = (await get("/v1/me/referrals", "editor")).json()
    expect(r).toMatchObject({ activo: true, dias: 15, plan: "Premium", max: 12, ruta: `/registro?ref=${r.codigo}` })
    expect(r.codigo).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    expect(r.invitados).toEqual([{ id: "r1", nombre: "Laura", estado: "premiado", fecha: "2026-10-01T00:00:00Z" }, { id: "r2", nombre: "Alguien", estado: "pendiente", fecha: "2026-09-01T00:00:00Z" }])
    expect(t.gami.calls.filter((c) => c.m === "crearCodigo")).toHaveLength(2)
    for (const c of t.gami.calls) expect(c.scope).toMatchObject({ kind: "system", reason: expect.stringMatching(/^referidos/) })
    const again = (await get("/v1/me/referrals", "editor")).json()
    expect(again.codigo).toBe(r.codigo)
    expect(t.gami.calls.filter((c) => c.m === "crearCodigo")).toHaveLength(2)
  })
})

describe("GET /v1/books/:bookId/ads/eligible", () => {
  it("segmenta por plan del hogar del libro y dispositivo, respeta la frecuencia y las fechas", async () => {
    const g = (await get(`${B}/ads/eligible?slot=inicio&hoy=${HOY}`)).json()
    expect(g).toMatchObject({ planAds: true, candidatos: 1, ad: { id: "a-gratis" }, adsenseTurno: false })
    const p = (await get(`/v1/books/${B_PREMIUM}/ads/eligible?slot=inicio&device=movil&hoy=${HOY}`, "owner")).json()
    expect(p).toMatchObject({ planAds: false, candidatos: 1, ad: { id: "a-premium" } })
    expect((await get(`/v1/books/${B_PREMIUM}/ads/eligible?slot=inicio&hoy=${HOY}`, "owner")).json()).toMatchObject({ candidatos: 0, ad: null })
    expect((await get(`${B}/ads/eligible?slot=otro`)).statusCode).toBe(400)
  })
})

describe("OpenAPI", () => {
  it("/docs/openapi.json incluye las rutas de F2-C", async () => {
    const doc = (await t.app.inject({ method: "GET", url: "/docs/openapi.json" })).json()
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining([
      "/v1/books/{bookId}/t/{table}", "/v1/books/{bookId}/snapshot", "/v1/books/{bookId}/views/dashboard", "/v1/books/{bookId}/views/balance",
      "/v1/books/{bookId}/reports/{mes}", "/v1/refs/uvt", "/v1/notifications", "/v1/notifications/{id}/read", "/v1/books/{bookId}/gami", "/v1/me/referrals", "/v1/books/{bookId}/ads/eligible",
    ]))
  })
})
