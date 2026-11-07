import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/errors"

const on = { v: false }
const actions = {
  sendDigestNow: vi.fn(async () => ({ ok: true, msg: "acción" })),
  notifyChannels: vi.fn(async () => ({ email: true, telegram: false, whatsapp: false, push: false })),
  sendTestNow: vi.fn(), telegramStartLink: vi.fn(), telegramConfirm: vi.fn(), telegramUnlink: vi.fn(),
  openAppNotifs: vi.fn(), logroNotifs: vi.fn(), cobroWaStatus: vi.fn(), sendCobroWhatsApp: vi.fn(async () => ({ ok: true, msg: "acción" })),
}
const notify = { digestNow: vi.fn(), channels: vi.fn(), cobroWaSend: vi.fn() }
const gami = { logros: vi.fn() }
const gamiOn = { v: false }
const status = (s: number, body: unknown) => ({ status: s, body, headers: new Headers() })

vi.mock("./actions", () => actions)
vi.mock("@/lib/api/session", () => ({ apiOn: (m: string) => (m === "notify" && on.v) || (m === "gami" && gamiOn.v), activeBookId: () => "book-1" }))
vi.mock("@/lib/api/client", async () => {
  const u = await import("@/lib/api/unwrap")
  return { ...u, browserApi: () => ({ notify, gami }) }
})

const api = await import("./api")

beforeEach(() => { vi.clearAllMocks(); on.v = false; gamiOn.v = false })

describe("features/notify/api", () => {
  it("apagado: llama a la Server Action de siempre y no a la API", async () => {
    expect(await api.sendDigestNow("email")).toEqual({ ok: true, msg: "acción" })
    expect(actions.sendDigestNow).toHaveBeenCalledWith("email")
    expect(notify.digestNow).not.toHaveBeenCalled()
  })

  it("encendido: llama a la API con el libro en la ruta y devuelve la misma forma", async () => {
    on.v = true
    notify.digestNow.mockResolvedValue(status(200, { ok: true, data: { msg: "Te enviamos el resumen." } }))
    expect(await api.sendDigestNow("telegram")).toEqual({ ok: true, msg: "Te enviamos el resumen." })
    expect(notify.digestNow).toHaveBeenCalledWith({ params: { bookId: "book-1" }, body: { canal: "telegram" } })
    expect(actions.sendDigestNow).not.toHaveBeenCalled()
  })

  it("encendido: un error de la API se vuelve { ok:false, msg } con el texto en español", async () => {
    on.v = true
    notify.cobroWaSend.mockResolvedValue(status(429, { ok: false, code: "RATE_LIMITED", msg: "Enviaste muchos recordatorios hoy" }))
    expect(await api.sendCobroWhatsApp({ loanId: "l", consentimiento: true })).toEqual({ ok: false, msg: "Enviaste muchos recordatorios hoy" })
    notify.digestNow.mockRejectedValue(ApiError.network())
    expect((await api.sendDigestNow("email")).ok).toBe(false)
  })

  it("encendido: canales caen a todo apagado si la API falla (como la acción)", async () => {
    on.v = true
    notify.channels.mockResolvedValue(status(500, null))
    expect(await api.notifyChannels()).toEqual({ email: false, telegram: false, whatsapp: false, push: false })
  })

  it("logroNotifs: apagado la acción; con `gami` encendido POST …/gami/logros y nunca lanza", async () => {
    const input = { bookId: "book-9", badges: [{ id: "b1", n: "Primera meta", d: "Creaste tu primera meta" }], nivel: null }
    await api.logroNotifs(input)
    expect(actions.logroNotifs).toHaveBeenCalledWith(input)
    gamiOn.v = true
    gami.logros.mockResolvedValue(status(200, { ok: true, data: { saved: 1 } }))
    expect(await api.logroNotifs(input)).toEqual({ ok: true })
    expect(gami.logros).toHaveBeenCalledWith({ params: { bookId: "book-9" }, body: { badges: input.badges, nivel: null } })
    gami.logros.mockResolvedValue(status(500, null))
    expect(await api.logroNotifs(input)).toEqual({ ok: false })
    expect(actions.logroNotifs).toHaveBeenCalledTimes(1)
  })
})
