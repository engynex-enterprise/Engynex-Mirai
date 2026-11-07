// V7-H2: Ajustes, Planeación, Renta y Logros por la API. Apagado = la consulta de siempre a Supabase (mismos
// argumentos); encendido = la API (y en las lecturas, Supabase si la API no responde; las escrituras nunca se repiten).
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/errors"

const on = { mods: new Set<string>() }
const res = (body: unknown, status = 200) => ({ status, body, headers: new Headers() })

// Supabase de mentiras: cada cadena termina en una promesa con { data, error } y guarda la tabla y las llamadas.
const sb = { calls: [] as unknown[][], data: null as unknown, error: null as null | { message: string } }
function chain(table: string): Record<string, unknown> {
  const q: Record<string, unknown> = {}
  for (const m of ["select", "eq", "is", "in", "order", "limit", "update", "upsert", "insert", "not", "gt", "like"]) q[m] = (...a: unknown[]) => { sb.calls.push([table, m, ...a]); return q }
  q.maybeSingle = async () => ({ data: sb.data, error: sb.error })
  q.single = async () => ({ data: sb.data, error: sb.error })
  q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: sb.data, error: sb.error }).then(r)
  return q
}
const from = vi.fn((t: string) => chain(t))

const api = {
  notify: { getMyRule: vi.fn(), putMyRule: vi.fn() },
  me: { telegram: vi.fn(), preferences: vi.fn(), updatePreferences: vi.fn() },
  importer: { backups: vi.fn() },
  books: { audit: vi.fn(), settings: vi.fn(), updateSettings: vi.fn() },
  budget: { tope: vi.fn() },
  bookTables: { upsert: vi.fn(), remove: vi.fn(), restore: vi.fn() },
  gami: { state: vi.fn() },
}

vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({ from }) }))
vi.mock("@/lib/auth/provider", () => ({ isMiraiAuth: () => false }))
vi.mock("@/lib/api/session", () => ({ apiOn: (m: string, d?: string) => on.mods.has(m) || (d ? on.mods.has(`${m}:${d}`) : false) }))
vi.mock("@/lib/api/client", async () => ({ ...(await import("@/lib/api/unwrap")), browserApi: () => api }))

const S = await import("./api")
const P = await import("./prefs")
const { saveTope } = await import("@/features/planning/api")
const R = await import("@/features/renta/api")
const { fetchGamiState } = await import("@/features/gami/use-gami")

beforeEach(() => {
  vi.clearAllMocks()
  on.mods = new Set()
  sb.calls = []
  sb.data = null
  sb.error = null
})

describe("reglas de aviso y Telegram (interruptor notify)", () => {
  it("apagado: notification_rules y telegram_links con Supabase", async () => {
    sb.data = { ocultar_montos: true }
    expect(await S.fetchMyRule("u1", "b1")).toEqual({ ocultar_montos: true })
    await S.saveMyRule("u1", "b1", { ocultar_montos: false })
    expect(sb.calls).toContainEqual(["notification_rules", "upsert", { user_id: "u1", book_id: "b1", ocultar_montos: false }])
    sb.data = { chat_id: 99 }
    expect(await S.fetchTelegramLinked("u1")).toBe(true)
    expect(api.notify.getMyRule).not.toHaveBeenCalled()
  })

  it("encendido: la API, sin los campos que pone el servidor; un error de la API no se repite por Supabase", async () => {
    on.mods.add("notify")
    api.notify.getMyRule.mockResolvedValue(res({ hora: 7 }))
    expect(await S.fetchMyRule("u1", "b1")).toEqual({ hora: 7 })
    api.notify.putMyRule.mockResolvedValue(res({}))
    await S.saveMyRule("u1", "b1", { hora: 8, last_sent: { a: "x" }, user_id: "u1" })
    expect(api.notify.putMyRule).toHaveBeenCalledWith({ params: { bookId: "b1" }, body: { hora: 8 } })
    api.notify.putMyRule.mockResolvedValue(res({ ok: false, code: "VALIDATION", msg: "Escribe un correo válido" }, 400))
    await expect(S.saveMyRule("u1", "b1", { email_to: "x" })).rejects.toThrow("Escribe un correo válido")
    api.me.telegram.mockResolvedValue(res({ linked: false, linked_at: null }))
    expect(await S.fetchTelegramLinked("u1")).toBe(false)
    expect(from).not.toHaveBeenCalled()
  })

  it("encendido: si la API no responde, la lectura sale de Supabase", async () => {
    on.mods.add("notify")
    api.notify.getMyRule.mockRejectedValue(ApiError.network())
    sb.data = { hora: 5 }
    expect(await S.fetchMyRule("u1", "b1")).toEqual({ hora: 5 })
    expect(from).toHaveBeenCalledWith("notification_rules")
  })
})

describe("respaldos e historial (importer, books)", () => {
  it("respaldos: sin permiso de «Administra» la API dice 403 y la lista queda vacía", async () => {
    on.mods.add("importer")
    api.importer.backups.mockResolvedValue(res({ ok: false, code: "ROLE_DENIED", msg: "No" }, 403))
    expect(await S.fetchBackups("b1")).toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it("historial por la API con el límite", async () => {
    on.mods.add("books")
    api.books.audit.mockResolvedValue(res([{ id: "1", quien: "Ana" }]))
    expect(await S.fetchAudit("b1", 25)).toEqual([{ id: "1", quien: "Ana" }])
    expect(api.books.audit).toHaveBeenCalledWith({ params: { bookId: "b1" }, query: { limit: 25 } })
  })
})

describe("preferencias y ajustes del libro (me, books)", () => {
  it("apagado: upsert y update de siempre", async () => {
    await P.savePrefs("u1", { theme: "dark" })
    await P.saveBookSettings("b1", { gami: false })
    expect(sb.calls).toContainEqual(["user_preferences", "upsert", { user_id: "u1", theme: "dark" }])
    expect(sb.calls).toContainEqual(["book_settings", "update", { gami: false }])
  })

  it("encendido: PATCH sin user_id / book_id", async () => {
    on.mods.add("me").add("books")
    api.me.updatePreferences.mockResolvedValue(res({}))
    api.books.updateSettings.mockResolvedValue(res({}))
    await P.savePrefs("u1", { theme: "dark", user_id: "u1" })
    await P.saveBookSettings("b1", { gami: false, book_id: "b1" })
    expect(api.me.updatePreferences).toHaveBeenCalledWith({ body: { theme: "dark" } })
    expect(api.books.updateSettings).toHaveBeenCalledWith({ params: { bookId: "b1" }, body: { gami: false } })
    expect(from).not.toHaveBeenCalled()
  })
})

describe("presupuesto y renta", () => {
  it("tope: comando budget con book-tables:categories; apagado, update de categories", async () => {
    await saveTope("b1", "c1", 500)
    expect(sb.calls).toContainEqual(["categories", "update", { tope: 500 }])
    on.mods.add("book-tables:categories")
    api.budget.tope.mockResolvedValue(res({ ok: true, data: {} }))
    await saveTope("b1", "c1", 700)
    expect(api.budget.tope).toHaveBeenCalledWith({ params: { bookId: "b1", id: "c1" }, body: { tope: 700 } })
  })

  it("renta (tax): el año va por el CRUD genérico con el id que ya tenía o uno nuevo; apagado, upsert por la llave única", async () => {
    const row = { year: 2025, member_id: "m1", ing: {}, ded: {}, docs: {}, consig: 0, consumos: 0 }
    await R.saveTaxYear("b1", row)
    expect(sb.calls).toContainEqual(["tax_years", "upsert", { book_id: "b1", ...row }, { onConflict: "book_id,year,member_id" }])
    on.mods.add("tax")
    api.bookTables.upsert.mockResolvedValue(res({ id: "t1" }))
    await R.saveTaxYear("b1", row, "t1")
    expect(api.bookTables.upsert).toHaveBeenCalledWith({ params: { bookId: "b1", table: "tax_years", id: "t1" }, body: row })
    api.bookTables.remove.mockResolvedValue(res({ ok: true, data: { id: "a1", deleted_at: "x" } }))
    await R.setRentaDeleted("b1", "tax_assets", "a1", true)
    expect(api.bookTables.remove).toHaveBeenCalledWith({ params: { bookId: "b1", table: "tax_assets", id: "a1" } })
  })
})

describe("logros (gami)", () => {
  it("encendido: el estado guardado sale de GET …/gami/state", async () => {
    on.mods.add("gami")
    const st = { on: true, visitas: [], unl: {}, mis: {}, maxLevel: 1, init: null, chats: 0, consejos: 0, retos: [], fondo: null, nombre: "Ana" }
    api.gami.state.mockResolvedValue(res(st))
    expect(await fetchGamiState("b1", "u1")).toEqual(st)
    expect(from).not.toHaveBeenCalled()
  })
})
