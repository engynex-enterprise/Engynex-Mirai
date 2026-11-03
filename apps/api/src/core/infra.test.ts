// Pruebas de las piezas transversales con dobles: límites, idempotencia, colas, eventos y cifrado.
import { describe, expect, it, vi } from "vitest"
import pino from "pino"
import { CryptoService } from "./crypto/crypto.service"
import { EventsService } from "./events/events.service"
import { fingerprint } from "./idempotency/idempotency.interceptor"
import { MemoryIdempotencyStore } from "./idempotency/idempotency.store"
import { CloudTasksQueue } from "./queue/cloud-tasks.queue"
import { InlineQueue } from "./queue/inline.queue"
import { MemoryRateLimitStore, SupabaseRateLimitStore } from "./rate-limit/rate-limit.store"
import { hitWindow, limitMsg } from "./rate-limit/window"
import type { AppConfig } from "./config/app-config"
import type { SupabaseJsFactory } from "./db/supabase-js.factory"

const silent = pino({ level: "silent" })

describe("límites de tasa", () => {
  it("ventana fija alineada al reloj (misma regla que rate_limit_hit)", () => {
    const m = new Map()
    const t0 = 1_000_000_020_000
    expect(hitWindow(m, "k", 2, 60_000, t0)).toMatchObject({ ok: true, remaining: 1 })
    expect(hitWindow(m, "k", 2, 60_000, t0 + 1)).toMatchObject({ ok: true, remaining: 0 })
    expect(hitWindow(m, "k", 2, 60_000, t0 + 2).ok).toBe(false)
    expect(hitWindow(m, "k", 2, 60_000, t0 + 60_000).ok).toBe(true)
    expect(limitMsg(30_000)).toBe("Hiciste muchos intentos seguidos. Espera un minuto y vuelve a intentar.")
    expect(limitMsg(5 * 60_000, "Enviaste muchos mensajes")).toBe("Enviaste muchos mensajes. Espera 5 minutos y vuelve a intentar.")
  })

  it("SupabaseRateLimitStore llama rate_limit_hit con SystemScope y cae a memoria si la base falla", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [{ ok: false, remaining: 0, reset_ms: 1234 }], error: null }).mockRejectedValueOnce(new Error("fetch failed"))
    const sb = { for: vi.fn(() => ({ rpc })) } as unknown as SupabaseJsFactory
    const s = new SupabaseRateLimitStore(sb, silent)
    expect(await s.hit("chat:u1", 60, 600)).toEqual({ ok: false, remaining: 0, resetMs: 1234 })
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", { p_key: "chat:u1", p_max: 60, p_window_s: 600 })
    expect((sb.for as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({ kind: "system", reason: "rate-limit" })
    expect((await s.hit("chat:u1", 60, 600)).ok).toBe(true)
  })

  it("MemoryRateLimitStore", async () => {
    const s = new MemoryRateLimitStore(() => 0)
    await s.hit("x", 1, 60)
    expect((await s.hit("x", 1, 60)).ok).toBe(false)
  })
})

describe("idempotencia (memoria)", () => {
  it("nueva → en curso → terminada; otro cuerpo → mismatch; vence a las 24 h; release libera", async () => {
    let now = 0
    const s = new MemoryIdempotencyStore(() => now)
    const a = { fingerprint: "f1", userId: "u", route: "POST /x", ttlS: 86_400 }
    expect(await s.begin("k", a)).toEqual({ state: "new" })
    expect(await s.begin("k", a)).toEqual({ state: "inflight" })
    await s.complete("k", { status: 200, body: { ok: true } })
    expect(await s.begin("k", a)).toMatchObject({ state: "done", response: { status: 200, body: { ok: true } } })
    expect(await s.begin("k", { ...a, fingerprint: "f2" })).toEqual({ state: "mismatch" })
    now = 86_400_001
    expect(await s.begin("k", a)).toEqual({ state: "new" })
    await s.release("k")
    expect(await s.begin("k", a)).toEqual({ state: "new" })
  })
  it("la huella depende del método, la ruta y el cuerpo", () => {
    expect(fingerprint("POST", "/a", { v: 1 })).toBe(fingerprint("POST", "/a", { v: 1 }))
    expect(fingerprint("POST", "/a", { v: 1 })).not.toBe(fingerprint("POST", "/a", { v: 2 }))
    expect(fingerprint("POST", "/a", {})).not.toBe(fingerprint("POST", "/b", {}))
  })
})

describe("colas", () => {
  it("InlineQueue deduplica por nombre y despacha", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined)
    const q = new InlineQueue(dispatch)
    expect(await q.enqueue({ queue: "notify", path: "/v1/jobs/notify/household/h1", name: "notify-h1-2026110210" })).toEqual({ name: "notify-h1-2026110210", deduped: false })
    expect((await q.enqueue({ queue: "notify", path: "/x", name: "notify-h1-2026110210" })).deduped).toBe(true)
    await new Promise((r) => setImmediate(r))
    expect(dispatch).toHaveBeenCalledTimes(1)
    await expect(q.enqueue({ queue: "slow", path: "/x", name: "con espacios" })).rejects.toThrow(/inválido/)
  })

  it("CloudTasksQueue arma la tarea HTTP con OIDC y trata el 409 como duplicado", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "projects/p/locations/us-west1/queues/notify/tasks/notify-h1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 409 }))
    const q = new CloudTasksQueue({ project: "p", location: "us-west1", serviceAccount: "tasks@p.iam.gserviceaccount.com", baseUrl: "https://api.mirai.test/", fetch: f as never, token: async () => "tok" })
    expect(await q.enqueue({ queue: "notify", path: "/v1/jobs/notify/household/h1", name: "notify-h1", body: { h: 1 }, delayS: 5 })).toEqual({ name: "notify-h1", deduped: false })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe("https://cloudtasks.googleapis.com/v2/projects/p/locations/us-west1/queues/notify/tasks")
    expect(init.headers.authorization).toBe("Bearer tok")
    const { task } = JSON.parse(init.body)
    expect(task.name).toBe("projects/p/locations/us-west1/queues/notify/tasks/notify-h1")
    expect(task.httpRequest).toMatchObject({ url: "https://api.mirai.test/v1/jobs/notify/household/h1", httpMethod: "POST", oidcToken: { serviceAccountEmail: "tasks@p.iam.gserviceaccount.com", audience: "https://api.mirai.test/" } })
    expect(JSON.parse(Buffer.from(task.httpRequest.body, "base64").toString())).toEqual({ h: 1 })
    expect(task.scheduleTime).toBeTruthy()
    expect(await q.enqueue({ queue: "notify", path: "/x", name: "notify-h1" })).toEqual({ name: "notify-h1", deduped: true })
  })
})

describe("EventsService", () => {
  it("reparte a los suscriptores y no lanza si uno falla", async () => {
    const ev = new EventsService(silent)
    const got: unknown[] = []
    const off = ev.subscribe((c) => void got.push(c))
    ev.subscribe(() => {
      throw new Error("x")
    })
    ev.changed("b1", ["expenses", "fixed_expenses"], "e1", "INSERT")
    expect(got).toEqual([{ table: "expenses", bookId: "b1", id: "e1", op: "INSERT" }, { table: "fixed_expenses", bookId: "b1", id: "e1", op: "INSERT" }])
    off()
    ev.changed("b1", ["expenses"])
    expect(got).toHaveLength(2)
  })
})

describe("CryptoService (@mirai/crypto con la llave de la configuración)", () => {
  it("descifra lo que cifró la v5 y hace ida y vuelta", () => {
    const svc = new CryptoService({ encryptionKey: Buffer.alloc(32, 7).toString("base64") } as AppConfig)
    expect(svc.decrypt("v1.e3scq8tK5tn2Zyj8.IyposQwic6F-clBuD9kbCA._Sm3Jgi2cnb0ko9eO0tXToR0iJC-gP2kW7oRJpmz")).toBe("sk-prueba-mirai-v5 ñandú ✓")
    expect(svc.decrypt(svc.encrypt("hola"))).toBe("hola")
    expect(svc.mask("abcd1234")).toBe("••••1234")
  })
  it("sin llave: no está lista y cifrar da INTERNAL", () => {
    const svc = new CryptoService({} as AppConfig)
    expect(svc.ready).toBe(false)
    expect(() => svc.encrypt("x")).toThrow()
  })
})
