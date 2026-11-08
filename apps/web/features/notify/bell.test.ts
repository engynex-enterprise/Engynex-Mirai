import { beforeEach, describe, expect, it, vi } from "vitest"

const bell = { list: vi.fn(), readAll: vi.fn(), read: vi.fn() }

vi.mock("@/lib/api/client", async () => ({ ...(await import("@/lib/api/unwrap")), browserApi: () => ({ bell }) }))

const { bellList, bellReadAll, bellReadOne } = await import("./bell")

beforeEach(() => { vi.clearAllMocks() })

describe("campana (features/notify/bell)", () => {
  it("lista por la API con el libro y el límite", async () => {
    bell.list.mockResolvedValue({ status: 200, body: [{ id: "api" }], headers: new Headers() })
    expect(await bellList("u1", "b1")).toEqual([{ id: "api" }])
    expect(bell.list).toHaveBeenCalledWith({ query: { bookId: "b1", limit: 50 } })
  })

  it("marcar todo leído: el error de la API llega con su mensaje", async () => {
    bell.readAll.mockResolvedValue({ status: 401, body: { ok: false, code: "UNAUTHENTICATED", msg: "Tu sesión se cerró." }, headers: new Headers() })
    await expect(bellReadAll()).rejects.toThrow("Tu sesión se cerró.")
  })

  it("marcar uno leído no lanza aunque la API falle", async () => {
    bell.read.mockRejectedValue(new Error("red"))
    await expect(bellReadOne("n1")).resolves.toBeNull()
    expect(bell.read).toHaveBeenCalledWith({ params: { id: "n1" } })
  })
})
