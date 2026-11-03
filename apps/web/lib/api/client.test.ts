// Cliente de la API (v6 F2-H-1): errores en español, fetcher (Bearer, Idempotency-Key, traceparent, 401 → renovar,
// reintentos sensatos), unwrap, reintentos de TanStack y el CRUD/snapshot del libro. Sin red: fetch falso.
import { describe, expect, it, vi } from "vitest"
import { initClient } from "@ts-rest/core"
import { apiContract } from "@mirai/contracts/api"
import { ApiError, failure, NETWORK_MSG } from "./errors"
import { createApiFetcher, createRawFetch, newTraceparent } from "./fetcher"
import { unwrap, unwrapData } from "./unwrap"
import { apiRetry } from "./query"
import { canFallback, listQuery, listableViaApi, readWithFallback, writeBody, writableViaApi } from "./book-tables"

const BOOK = "11111111-1111-4111-8111-111111111111"
const ROW = "22222222-2222-4222-8222-222222222222"
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })

type Call = { url: string; init: RequestInit & { headers: Record<string, string> } }
function fakeFetch(...responses: (Response | Error)[]) {
  const calls: Call[] = []
  const f = vi.fn(async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init: init as Call["init"] })
    const r = responses.shift()
    if (!r) throw new Error("sin más respuestas")
    if (r instanceof Error) throw r
    return r
  })
  return { f: f as unknown as typeof fetch, calls }
}
const token = (t: string | null = "tok-1", renewed = "tok-2") => ({ get: vi.fn(async (force?: boolean) => (force ? renewed : t)) })
const noSleep = async () => {}

describe("ApiError", () => {
  it("usa el msg en español de la API y su código", () => {
    const e = ApiError.from(403, { ok: false, msg: "Tu rol no permite registrar gastos.", code: "ROLE_DENIED", requestId: "r1" })
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe("Tu rol no permite registrar gastos.")
    expect(e.code).toBe("ROLE_DENIED")
    expect(e.status).toBe(403)
    expect(e.requestId).toBe("r1")
  })

  it("sin cuerpo usa un mensaje claro por código HTTP", () => {
    expect(ApiError.from(502, null).message).toMatch(/servicio externo/)
    expect(ApiError.from(503, "Service Unavailable").message).toMatch(/ocupado/)
    expect(ApiError.from(418, null).code).toBe("VALIDATION")
    expect(ApiError.from(599, null).code).toBe("INTERNAL")
    expect(ApiError.from(429, {}, new Headers({ "retry-after": "12" })).retryAfter).toBe(12)
    expect(ApiError.from(400, { msg: "x", code: "RARO" }).code).toBe("VALIDATION")
  })

  it("red caída y forma { ok:false, msg } de las Server Actions", () => {
    expect(ApiError.network().message).toBe(NETWORK_MSG)
    expect(failure(ApiError.from(402, { msg: "Premium" }))).toEqual({ ok: false, msg: "Premium" })
  })
})

describe("fetcher", () => {
  it("lectura: Bearer, X-Mirai-Client y traceparent, sin Idempotency-Key", async () => {
    const { f, calls } = fakeFetch(json(200, { a: 1 }))
    const raw = createRawFetch({ token: token(), fetch: f, client: "web@test", sleep: noSleep })
    const res = await raw({ url: "https://api.test/v1/me", method: "get" })
    expect(res.status).toBe(200)
    const h = calls[0].init.headers
    expect(h.authorization).toBe("Bearer tok-1")
    expect(h["x-mirai-client"]).toBe("web@test")
    expect(h.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
    expect(h["idempotency-key"]).toBeUndefined()
    expect(calls[0].init.method).toBe("GET")
  })

  it("escritura: Idempotency-Key, y la MISMA llave al reintentar un 503", async () => {
    const { f, calls } = fakeFetch(json(503, null), json(200, { ok: true, data: 1 }))
    const raw = createRawFetch({ token: token(), fetch: f, sleep: noSleep, newKey: () => "k-1" })
    const res = await raw({ url: "https://api.test/v1/x", method: "POST", body: "{}" })
    expect(res.status).toBe(200)
    expect(calls).toHaveLength(2)
    expect(calls[0].init.headers["idempotency-key"]).toBe("k-1")
    expect(calls[1].init.headers["idempotency-key"]).toBe("k-1")
  })

  it("respeta una Idempotency-Key que ya viene", async () => {
    const { f, calls } = fakeFetch(json(200, {}))
    await createRawFetch({ token: token(), fetch: f })({ url: "u", method: "PUT", headers: { "Idempotency-Key": "mía" } })
    expect(calls[0].init.headers["idempotency-key"]).toBe("mía")
  })

  it("escritura: no reintenta 500 ni 502 (podría haberse aplicado) ni 4xx", async () => {
    for (const status of [500, 502, 400, 409, 429]) {
      const { f, calls } = fakeFetch(json(status, { ok: false, msg: "x", code: "INTERNAL" }))
      const res = await createRawFetch({ token: token(), fetch: f, sleep: noSleep })({ url: "u", method: "POST" })
      expect(res.status).toBe(status)
      expect(calls).toHaveLength(1)
    }
  })

  it("lectura: reintenta red y 502/503/504 hasta 2 veces con espera creciente", async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    const { f, calls } = fakeFetch(new TypeError("Failed to fetch"), json(504, null), json(200, []))
    const res = await createRawFetch({ token: token(), fetch: f, sleep })({ url: "u", method: "GET" })
    expect(res.status).toBe(200)
    expect(calls).toHaveLength(3)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([300, 900])
  })

  it("sin respuesta después de los reintentos: ApiError de red en español", async () => {
    const { f } = fakeFetch(new TypeError("x"), new TypeError("x"), new TypeError("x"))
    await expect(createRawFetch({ token: token(), fetch: f, sleep: noSleep })({ url: "u", method: "GET" })).rejects.toMatchObject({ code: "NETWORK", message: NETWORK_MSG })
  })

  it("cancelar (AbortError) no se reintenta", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" })
    const { f, calls } = fakeFetch(abort)
    await expect(createRawFetch({ token: token(), fetch: f, sleep: noSleep })({ url: "u", method: "GET" })).rejects.toBe(abort)
    expect(calls).toHaveLength(1)
  })

  it("401 con token: lo renueva una vez y reintenta (sin contar como reintento)", async () => {
    const t = token()
    const { f, calls } = fakeFetch(json(401, { ok: false, msg: "Tu sesión se cerró.", code: "UNAUTHENTICATED" }), json(200, {}))
    const res = await createRawFetch({ token: t, fetch: f, sleep: noSleep })({ url: "u", method: "POST" })
    expect(res.status).toBe(200)
    expect(t.get).toHaveBeenLastCalledWith(true)
    expect(calls[1].init.headers.authorization).toBe("Bearer tok-2")
  })

  it("401 dos veces o sin sesión: se devuelve el 401 (sin bucles)", async () => {
    const { f, calls } = fakeFetch(json(401, {}), json(401, {}))
    expect((await createRawFetch({ token: token(), fetch: f, sleep: noSleep })({ url: "u", method: "GET" })).status).toBe(401)
    expect(calls).toHaveLength(2)
    const sinSesion = fakeFetch(json(401, {}))
    const res = await createRawFetch({ token: token(null), fetch: sinSesion.f })({ url: "u", method: "GET" })
    expect(res.status).toBe(401)
    expect(sinSesion.calls[0].init.headers.authorization).toBeUndefined()
  })

  it("traceparent nuevo en cada llamada", () => {
    expect(newTraceparent()).not.toBe(newTraceparent())
  })
})

describe("cliente ts-rest + unwrap", () => {
  const client = (f: typeof fetch) => initClient(apiContract, { baseUrl: "https://api.test", api: createApiFetcher({ token: token(), fetch: f, sleep: noSleep }), throwOnUnknownStatus: false })

  it("arma la ruta del contrato con la consulta y devuelve el cuerpo", async () => {
    const { f, calls } = fakeFetch(json(200, [{ id: ROW }]))
    const rows = unwrap(await client(f).bookTables.list({ params: { bookId: BOOK, table: "goals" }, query: listQuery({ order: { column: "nombre" }, eq: { activo: true, padre: null } }) }))
    expect(rows).toEqual([{ id: ROW }])
    const u = new URL(calls[0].url)
    expect(u.pathname).toBe(`/v1/books/${BOOK}/t/goals`)
    expect(u.searchParams.get("order")).toBe("nombre.asc")
    expect(u.searchParams.get("eq.activo")).toBe("true")
    expect(u.searchParams.get("eq.padre")).toBe("null")
  })

  it("comandos { ok:true, data } y errores { ok:false, msg } → ApiError", async () => {
    const { f } = fakeFetch(json(200, { ok: true, data: { id: ROW, deleted_at: "2026-11-02T00:00:00Z" } }), json(402, { ok: false, msg: "Mesadas no está incluido en tu plan.", code: "PLAN_REQUIRED" }))
    const c = client(f)
    expect(unwrapData(await c.bookTables.remove({ params: { bookId: BOOK, table: "goals", id: ROW } }))).toEqual({ id: ROW, deleted_at: "2026-11-02T00:00:00Z" })
    const res = await c.bookTables.upsert({ params: { bookId: BOOK, table: "allowances", id: ROW }, body: { nombre: "x" } })
    expect(() => unwrap(res)).toThrowError("Mesadas no está incluido en tu plan.")
    try { unwrap(res) } catch (e) { expect((e as ApiError).code).toBe("PLAN_REQUIRED") }
  })

  it("unwrapData con una respuesta sin { ok, data } avisa en español", () => {
    expect(() => unwrapData({ status: 200, body: [], headers: new Headers() })).toThrowError(/forma esperada/)
  })

  it("PUT del CRUD lleva Idempotency-Key y cuerpo sin columnas del sistema", async () => {
    const { f, calls } = fakeFetch(json(200, { id: ROW }))
    await client(f).bookTables.upsert({ params: { bookId: BOOK, table: "goals", id: ROW }, body: writeBody({ id: ROW, book_id: BOOK, created_by: "u", created_at: "x", updated_at: "y", deleted_at: null, nombre: "Viaje", meta: 1000, extra: undefined }) })
    expect(calls[0].init.method).toBe("PUT")
    expect(calls[0].init.headers["idempotency-key"]).toBeTruthy()
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ nombre: "Viaje", meta: 1000 })
  })
})

describe("reintentos de TanStack (apiRetry)", () => {
  it("nunca reintenta lo que la persona tiene que leer; uno más para red o 5xx", () => {
    for (const code of ["VALIDATION", "ROLE_DENIED", "PLAN_REQUIRED", "NOT_FOUND", "UNAUTHENTICATED", "RATE_LIMITED", "CONFLICT"] as const)
      expect(apiRetry(0, new ApiError({ msg: "x", code, status: 400 }))).toBe(false)
    expect(apiRetry(0, ApiError.network())).toBe(true)
    expect(apiRetry(1, ApiError.network())).toBe(false)
    expect(apiRetry(0, new ApiError({ msg: "x", code: "UPSTREAM", status: 502 }))).toBe(true)
  })
})

describe("CRUD del libro por la API", () => {
  it("solo tablas genéricas y sin relaciones embebidas", () => {
    expect(listableViaApi("goals")).toBe(true)
    expect(listableViaApi("goals", "id,nombre")).toBe(true)
    expect(listableViaApi("loans", "*, loan_payments(*)")).toBe(false)
    expect(listableViaApi("chat_threads")).toBe(false)
    expect(listableViaApi("profiles")).toBe(false)
    expect(writableViaApi("expenses")).toBe(true)
    expect(writableViaApi("automation_runs")).toBe(false)
  })

  it("listQuery: misma semántica que useList", () => {
    expect(listQuery({})).toEqual({})
    expect(listQuery({ select: "*" })).toEqual({})
    expect(listQuery({ select: "id, nombre", order: { column: "fecha", ascending: false }, eq: { tipo: "x", n: 2, borrador: undefined } })).toEqual({ select: "id,nombre", order: "fecha.desc", "eq.tipo": "x", "eq.n": "2" })
  })

  it("lecturas con respaldo solo si la API no respondió o falló de su lado", async () => {
    const local = vi.fn(async () => "local")
    expect(await readWithFallback(async () => { throw ApiError.network() }, local)).toBe("local")
    expect(await readWithFallback(async () => { throw ApiError.from(503, null) }, local)).toBe("local")
    await expect(readWithFallback(async () => { throw ApiError.from(403, { msg: "No" }) }, local)).rejects.toThrow("No")
    await expect(readWithFallback(async () => { throw new Error("otro") }, local)).rejects.toThrow("otro")
    expect(await readWithFallback(async () => "api", local)).toBe("api")
    expect(canFallback(ApiError.from(404, null))).toBe(false)
  })
})
