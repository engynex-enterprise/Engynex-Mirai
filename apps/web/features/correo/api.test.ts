import { beforeEach, describe, expect, it, vi } from "vitest"

const on = { v: false }
const actions = { scanMail: vi.fn(async () => ({ ok: true, rows: [] })), googleDisconnect: vi.fn(), syncCalendar: vi.fn(), calendarStatus: vi.fn() }
const ai = { mailScan: vi.fn() }
const google = { calendarSync: vi.fn(), calendarStatus: vi.fn() }
const status = (s: number, body: unknown) => ({ status: s, body, headers: new Headers() })

vi.mock("./actions", () => actions)
vi.mock("@/lib/api/session", () => ({ apiOn: (m: string) => m === "google" && on.v, activeBookId: () => "book-1" }))
vi.mock("@/lib/api/client", async () => ({ ...(await import("@/lib/api/unwrap")), browserApi: () => ({ ai, google }) }))

const api = await import("./api")

beforeEach(() => { vi.clearAllMocks(); on.v = false })

describe("features/correo/api", () => {
  it("apagado: la Server Action; googleViaApi falso", async () => {
    await api.scanMail("banco")
    expect(actions.scanMail).toHaveBeenCalledWith("banco")
    expect(ai.mailScan).not.toHaveBeenCalled()
    expect(api.googleViaApi()).toBe(false)
  })

  it("encendido: correo y Calendar con la forma de la acción", async () => {
    on.v = true
    const row = { id: "1", fecha: "2026-11-01", comercio: "Éxito", valor: 1000, asunto: "Compra", remitente: "banco" }
    ai.mailScan.mockResolvedValue(status(200, { ok: true, data: { rows: [row], ia: true } }))
    expect(await api.scanMail()).toEqual({ ok: true, rows: [row], ia: true })
    ai.mailScan.mockResolvedValue(status(402, { ok: false, code: "PLAN_REQUIRED", msg: "No está incluido en tu plan." }))
    expect(await api.scanMail()).toEqual({ ok: false, rows: [], msg: "No está incluido en tu plan." })
    google.calendarSync.mockResolvedValue(status(200, { ok: true, data: { msg: "Listo: 3 eventos", creados: 3, actualizados: 0, borrados: 0, total: 3 } }))
    expect(await api.syncCalendar()).toEqual({ ok: true, msg: "Listo: 3 eventos" })
    google.calendarStatus.mockResolvedValue(status(500, null))
    expect(await api.calendarStatus()).toEqual({ conectado: false, plan: false, eventos: 0 })
  })
})
