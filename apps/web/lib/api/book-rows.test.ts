// Escrituras sueltas del libro (V7-H1): interruptor `book-tables[:tabla]`, PUT con el id del navegador sin las columnas
// del sistema, papelera y "Deshacer", y los errores de la API como `{ error: { message } }` en español.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const upsert = vi.fn()
const remove = vi.fn()
const restore = vi.fn()
const list = vi.fn()
const snapshot = vi.fn()
vi.mock("@/lib/api/client", async () => {
  const u = await import("./unwrap")
  return { ...u, browserApi: () => ({ bookTables: { upsert, remove, restore, list, snapshot } }) }
})

const BOOK = "11111111-1111-4111-8111-111111111111"
const ROW = "22222222-2222-4222-8222-222222222222"
const res = (status: number, body: unknown) => ({ status, body, headers: new Headers() })

async function session(flags: Record<string, boolean>) {
  const { setApiSession } = await import("./session")
  setApiSession({ cfg: { url: "https://api.test", flags }, userId: "u", householdId: "h", bookId: BOOK })
}

beforeEach(() => {
  vi.stubGlobal("window", {})
  vi.stubGlobal("document", { cookie: "" })
  for (const f of [upsert, remove, restore, list, snapshot]) f.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe("book-rows", () => {
  it("rowsViaApi: apagado sin interruptor; encendido por módulo o por tabla; nunca para tablas fuera del CRUD genérico", async () => {
    const { rowsViaApi } = await import("./book-rows")
    await session({})
    expect(rowsViaApi("expenses")).toBe(false)
    await session({ "book-tables": true })
    expect(rowsViaApi("expenses")).toBe(true)
    expect(rowsViaApi("emergency_funds")).toBe(false)
    expect(rowsViaApi("chat_threads")).toBe(false)
    await session({ "book-tables": true, "book-tables:loans": false })
    expect(rowsViaApi("loans")).toBe(false)
    expect(rowsViaApi("loan_payments")).toBe(true)
  })

  it("apiInsertRow: PUT con un id nuevo y sin book_id ni id en el cuerpo; devuelve la fila", async () => {
    upsert.mockResolvedValue(res(200, { id: "x", book_id: BOOK, nombre: "Viaje" }))
    const { apiInsertRow } = await import("./book-rows")
    const r = await apiInsertRow(BOOK, "shared_groups", { book_id: BOOK, nombre: "Viaje", personas: ["Ana", "Luis"], sobra: undefined })
    expect(r).toEqual({ data: { id: "x", book_id: BOOK, nombre: "Viaje" }, error: null })
    const call = upsert.mock.calls[0][0]
    expect(call.params.bookId).toBe(BOOK)
    expect(call.params.table).toBe("shared_groups")
    expect(call.params.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(call.body).toEqual({ nombre: "Viaje", personas: ["Ana", "Luis"] })
  })

  it("apiUpdateRow: PUT solo con los campos que cambian, al id de la fila", async () => {
    upsert.mockResolvedValue(res(200, { id: ROW, hormiga: true }))
    const { apiUpdateRow } = await import("./book-rows")
    await apiUpdateRow(BOOK, "expenses", ROW, { hormiga: true, hormiga_src: "manual", hormiga_razon: null })
    expect(upsert).toHaveBeenCalledWith({ params: { bookId: BOOK, table: "expenses", id: ROW }, body: { hormiga: true, hormiga_src: "manual", hormiga_razon: null } })
  })

  it("papelera y Deshacer: DELETE y POST …/restore", async () => {
    remove.mockResolvedValue(res(200, { ok: true, data: { id: ROW, deleted_at: "2026-11-03T00:00:00Z" } }))
    restore.mockResolvedValue(res(200, { ok: true, data: { id: ROW } }))
    const { apiDeleteRow, apiRestoreRow } = await import("./book-rows")
    expect(await apiDeleteRow(BOOK, "loans", ROW)).toEqual({ data: undefined, error: null })
    expect(await apiRestoreRow(BOOK, "loans", ROW)).toEqual({ data: undefined, error: null })
    expect(remove).toHaveBeenCalledWith({ params: { bookId: BOOK, table: "loans", id: ROW } })
    expect(restore).toHaveBeenCalledWith({ params: { bookId: BOOK, table: "loans", id: ROW } })
  })

  it("el error de la API llega como error.message en español (sin lanzar)", async () => {
    upsert.mockResolvedValue(res(402, { ok: false, code: "PLAN_REQUIRED", msg: "Los gastos compartidos son de Mirai Premium." }))
    const { apiInsertRow } = await import("./book-rows")
    expect(await apiInsertRow(BOOK, "shared_groups", { nombre: "Viaje" })).toEqual({ data: null, error: { message: "Los gastos compartidos son de Mirai Premium." } })
  })

  it("apiRows: filtros eq y select como useList", async () => {
    list.mockResolvedValue(res(200, [{ id: ROW }]))
    const { apiRows } = await import("./book-rows")
    expect(await apiRows(BOOK, "card_purchases", { eq: { card_id: ROW }, select: "id" })).toEqual([{ id: ROW }])
    expect(list.mock.calls[0][0]).toMatchObject({ params: { bookId: BOOK, table: "card_purchases" }, query: { "eq.card_id": ROW, select: "id" } })
  })

  it("apiFund: la fila del fondo por el snapshot (o null si no hay)", async () => {
    snapshot.mockResolvedValueOnce(res(200, { parts: { emergency_funds: [{ activo: true, saldo: 50000 }] } }))
    const { apiFund, fundViaApi } = await import("./book-rows")
    await session({ snapshot: true })
    expect(fundViaApi()).toBe(true)
    expect(await apiFund(BOOK)).toEqual({ activo: true, saldo: 50000 })
    snapshot.mockResolvedValueOnce(res(200, { parts: { emergency_funds: [] } }))
    expect(await apiFund(BOOK)).toBeNull()
    expect(snapshot.mock.calls[0][0]).toMatchObject({ params: { bookId: BOOK }, query: { parts: "emergency_funds" } })
  })
})
