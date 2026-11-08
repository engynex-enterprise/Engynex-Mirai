// Ajustes, Planeación, Renta y Logros por la API (las escrituras nunca se repiten por otro camino).
import { beforeEach, describe, expect, it, vi } from "vitest"

const res = (body: unknown, status = 200) => ({ status, body, headers: new Headers() })

const api = {
  notify: { getMyRule: vi.fn(), putMyRule: vi.fn() },
  me: { telegram: vi.fn(), preferences: vi.fn(), updatePreferences: vi.fn() },
  importer: { backups: vi.fn() },
  books: { audit: vi.fn(), settings: vi.fn(), updateSettings: vi.fn() },
  budget: { tope: vi.fn() },
  bookTables: { upsert: vi.fn(), remove: vi.fn(), restore: vi.fn() },
  gami: { state: vi.fn() },
}

vi.mock("@/lib/api/client", async () => ({ ...(await import("@/lib/api/unwrap")), browserApi: () => api }))

const S = await import("./api")
const P = await import("./prefs")
const { saveTope } = await import("@/features/planning/api")
const R = await import("@/features/renta/api")
const { fetchGamiState } = await import("@/features/gami/use-gami")

beforeEach(() => { vi.clearAllMocks() })

describe("reglas de aviso y Telegram", () => {
  it("la API, sin los campos que pone el servidor; el error llega con su mensaje", async () => {
    api.notify.getMyRule.mockResolvedValue(res({ hora: 7 }))
    expect(await S.fetchMyRule("u1", "b1")).toEqual({ hora: 7 })
    expect(api.notify.getMyRule).toHaveBeenCalledWith({ params: { bookId: "b1" } })
    api.notify.putMyRule.mockResolvedValue(res({}))
    await S.saveMyRule("u1", "b1", { hora: 8, last_sent: { a: "x" }, user_id: "u1" })
    expect(api.notify.putMyRule).toHaveBeenCalledWith({ params: { bookId: "b1" }, body: { hora: 8 } })
    api.notify.putMyRule.mockResolvedValue(res({ ok: false, code: "VALIDATION", msg: "Escribe un correo válido" }, 400))
    await expect(S.saveMyRule("u1", "b1", { email_to: "x" })).rejects.toThrow("Escribe un correo válido")
    api.me.telegram.mockResolvedValue(res({ linked: false, linked_at: null }))
    expect(await S.fetchTelegramLinked()).toBe(false)
  })
})

describe("respaldos e historial", () => {
  it("respaldos: sin permiso de «Administra» la API dice 403 y la lista queda vacía", async () => {
    api.importer.backups.mockResolvedValue(res({ ok: false, code: "ROLE_DENIED", msg: "No" }, 403))
    expect(await S.fetchBackups("b1")).toEqual([])
  })

  it("respaldos: los 30 más recientes", async () => {
    api.importer.backups.mockResolvedValue(res(Array.from({ length: 35 }, (_, i) => ({ id: String(i) }))))
    expect(await S.fetchBackups("b1")).toHaveLength(30)
  })

  it("historial por la API con el límite", async () => {
    api.books.audit.mockResolvedValue(res([{ id: "1", quien: "Ana" }]))
    expect(await S.fetchAudit("b1", 25)).toEqual([{ id: "1", quien: "Ana" }])
    expect(api.books.audit).toHaveBeenCalledWith({ params: { bookId: "b1" }, query: { limit: 25 } })
  })
})

describe("preferencias y ajustes del libro", () => {
  it("PATCH sin user_id / book_id", async () => {
    api.me.updatePreferences.mockResolvedValue(res({}))
    api.books.updateSettings.mockResolvedValue(res({}))
    await P.savePrefs("u1", { theme: "dark", user_id: "u1" })
    await P.saveBookSettings("b1", { gami: false, book_id: "b1" })
    expect(api.me.updatePreferences).toHaveBeenCalledWith({ body: { theme: "dark" } })
    expect(api.books.updateSettings).toHaveBeenCalledWith({ params: { bookId: "b1" }, body: { gami: false } })
  })
})

describe("presupuesto y renta", () => {
  it("tope: comando budget", async () => {
    api.budget.tope.mockResolvedValue(res({ ok: true, data: {} }))
    await saveTope("b1", "c1", 700)
    expect(api.budget.tope).toHaveBeenCalledWith({ params: { bookId: "b1", id: "c1" }, body: { tope: 700 } })
  })

  it("renta: el año va por el CRUD genérico con el id que ya tenía; la papelera por remove", async () => {
    const row = { year: 2025, member_id: "m1", ing: {}, ded: {}, docs: {}, consig: 0, consumos: 0 }
    api.bookTables.upsert.mockResolvedValue(res({ id: "t1" }))
    await R.saveTaxYear("b1", row, "t1")
    expect(api.bookTables.upsert).toHaveBeenCalledWith({ params: { bookId: "b1", table: "tax_years", id: "t1" }, body: row })
    api.bookTables.remove.mockResolvedValue(res({ ok: true, data: { id: "a1", deleted_at: "x" } }))
    await R.setRentaDeleted("b1", "tax_assets", "a1", true)
    expect(api.bookTables.remove).toHaveBeenCalledWith({ params: { bookId: "b1", table: "tax_assets", id: "a1" } })
  })
})

describe("logros (gami)", () => {
  it("el estado guardado sale de GET …/gami/state", async () => {
    const st = { on: true, visitas: [], unl: {}, mis: {}, maxLevel: 1, init: null, chats: 0, consejos: 0, retos: [], fondo: null, nombre: "Ana" }
    api.gami.state.mockResolvedValue(res(st))
    expect(await fetchGamiState("b1")).toEqual(st)
  })
})
