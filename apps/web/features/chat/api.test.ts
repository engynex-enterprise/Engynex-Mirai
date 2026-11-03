import { beforeEach, describe, expect, it, vi } from "vitest"

const s = vi.hoisted(() => ({ on: false }))
const db = vi.hoisted(() => ({ update: vi.fn(), rows: [{ id: "t1", titulo: "Hola" }] as unknown[] }))
const actions = vi.hoisted(() => ({
  chatHints: vi.fn(), chatConfirm: vi.fn(async () => ({ ok: false, msg: "acción" })), chatCancel: vi.fn(), chatAttach: vi.fn(),
  chatTitle: vi.fn(), chatDuplicate: vi.fn(), chatThreadInfo: vi.fn(),
}))
const api = vi.hoisted(() => ({
  chat: { confirm: vi.fn(), cancel: vi.fn(), threads: vi.fn(), messages: vi.fn(), patchThread: vi.fn(), deleteThread: vi.fn(), restoreThread: vi.fn() },
}))

vi.mock("./actions", () => actions)
vi.mock("@/features/ai/actions", () => ({ readInvoice: vi.fn(), classifyExpenses: vi.fn(), reviewMonthHormiga: vi.fn(), suggestCategory: vi.fn(), identifyEntity: vi.fn(), readLoanDoc: vi.fn(), readReceipt: vi.fn(), improveCobro: vi.fn(), primaPlan: vi.fn(), parseNL: vi.fn() }))
vi.mock("@/lib/api/session", () => ({ apiOn: (m: string) => s.on && m === "chat", activeBookId: () => "00000000-0000-4000-8000-000000000001" }))
vi.mock("@/lib/api/client", async () => ({ browserApi: () => api, ...(await import("@/lib/api/unwrap")) }))
vi.mock("@/utils/supabase/client", () => {
  const q: Record<string, unknown> = {}
  for (const k of ["select", "eq", "is", "order", "limit"]) q[k] = () => q
  q.then = (r: (v: unknown) => void) => r({ data: db.rows, error: null })
  return { createClient: () => ({ from: () => ({ ...q, update: (v: unknown) => ({ in: (_c: string, ids: string[]) => { db.update(v, ids); return Promise.resolve({ error: null }) } }) }) }) }
})

const ok = (data: unknown) => ({ status: 200, body: { ok: true, data }, headers: new Headers() })
const res = (status: number, body: unknown) => ({ status, body, headers: new Headers() })

import { chatCancel, chatConfirm, listMessages, listThreads, updateThreads } from "./api"

describe("features/chat/api (interruptor chat)", () => {
  beforeEach(() => { vi.clearAllMocks(); s.on = false })

  it("apagado: acción y consultas directas de siempre", async () => {
    expect(await chatConfirm("m", "p")).toEqual({ ok: false, msg: "acción" })
    expect(await listThreads("b", "u")).toEqual(db.rows)
    expect(await updateThreads(["t1"], { fijado: true })).toBeNull()
    expect(db.update).toHaveBeenCalledWith({ fijado: true }, ["t1"])
    expect(api.chat.threads).not.toHaveBeenCalled()
  })

  it("encendido: confirmar arma { ok:true, … } y los errores { ok:false, msg }", async () => {
    s.on = true
    api.chat.confirm.mockResolvedValueOnce(ok({ msg: "Listo", href: "/gastos", tablas: ["expenses"], propuesta: {} }))
    expect(await chatConfirm("m", "p")).toMatchObject({ ok: true, msg: "Listo", href: "/gastos" })
    api.chat.confirm.mockResolvedValueOnce(res(404, { ok: false, msg: "No encontramos esta propuesta.", code: "NOT_FOUND" }))
    expect(await chatConfirm("m", "p")).toEqual({ ok: false, msg: "No encontramos esta propuesta." })
    api.chat.cancel.mockResolvedValueOnce(res(409, { ok: false, msg: "Ya se canceló", code: "CONFLICT" }))
    expect(await chatCancel("m", "p")).toEqual({ ok: false })
    expect(actions.chatConfirm).not.toHaveBeenCalled()
  })

  it("encendido: hilos por la API, mensajes de un hilo borrado = [], y si la API no responde, Supabase", async () => {
    s.on = true
    api.chat.threads.mockResolvedValueOnce(res(200, { items: [{ id: "api" }] }))
    expect(await listThreads("b", "u")).toEqual([{ id: "api" }])
    api.chat.messages.mockResolvedValueOnce(res(404, { ok: false, msg: "No encontramos la conversación.", code: "NOT_FOUND" }))
    expect(await listMessages("00000000-0000-4000-8000-000000000002")).toEqual([])
    api.chat.threads.mockResolvedValueOnce(res(503, null)) // el fetcher ya reintentó: respaldo
    expect(await listThreads("b", "u")).toEqual(db.rows)
  })

  it("encendido: borrar/deshacer/fijar van a su ruta por cada hilo", async () => {
    s.on = true
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
    expect(db.update).not.toHaveBeenCalled()
  })
})
