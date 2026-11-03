// Pruebas de las colas portables (V7-F) sin red ni nube: sobre, espera creciente, deduplicación, empuje HTTP con fetch
// simulado, Cloud Tasks con la traza, credenciales del despacho y elección del adaptador.
import { ClsServiceManager } from "nestjs-cls"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SqsQueue } from "../../adapters/aws/sqs.queue"
import { ServiceBusQueue } from "../../adapters/azure/service-bus.queue"
import { GcpMetadata } from "../../adapters/gcp/metadata"
import { loadConfig } from "../config/config.schema"
import { CTX } from "../context/request-context"
import { CloudTasksQueue } from "./cloud-tasks.queue"
import { MemoryDedupeStore } from "./dedupe"
import { DispatchError, TaskDispatcher, tokenSource } from "./dispatch"
import { backoffS, parseEnvelope, shortId, toEnvelope } from "./envelope"
import { createConsumer, createQueue } from "./factory"
import { HttpQueue, isPermanent } from "./http.queue"
import { InlineQueue } from "./inline.queue"
import { traceCarrier } from "./trace"

const base = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "k" }
const TRACE = { traceId: "0af7651916cd43dd8448eb211c80319c", spanId: "b7ad6b7169203331", sampled: true }
const TP = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"

/** Ejecuta `fn` como si estuviera dentro de una petición con esa traza (RequestContext de nestjs-cls). */
function inRequest<T>(fn: () => Promise<T>): Promise<T> {
  const cls = ClsServiceManager.getClsService()
  return cls.run(() => {
    cls.set(CTX, { requestId: "r1", startedAt: Date.now(), trace: TRACE })
    return fn()
  })
}

const ok = () => new Response("{}", { status: 200 })

afterEach(() => {
  vi.useRealTimers()
})

describe("sobre de la tarea", () => {
  it("lleva ruta, cuerpo, notBefore y la traza de la petición; parse rechaza basura", async () => {
    const env = await inRequest(async () => toEnvelope({ queue: "notify", path: "/v1/jobs/x", name: "n1", body: { a: 1 }, delayS: 5 }, 1_000))
    expect(env).toEqual({ v: 1, queue: "notify", name: "n1", path: "/v1/jobs/x", body: { a: 1 }, notBefore: 6_000, traceparent: TP })
    expect(parseEnvelope(JSON.stringify(env))).toEqual(env)
    expect(parseEnvelope(Buffer.from(JSON.stringify(env)))).toEqual(env)
    expect(parseEnvelope("{no es json")).toBeUndefined()
    expect(parseEnvelope({ v: 1, queue: "otra", name: "x", path: "/x" })).toBeUndefined()
    expect(toEnvelope({ queue: "slow", path: "/x" }).name).toMatch(/^[0-9a-f-]{36}$/)
    expect(traceCarrier()).toEqual({})
  })

  it("ids cortos estables y espera creciente con tope", () => {
    expect(shortId("corto")).toBe("corto")
    const largo = "x".repeat(300)
    expect(shortId(largo)).toBe(shortId(largo))
    expect(shortId(largo)).toHaveLength(66)
    expect([1, 2, 3, 4, 10].map((a) => backoffS(a, 10, 900, 0))).toEqual([10, 20, 40, 80, 900])
    expect(backoffS(1, 10, 900, 1)).toBe(11)
    expect(isPermanent(400)).toBe(true)
    expect(isPermanent(503)).toBe(false)
    expect(isPermanent(401)).toBe(false)
  })

  it("MemoryDedupeStore: gana el primero, vence con el TTL y release libera", async () => {
    let now = 0
    const d = new MemoryDedupeStore(() => now)
    expect(await d.claim("k", 60)).toBe(true)
    expect(await d.claim("k", 60)).toBe(false)
    now = 60_001
    expect(await d.claim("k", 60)).toBe(true)
    await d.release("k")
    expect(await d.claim("k", 60)).toBe(true)
  })
})

describe("TaskDispatcher y credenciales", () => {
  it("POST con Bearer, traza, nombre e intento; un no-2xx es DispatchError con el status", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok()).mockResolvedValueOnce(new Response("detalle interno", { status: 503 })).mockRejectedValueOnce(new TypeError("fetch failed"))
    const d = new TaskDispatcher({ baseUrl: "https://api.mirai.test/", token: async () => "tok", timeoutS: 5, fetch: f as never })
    expect(await d.dispatch({ name: "n1", path: "/v1/jobs/a", body: { x: 1 }, attempt: 2, traceparent: TP })).toBe(200)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe("https://api.mirai.test/v1/jobs/a")
    expect(init.headers).toMatchObject({ authorization: "Bearer tok", traceparent: TP, "x-mirai-task": "n1", "x-mirai-attempt": "2", "content-type": "application/json" })
    expect(JSON.parse(init.body)).toEqual({ x: 1 })
    await expect(d.dispatch({ name: "n2", path: "/x" })).rejects.toMatchObject({ status: 503, message: "El trabajador respondió 503" })
    await expect(d.dispatch({ name: "n3", path: "/x" })).rejects.toBeInstanceOf(DispatchError)
  })

  it("secret, client_credentials (Basic + caché) y gcp (servidor de metadatos)", async () => {
    await expect(tokenSource({ kind: "secret", secret: "s3" })()).resolves.toBe("s3")
    await expect(tokenSource({ kind: "secret" })()).rejects.toThrow(/CRON_SECRET/)
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "at-1", expires_in: 3600 }), { status: 200 }))
    const cc = tokenSource({ kind: "client_credentials", tokenUrl: "https://auth.mirai.test/oauth2/token", clientId: "cid", clientSecret: "csec", scope: "mirai/jobs" }, f as never)
    expect(await cc()).toBe("at-1")
    expect(await cc()).toBe("at-1")
    expect(f).toHaveBeenCalledTimes(1)
    const [, init] = f.mock.calls[0]
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from("cid:csec").toString("base64")}`)
    expect(String(init.body)).toBe("grant_type=client_credentials&scope=mirai%2Fjobs")

    const exp = Math.floor(Date.now() / 1000) + 3600
    const jwt = `e30.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig`
    const mf = vi.fn().mockResolvedValue(new Response(jwt, { status: 200 }))
    const meta = new GcpMetadata(mf as never)
    expect(await meta.identityToken("https://api.mirai.test")).toBe(jwt)
    expect(await meta.identityToken("https://api.mirai.test")).toBe(jwt)
    expect(mf).toHaveBeenCalledTimes(1)
    expect(mf.mock.calls[0][0]).toBe("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=https%3A%2F%2Fapi.mirai.test&format=full")
    expect(mf.mock.calls[0][1].headers).toEqual({ "Metadata-Flavor": "Google" })
  })
})

describe("HttpQueue (QUEUE_DRIVER=http)", () => {
  const make = (f: ReturnType<typeof vi.fn>, o: { maxAttempts?: number } = {}) =>
    new HttpQueue({ dispatcher: new TaskDispatcher({ baseUrl: "https://api.mirai.test", token: async () => "cron", timeoutS: 5, fetch: f as never }), maxAttempts: o.maxAttempts ?? 3, retryBaseS: 1, retryMaxS: 4 })

  it("despacha en segundo plano con la traza de la petición y deduplica por nombre", async () => {
    const f = vi.fn().mockResolvedValue(ok())
    const q = make(f)
    expect(await inRequest(() => q.enqueue({ queue: "notify", path: "/v1/jobs/notify/household/h1", name: "notify-h1-2026110210", body: { a: 1 } }))).toEqual({ name: "notify-h1-2026110210", deduped: false })
    expect(await q.enqueue({ queue: "notify", path: "/x", name: "notify-h1-2026110210" })).toEqual({ name: "notify-h1-2026110210", deduped: true })
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    expect(f.mock.calls[0][1].headers).toMatchObject({ authorization: "Bearer cron", traceparent: TP, "x-mirai-attempt": "1" })
    await expect(q.enqueue({ queue: "slow", path: "/x", name: "con espacios" })).rejects.toThrow(/inválido/)
    await q.close()
  })

  it("reintenta con espera creciente, no reintenta un 400 y respeta el retraso", async () => {
    vi.useFakeTimers()
    const f = vi.fn().mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(new Response("", { status: 500 })).mockResolvedValue(ok())
    const q = make(f)
    await q.enqueue({ queue: "automations", path: "/v1/jobs/a", name: "a1", delayS: 2 })
    await vi.advanceTimersByTimeAsync(1_900)
    expect(f).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(200)
    expect(f).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_200) // 1 s (+10 %) tras el primer fallo
    expect(f).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2_300) // 2 s tras el segundo
    expect(f).toHaveBeenCalledTimes(3)
    expect(f.mock.calls[2][1].headers["x-mirai-attempt"]).toBe("3")
    await vi.advanceTimersByTimeAsync(10_000)
    expect(f).toHaveBeenCalledTimes(3)

    const g = vi.fn().mockResolvedValue(new Response("", { status: 400 }))
    const q2 = make(g)
    await q2.enqueue({ queue: "slow", path: "/v1/jobs/b", name: "b1" })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(g).toHaveBeenCalledTimes(1)
    expect(q2.pending).toBe(0)
  })

  it("se rinde tras maxAttempts", async () => {
    vi.useFakeTimers()
    const f = vi.fn().mockResolvedValue(new Response("", { status: 502 }))
    const q = make(f, { maxAttempts: 2 })
    await q.enqueue({ queue: "notify", path: "/x", name: "x1" })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(f).toHaveBeenCalledTimes(2)
    expect(q.pending).toBe(0)
  })
})

describe("Cloud Tasks e inline", () => {
  it("Cloud Tasks manda el traceparent como encabezado y usa el id de cola configurado", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "projects/p/locations/l/queues/mirai-notify/tasks/n1" }), { status: 200 }))
    const q = new CloudTasksQueue({ project: "p", location: "l", serviceAccount: "t@p.iam.gserviceaccount.com", baseUrl: "https://api.mirai.test", queues: { notify: "mirai-notify" }, fetch: f as never, token: async () => "tok" })
    expect(await inRequest(() => q.enqueue({ queue: "notify", path: "/v1/jobs/x", name: "n1" }))).toEqual({ name: "n1", deduped: false })
    expect(f.mock.calls[0][0]).toBe("https://cloudtasks.googleapis.com/v2/projects/p/locations/l/queues/mirai-notify/tasks")
    const { task } = JSON.parse(f.mock.calls[0][1].body)
    expect(task.httpRequest.headers).toEqual({ "content-type": "application/json", traceparent: TP, "x-mirai-task": "n1" })
    expect(task.name).toBe("projects/p/locations/l/queues/mirai-notify/tasks/n1")
  })

  it("Cloud Tasks pide el token al servidor de metadatos y lo cachea", async () => {
    const f = vi.fn(async (u: string, _i?: RequestInit) => (u.startsWith("http://metadata") ? new Response(JSON.stringify({ access_token: "meta-tok", expires_in: 3600 })) : new Response(JSON.stringify({ name: "a/b/tasks/x" }))))
    const q = new CloudTasksQueue({ project: "p", location: "l", serviceAccount: "t@p", baseUrl: "https://api", fetch: f as never })
    await q.enqueue({ queue: "slow", path: "/x" })
    await q.enqueue({ queue: "slow", path: "/y" })
    expect(f.mock.calls.filter(([u]) => String(u).startsWith("http://metadata"))).toHaveLength(1)
    expect(f.mock.calls[1][1]!.headers).toMatchObject({ authorization: "Bearer meta-tok" })
  })
})

describe("fábrica (QUEUE_DRIVER)", () => {
  it("elige el adaptador y el consumidor; MODE=worker solo con colas de extracción", () => {
    expect(createQueue(loadConfig(base))).toBeInstanceOf(InlineQueue)
    expect(createQueue(loadConfig({ ...base, QUEUE_DRIVER: "cloudtasks", GCP_PROJECT: "p", API_BASE_URL: "https://api", TASKS_SERVICE_ACCOUNT: "t@p" }))).toBeInstanceOf(CloudTasksQueue)
    const sqs = { ...base, QUEUE_DRIVER: "sqs", QUEUE_NOTIFY: "https://sqs.us-east-1.amazonaws.com/1/n", QUEUE_AUTOMATIONS: "https://sqs.us-east-1.amazonaws.com/1/a", QUEUE_SLOW: "https://sqs.us-east-1.amazonaws.com/1/s" }
    expect(createQueue(loadConfig(sqs))).toBeInstanceOf(SqsQueue)
    expect(createConsumer(loadConfig(sqs))).toBeInstanceOf(SqsQueue)
    expect(createQueue(loadConfig({ ...base, QUEUE_DRIVER: "servicebus", SERVICEBUS_NAMESPACE: "ns.servicebus.windows.net" }))).toBeInstanceOf(ServiceBusQueue)
    expect(createQueue(loadConfig({ ...base, QUEUE_DRIVER: "http", API_BASE_URL: "https://api", CRON_SECRET: "c" }))).toBeInstanceOf(HttpQueue)
    expect(() => createConsumer(loadConfig(base))).toThrow(/MODE=worker no sirve/)
  })
})
