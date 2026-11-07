// v7 (V7-H4): con AUTH_PROVIDER=mirai no hay sesión de Supabase en el navegador, así que TODO va por la API (también
// fuera del shell) y nunca se cae a Supabase como respaldo. Con `supabase` (por defecto) todo sigue como antes.
import { afterEach, describe, expect, it, vi } from "vitest"
import { apiOn } from "./session"
import { canFallback } from "./book-tables"
import { ApiError } from "./errors"

const browser = (cookie: string) => {
  vi.stubGlobal("window", {})
  vi.stubGlobal("document", { cookie })
}

describe("AUTH_PROVIDER=mirai en el navegador", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("apiOn: encendido aunque no haya sesión ni interruptores; con supabase, apagado como siempre", () => {
    browser("otra=1; mirai-auth=mirai")
    expect(apiOn("households")).toBe(true)
    expect(apiOn("book-tables", "expenses")).toBe(true)
    browser("mirai-auth=supabase")
    expect(apiOn("households")).toBe(false)
  })

  it("en el servidor de Next apiOn sigue en false (la API se llama con serverApi)", () => {
    expect(apiOn("households")).toBe(false)
  })

  it("canFallback: nunca a Supabase en modo mirai (sí con supabase ante red o 5xx)", () => {
    browser("mirai-auth=supabase")
    expect(canFallback(ApiError.network())).toBe(true)
    expect(canFallback(ApiError.from(503, {}))).toBe(true)
    expect(canFallback(ApiError.from(404, {}))).toBe(false)
    browser("mirai-auth=mirai")
    expect(canFallback(ApiError.network())).toBe(false)
    expect(canFallback(ApiError.from(503, {}))).toBe(false)
  })
})
