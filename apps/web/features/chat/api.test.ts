import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  chat: { confirm: vi.fn(), cancel: vi.fn(), threads: vi.fn(), messages: vi.fn(), patchThread: vi.fn(), deleteThread: vi.fn(), restoreThread: vi.fn() },
}))

vi.mock("@/lib/api/session", () => ({ activeBookId: () => "00000000-0000-4000-8000-000000000001" }))
vi.mock("@/lib/api/client", async () => ({ browserApi: () => api, ...(await import("@/lib/api/unwrap")) }))

const ok = (data: unknown) => ({ status: 200, body: { ok: true, data }, headers: new Headers() })
const res = (status: number, body: unknown) => ({ status, body, headers: new Headers() })

import { chatCancel, chatConfirm, listMessages, listThreads, updateThreads } from "./api"

describe("features/chat/api", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("confirmar arma { ok:true, … } y los errores { ok:false, msg }", async () => {
    api.chat.confirm.mockResolvedValueOnce(ok({ msg: "Listo", href: "/gastos", tablas: ["expenses"], propuesta: {} }))
    expect(await chatConfirm("m", "p")).toMatchObject({ ok: true, msg: "Listo", href: "/gastos" })
    api.chat.confirm.mockResolvedValueOnce(res(404, { ok: false, msg: "No encontramos esta propuesta.", code: "NOT_FOUND" }))
    expect(await chatConfirm("m", "p")).toEqual({ ok: false, msg: "No encontramos esta propuesta." })
    api.chat.cancel.mockResolvedValueOnce(res(409, { ok: false, msg: "Ya se canceló", code: "CONFLICT" }))
    expect(await chatCancel("m", "p")).toEqual({ ok: false })
  })

  it("hilos por la API y mensajes de un hilo borrado = []", async () => {
    api.chat.threads.mockResolvedValueOnce(res(200, { items: [{ id: "api" }] }))
    expect(await listThreads("b")).toEqual([{ id: "api" }])
    expect(api.chat.threads.mock.calls[0][0]).toMatchObject({ params: { bookId: "b" }, query: { limit: 200 } })
    api.chat.messages.mockResolvedValueOnce(res(404, { ok: false, msg: "No encontramos la conversación.", code: "NOT_FOUND" }))
    expect(await listMessages("00000000-0000-4000-8000-000000000002")).toEqual([])
  })

  it("borrar/deshacer/fijar van a su ruta por cada hilo", async () => {
    api.chat.deleteThread.mockResolvedValue(ok({ id: "t" }))
    api.chat.restoreThread.mockResolvedValue(ok({ id: "t" }))
    api.chat.patchThread.mockResolvedValue(ok({ id: "t" }))
    expect(await updateThreads(["a", "b"], { deleted_at: "2026-11-02T00:00:00Z" })).toBeNull()
    expect(api.chat.deleteThread).toHaveBeenCalledTimes(2)
    expect(await updateThreads(["a"], { deleted_at: null })).toBeNull()
    expect(api.chat.restoreThread).toHaveBeenCalledTimes(1)
    expect(await updateThreads(["a"], { titulo: "Nuevo", titulo_auto: false })).toBeNull()
    expect(api.chat.patchThread.mock.calls[0][0].body).toEqual({ titulo: "Nuevo" })
    api.chat.patchThread.mockResolvedValueOnce(res(403, { ok: false, msg: "Tu rol no permite…", code: "ROLE_DENIED" }))
    expect(await updateThreads(["a"], { fijado: true })).toBe("Tu rol no permite…")
  })
})
