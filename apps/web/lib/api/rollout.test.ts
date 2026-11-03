// Interruptores (v6 F2-H-2): variables de entorno apagadas por defecto (sin tocar la base), platform_settings.api_rollout
// con caché, modos qa / admins / pct / on, `_off` de emergencia, viaApi/viaApiOr y la sesión del navegador.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { ALL_ON, apiUrl, getApiConfig, globalApiOn, resetRolloutCache, rolloutMode } from "./rollout"
import { API_MODULE_NAMES, API_OFF } from "./modules"
import { viaApi, viaApiOr } from "./via"

const QA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const OTRO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const env = (e: Record<string, string | undefined>) => e as unknown as NodeJS.ProcessEnv

/** Cliente de Supabase falso que cuenta las lecturas de platform_settings. */
function fakeSb(rollout: unknown, error: unknown = null) {
  const maybeSingle = vi.fn(async () => ({ data: error ? null : { api_rollout: rollout }, error }))
  const sb = { from: vi.fn(() => ({ select: () => ({ limit: () => ({ maybeSingle }) }) })) }
  return { sb: sb as never, reads: maybeSingle }
}

beforeEach(() => resetRolloutCache())

describe("variables de entorno", () => {
  it("apagado por defecto: API_OFF sin leer la base", async () => {
    const { sb, reads } = fakeSb({ me: "on" })
    for (const e of [{} as Record<string, string>, { MIRAI_API_URL: "https://api.test" }, { MIRAI_API_ROLLOUT: "db" }, { MIRAI_API_URL: "https://api.test", MIRAI_API_ROLLOUT: "off" }, { MIRAI_API_URL: "https://api.test", MIRAI_API_ROLLOUT: "raro" }])
      expect(await getApiConfig({ userId: QA }, sb, env(e))).toBe(API_OFF)
    expect(reads).not.toHaveBeenCalled()
  })

  it("origen de la API: MIRAI_API_URL o NEXT_PUBLIC_API_URL, sin barra final; basura = sin API", () => {
    expect(apiUrl(env({ MIRAI_API_URL: "https://api.test/" }))).toBe("https://api.test")
    expect(apiUrl(env({ NEXT_PUBLIC_API_URL: "http://localhost:8080" }))).toBe("http://localhost:8080")
    expect(apiUrl(env({ MIRAI_API_URL: "no es url" }))).toBe("")
  })

  it("all: todo encendido salvo en producción de Vercel; JSON literal para pruebas", () => {
    expect(rolloutMode(env({ MIRAI_API_ROLLOUT: "all" }))).toEqual({ kind: "literal", value: ALL_ON })
    expect(rolloutMode(env({ MIRAI_API_ROLLOUT: "all", VERCEL_ENV: "production" }))).toEqual({ kind: "off" })
    expect(rolloutMode(env({ MIRAI_API_ROLLOUT: '{"chat":"on"}' }))).toEqual({ kind: "literal", value: { chat: "on" } })
    expect(rolloutMode(env({ MIRAI_API_ROLLOUT: "{mal" }))).toEqual({ kind: "off" })
    expect(Object.keys(ALL_ON).sort()).toEqual([...API_MODULE_NAMES].sort())
  })
})

describe("platform_settings.api_rollout (MIRAI_API_ROLLOUT=db)", () => {
  const E = env({ MIRAI_API_URL: "https://api.test", MIRAI_API_ROLLOUT: "db" })

  it("qa solo para las personas de _users; admins; on; detalle por tabla", async () => {
    const { sb } = fakeSb({ _users: [QA], me: "qa", admin: "admins", snapshot: "on", "book-tables": "on", "book-tables:expenses": "off" })
    const qa = await getApiConfig({ userId: QA }, sb, E)
    expect(qa.url).toBe("https://api.test")
    expect(viaApi(qa, "me")).toBe(true)
    expect(viaApi(qa, "admin")).toBe(false)
    expect(viaApi(qa, "snapshot")).toBe(true)
    expect(viaApi(qa, "book-tables", "goals")).toBe(true)
    expect(viaApi(qa, "book-tables", "expenses")).toBe(false)
    expect(viaApi(qa, "chat")).toBe(false)
    const otro = await getApiConfig({ userId: OTRO, isAdmin: true }, sb, E)
    expect(viaApi(otro, "me")).toBe(false)
    expect(viaApi(otro, "admin")).toBe(true)
  })

  it("caché de 30 s: varias peticiones = una lectura; el cliente se pide solo si hace falta", async () => {
    const { sb, reads } = fakeSb({ chat: "on" })
    const lazy = vi.fn(() => sb)
    await getApiConfig({ userId: QA }, lazy, E)
    await getApiConfig({ userId: OTRO }, lazy, E)
    expect(reads).toHaveBeenCalledTimes(1)
    expect(lazy).toHaveBeenCalledTimes(1)
  })

  it("sin la columna (migración sin aplicar) o con error: todo apagado", async () => {
    const { sb } = fakeSb(null, { message: "column platform_settings.api_rollout does not exist" })
    const cfg = await getApiConfig({ userId: QA }, sb, E)
    expect(cfg.flags).toEqual({})
    expect(viaApi(cfg, "me")).toBe(false)
  })

  it("apagado de emergencia: _off: true", async () => {
    const { sb } = fakeSb({ _off: true, _users: [QA], me: "on", chat: "qa" })
    expect((await getApiConfig({ userId: QA }, sb, E)).flags).toEqual({})
  })

  it("rutas sin persona (webhooks, portal del contador): solo cuenta 'on'", async () => {
    const { sb } = fakeSb({ _users: [QA], webhooks: "qa", accountant: "on" })
    expect(await globalApiOn("webhooks", sb, E)).toBeNull()
    resetRolloutCache()
    expect((await globalApiOn("accountant", sb, E))?.url).toBe("https://api.test")
  })
})

describe("viaApi / viaApiOr", () => {
  it("sin URL nunca va por la API aunque el módulo esté encendido", () => {
    expect(viaApi({ url: "", flags: { me: true } }, "me")).toBe(false)
    expect(viaApi(null, "me")).toBe(false)
    expect(viaApi(API_OFF, "chat")).toBe(false)
  })

  it("apagado llama la acción con los mismos argumentos; encendido, la API", async () => {
    let on = false
    const action = vi.fn(async (a: number, b: string) => `acción ${a} ${b}`)
    const api = vi.fn(async (a: number, b: string) => `api ${a} ${b}`)
    const fn = viaApiOr(() => on, action, api)
    expect(await fn(1, "x")).toBe("acción 1 x")
    expect(api).not.toHaveBeenCalled()
    on = true
    expect(await fn(2, "y")).toBe("api 2 y")
    expect(action).toHaveBeenCalledTimes(1)
  })
})

describe("sesión del navegador (session.ts)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it("en el servidor de Next no guarda nada (apiOn siempre false)", async () => {
    const s = await import("./session")
    s.setApiSession({ cfg: { url: "https://api.test", flags: { chat: true } }, userId: QA, householdId: "h", bookId: "b" })
    expect(s.apiSession()).toBeNull()
    expect(s.apiOn("chat")).toBe(false)
  })

  it("en el navegador: interruptores, libro y hogar activos", async () => {
    vi.stubGlobal("window", {})
    const s = await import("./session")
    expect(s.apiOn("chat")).toBe(false)
    expect(() => s.activeBookId()).toThrow()
    s.setApiSession({ cfg: { url: "https://api.test", flags: { chat: true, "book-tables:goals": true } }, userId: QA, householdId: "h1", bookId: "b1" })
    expect(s.apiOn("chat")).toBe(true)
    expect(s.apiOn("me")).toBe(false)
    expect(s.apiOn("book-tables", "goals")).toBe(true)
    expect(s.activeBookId()).toBe("b1")
    expect(s.activeHouseholdId()).toBe("h1")
  })
})
