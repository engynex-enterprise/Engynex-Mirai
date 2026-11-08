import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/errors"

const api = vi.hoisted(() => ({ ai: { invoice: vi.fn(), category: vi.fn(), parse: vi.fn(), cobro: vi.fn() } }))

vi.mock("@/lib/api/session", () => ({ activeBookId: () => "00000000-0000-4000-8000-000000000001" }))
vi.mock("@/lib/api/client", async () => ({ browserApi: () => api, ...(await import("@/lib/api/unwrap")) }))

const ok = (data: unknown) => ({ status: 200, body: { ok: true, data }, headers: new Headers() })
const err = (status: number, msg: string, code: string) => ({ status, body: { ok: false, msg, code }, headers: new Headers() })

import { classifyExpenses, improveCobro, parseNL, readInvoice, suggestCategory, toBase64 } from "./api"

describe("features/ai/api", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("sin archivo: { ok:false } sin llamar a la API", async () => {
    expect(await readInvoice(new FormData())).toMatchObject({ ok: false })
    expect(api.ai.invoice).not.toHaveBeenCalled()
  })

  it("manda la foto en base64 y arma la misma forma de la acción", async () => {
    api.ai.invoice.mockResolvedValue(ok({ comercio: "Éxito", valor: 12000, fecha: "2026-11-02", category_id: null }))
    const fd = new FormData()
    fd.set("file", new File([new Uint8Array([1, 2, 3])], "f.jpg", { type: "image/jpeg" }))
    expect(await readInvoice(fd)).toEqual({ ok: true, comercio: "Éxito", valor: 12000, fecha: "2026-11-02", category_id: null })
    expect(api.ai.invoice.mock.calls[0][0].body.file).toEqual({ name: "f.jpg", type: "image/jpeg", data: "AQID" })
  })

  it("el ApiError vuelve como { ok:false, msg } con el texto de la API", async () => {
    api.ai.invoice.mockResolvedValue(err(402, "La lectura de fotos no está incluida en tu plan.", "PLAN_REQUIRED"))
    const fd = new FormData()
    fd.set("file", new File(["x"], "f.jpg", { type: "image/jpeg" }))
    expect(await readInvoice(fd)).toEqual({ ok: false, msg: "La lectura de fotos no está incluida en tu plan." })
  })

  it("sin sugerencia (data null) = { ok:false }; rol denegado se lanza como en la acción", async () => {
    api.ai.category.mockResolvedValueOnce(ok(null))
    expect(await suggestCategory("d", "n", [])).toEqual({ ok: false })
    api.ai.category.mockResolvedValueOnce(err(403, "Tu rol no permite…", "ROLE_DENIED"))
    await expect(suggestCategory("d", "n", [])).rejects.toBeInstanceOf(ApiError)
    api.ai.parse.mockResolvedValueOnce(ok(null))
    expect(await parseNL("hola")).toEqual({ ok: false })
  })

  it("cobro: el error va en `text` y clasificar devuelve null si falla", async () => {
    api.ai.cobro.mockResolvedValue(err(429, "Usaste tus créditos de IA del mes.", "RATE_LIMITED"))
    expect(await improveCobro("hola", "amable")).toEqual({ ok: false, text: "Usaste tus créditos de IA del mes." })
    expect(await classifyExpenses([])).toBeNull()
  })

  it("toBase64 sirve con archivos grandes (por bloques)", async () => {
    const big = new Uint8Array(100_000).fill(65)
    expect(await toBase64(new Blob([big]))).toBe(Buffer.from(big).toString("base64"))
  })
})
