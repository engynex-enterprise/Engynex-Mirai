import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/errors"

const notify = { digestNow: vi.fn(), channels: vi.fn(), cobroWaSend: vi.fn() }
const gami = { logros: vi.fn() }
const status = (s: number, body: unknown) => ({ status: s, body, headers: new Headers() })

vi.mock("@/lib/api/session", () => ({ activeBookId: () => "book-1" }))
vi.mock("@/lib/api/client", async () => {
  const u = await import("@/lib/api/unwrap")
  return { ...u, browserApi: () => ({ notify, gami }) }
})

const api = await import("./api")

beforeEach(() => { vi.clearAllMocks() })

describe("features/notify/api", () => {
  it("llama a la API con el libro en la ruta y devuelve { ok, msg }", async () => {
    notify.digestNow.mockResolvedValue(status(200, { ok: true, data: { msg: "Te enviamos el resumen." } }))
    expect(await api.sendDigestNow("telegram")).toEqual({ ok: true, msg: "Te enviamos el resumen." })
    expect(notify.digestNow).toHaveBeenCalledWith({ params: { bookId: "book-1" }, body: { canal: "telegram" } })
  })

  it("un error de la API se vuelve { ok:false, msg } con el texto en español", async () => {
    notify.cobroWaSend.mockResolvedValue(status(429, { ok: false, code: "RATE_LIMITED", msg: "Enviaste muchos recordatorios hoy" }))
    expect(await api.sendCobroWhatsApp({ loanId: "l", consentimiento: true })).toEqual({ ok: false, msg: "Enviaste muchos recordatorios hoy" })
    notify.digestNow.mockRejectedValue(ApiError.network())
    expect((await api.sendDigestNow("email")).ok).toBe(false)
  })

  it("canales caen a todo apagado si la API falla", async () => {
    notify.channels.mockResolvedValue(status(500, null))
    expect(await api.notifyChannels()).toEqual({ email: false, telegram: false, whatsapp: false, push: false })
  })

  it("logroNotifs: POST …/gami/logros y nunca lanza", async () => {
    const input = { bookId: "book-9", badges: [{ id: "b1", n: "Primera meta", d: "Creaste tu primera meta" }], nivel: null }
    gami.logros.mockResolvedValue(status(200, { ok: true, data: { saved: 1 } }))
    expect(await api.logroNotifs(input)).toEqual({ ok: true })
    expect(gami.logros).toHaveBeenCalledWith({ params: { bookId: "book-9" }, body: { badges: input.badges, nivel: null } })
    gami.logros.mockResolvedValue(status(500, null))
    expect(await api.logroNotifs(input)).toEqual({ ok: false })
  })
})
