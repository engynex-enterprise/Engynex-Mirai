import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/errors"

const on = { v: false }
const rows = [{ id: "n1", titulo: "Hola" }]
const sbQuery = { select: vi.fn(), eq: vi.fn(), or: vi.fn(), order: vi.fn(), limit: vi.fn(async () => ({ data: rows, error: null })) }
for (const k of ["select", "eq", "or", "order"] as const) sbQuery[k].mockReturnValue(sbQuery)
const from = vi.fn(() => sbQuery)
const bell = { list: vi.fn(), readAll: vi.fn() }

vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({ from }) }))
vi.mock("@/lib/api/session", () => ({ apiOn: (m: string) => m === "bell" && on.v }))
vi.mock("@/lib/api/client", async () => ({ ...(await import("@/lib/api/unwrap")), browserApi: () => ({ bell }) }))

const { bellList, bellReadAll } = await import("./bell")

beforeEach(() => { vi.clearAllMocks(); on.v = false })

describe("campana (features/notify/bell)", () => {
  it("apagado: la consulta de siempre a Supabase", async () => {
    expect(await bellList("u1", "b1")).toBe(rows)
    expect(from).toHaveBeenCalledWith("notifications")
    expect(sbQuery.or).toHaveBeenCalledWith("book_id.eq.b1,book_id.is.null")
    expect(bell.list).not.toHaveBeenCalled()
  })

  it("encendido: la API; si no responde, Supabase", async () => {
    on.v = true
    bell.list.mockResolvedValue({ status: 200, body: [{ id: "api" }], headers: new Headers() })
    expect(await bellList("u1", "b1")).toEqual([{ id: "api" }])
    expect(bell.list).toHaveBeenCalledWith({ query: { bookId: "b1", limit: 50 } })
    expect(from).not.toHaveBeenCalled()
    bell.list.mockRejectedValue(ApiError.network())
    expect(await bellList("u1", "b1")).toBe(rows)
  })

  it("encendido: marcar todo leído por la API (un 4xx no se repite por Supabase)", async () => {
    on.v = true
    bell.readAll.mockResolvedValue({ status: 401, body: { ok: false, code: "UNAUTHENTICATED", msg: "Tu sesión se cerró." }, headers: new Headers() })
    await expect(bellReadAll("u1")).rejects.toThrow("Tu sesión se cerró.")
    expect(from).not.toHaveBeenCalled()
  })
})
