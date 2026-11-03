// Unitarias del gateway (F2-G): rutas de los cambios, presencia (memoria y Redis), escucha de pg_notify, configuración,
// emisor de la API y paridad de la migración del trigger con NOTIFY_TABLES.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import pino from "pino"
import { HOUSEHOLD_TABLES, LIVE_TABLES } from "@mirai/contracts/live"
import { LIVE_NOTIFY_CHANNEL, liveSource, NOTIFY_TABLES, PgLiveNotify, rooms } from "@mirai/contracts/modules/realtime"
import { createBurst } from "@mirai/contracts/realtime-client"
import { ConfigError } from "../../core/config/config.schema"
import { LiveFanout, type LiveSink } from "./live-fanout"
import { roomsFor, routeChange, routeNotify } from "./live-routes"
import { PgLiveListener, type PgListenClient } from "./pg-live.listener"
import { MemoryPresenceStore, presenceKey, RedisPresenceStore, type RedisLike } from "./presence.store"
import { emitterSink } from "./realtime-publisher.module"
import { loadRealtimeConfig, type RealtimeConfig } from "./realtime.config"

const B = "00000101-0000-4000-8000-000000000101"
const H = "00000100-0000-4000-8000-000000000100"
const U = "00000001-0000-4000-8000-000000000001"
const log = pino({ level: "silent" })

describe("rutas de los cambios", () => {
  it("cada tabla en vivo va a la sala del libro con evento change", () => {
    for (const t of LIVE_TABLES) {
      expect(routeNotify({ t, op: "UPDATE", id: "x", b: B })).toEqual({ deliveries: [{ rooms: [rooms.book(B)], event: "change", payload: { table: t, bookId: B, id: "x", op: "UPDATE" } }] })
    }
  })
  it("tablas del hogar a la sala del hogar; household_members pide revisar membresías", () => {
    expect(routeNotify({ t: "family_members", op: "INSERT", h: H }).revalidateHousehold).toBeUndefined()
    const r = routeNotify({ t: "household_members", op: "DELETE", h: H, u: U })
    expect(r).toEqual({ deliveries: [{ rooms: [rooms.household(H)], event: "change", payload: { table: "household_members", householdId: H, id: undefined, op: "DELETE" } }], revalidateHousehold: H })
    for (const t of HOUSEHOLD_TABLES) expect(routeNotify({ t, op: "UPDATE" })).toEqual({ deliveries: [] }) // sin hogar no va a ningún lado
  })
  it("notifications a la persona; automation_events solo INSERT", () => {
    expect(routeNotify({ t: "notifications", op: "INSERT", id: "n", u: U, b: B }).deliveries).toEqual([{ rooms: [rooms.user(U)], event: "notification", payload: { id: "n", op: "INSERT" } }])
    expect(routeNotify({ t: "notifications", op: "INSERT" }).deliveries).toEqual([])
    expect(routeNotify({ t: "automation_events", op: "INSERT", id: "a", b: B }).deliveries).toEqual([{ rooms: [rooms.book(B)], event: "automation", payload: { bookId: B, id: "a" } }])
    expect(routeNotify({ t: "automation_events", op: "UPDATE", b: B }).deliveries).toEqual([])
  })
  it("rol mínimo por tabla: salas por rol desde ese rango hacia arriba", () => {
    expect(roomsFor(B)).toEqual([rooms.book(B)])
    expect(roomsFor(B, "viewer")).toEqual([rooms.book(B)])
    expect(roomsFor(B, "editor")).toEqual(["owner", "admin", "editor"].map((r) => `book:${B}:${r}`))
    expect(routeChange({ table: "loans", bookId: B, op: "INSERT" }, { loans: "admin" }).deliveries[0].rooms).toEqual([`book:${B}:owner`, `book:${B}:admin`])
  })
  it("PgLiveNotify valida la carga del trigger", () => {
    expect(PgLiveNotify.safeParse({ t: "expenses", op: "INSERT", b: B }).success).toBe(true)
    expect(PgLiveNotify.safeParse({ t: "profiles", op: "INSERT" }).success).toBe(false)
    expect(PgLiveNotify.safeParse({ t: "expenses", op: "TRUNCATE" }).success).toBe(false)
    expect(PgLiveNotify.safeParse({ t: "expenses", op: "INSERT", b: "no-uuid" }).success).toBe(false)
  })
  it("LiveFanout reparte al destino y cuenta lo que se pierde sin destino", () => {
    const f = new LiveFanout(log)
    f.fromNotify({ t: "expenses", op: "INSERT", b: B })
    expect(f.stats.dropped).toBe(1)
    const sink: LiveSink = { deliver: vi.fn(), revalidateHousehold: vi.fn(), resyncAll: vi.fn() }
    f.attach(sink)
    f.fromNotify({ t: "household_members", op: "UPDATE", h: H })
    f.fromChange({ table: "expenses", bookId: B, op: "DELETE" })
    f.resyncAll("x")
    expect(sink.deliver).toHaveBeenCalledTimes(2)
    expect(sink.revalidateHousehold).toHaveBeenCalledWith(H)
    expect(sink.resyncAll).toHaveBeenCalledWith("x")
  })
})

describe("presencia", () => {
  const user = (id: string, at: string, path = "/") => ({ id, nombre: id === U ? "Ana" : "Beto", avatar: null, path, at })

  it("memoria: vence con el TTL y deduplica por persona (la más reciente)", async () => {
    let now = 1_000
    const s = new MemoryPresenceStore(() => now)
    await s.set(B, "s1", user(U, "2026-11-02T10:00:00Z", "/a"), 60_000)
    await s.set(B, "s2", user(U, "2026-11-02T10:00:05Z", "/b"), 60_000)
    await s.set(B, "s3", user("otro", "2026-11-02T10:00:01Z"), 10_000)
    expect((await s.list(B)).map((u) => [u.nombre, u.path])).toEqual([["Ana", "/b"], ["Beto", "/"]])
    now += 20_000
    expect((await s.list(B)).map((u) => u.nombre)).toEqual(["Ana"])
    await s.remove(B, "s1")
    await s.remove(B, "s2")
    expect(await s.list(B)).toEqual([])
  })

  it("Redis: HSET por conexión con TTL de la llave y limpieza de vencidas", async () => {
    const h = new Map<string, Map<string, string>>()
    const ttl: Record<string, number> = {}
    const redis: RedisLike = {
      hset: async (k, f, v) => void (h.get(k) ?? h.set(k, new Map()).get(k)!).set(f, v),
      hdel: async (k, ...fs) => void fs.forEach((f) => h.get(k)?.delete(f)),
      hgetall: async (k) => Object.fromEntries(h.get(k) ?? []),
      pexpire: async (k, ms) => void (ttl[k] = ms),
    }
    let now = 0
    const s = new RedisPresenceStore(redis, () => now)
    await s.set(B, "s1", user(U, "2026-11-02T10:00:00Z"), 60_000)
    await s.set(B, "s2", user("otro", "2026-11-02T10:00:00Z"), 1_000)
    h.get(presenceKey(B))!.set("roto", "{no json")
    expect(ttl[presenceKey(B)]).toBe(2_000)
    now = 5_000
    expect((await s.list(B)).map((u) => u.id)).toEqual([U])
    expect([...h.get(presenceKey(B))!.keys()]).toEqual(["s1"]) // borró la vencida y la ilegible
  })
})

describe("escucha de pg_notify", () => {
  const cfg = { pgListen: true, pgUrl: "postgres://local" } as RealtimeConfig

  function fakeClient(o: { lock: boolean }) {
    const handlers: Record<string, ((x?: unknown) => void)[]> = {}
    const queries: string[] = []
    const c: PgListenClient & { emit(ev: string, x?: unknown): void; queries: string[] } = {
      queries,
      connect: async () => undefined,
      query: async (sql: string) => {
        queries.push(sql)
        return { rows: sql.includes("advisory") ? [{ ok: o.lock }] : [] }
      },
      on: ((ev: string, fn: (x?: unknown) => void) => void (handlers[ev] ??= []).push(fn)) as PgListenClient["on"],
      end: async () => void c.emit("end"),
      emit: (ev, x) => handlers[ev]?.forEach((f) => f(x)),
    }
    return c
  }

  it("con el candado: LISTEN mirai_live, reparte los avisos, pide resync y se reconecta si se cae", async () => {
    const fanout = new LiveFanout(log)
    const sink: LiveSink = { deliver: vi.fn(), revalidateHousehold: vi.fn(), resyncAll: vi.fn() }
    fanout.attach(sink)
    const clients: ReturnType<typeof fakeClient>[] = []
    const l = new PgLiveListener(cfg, fanout, log, () => (clients.push(fakeClient({ lock: true })), clients.at(-1)!), { retryMs: 5, pingMs: 10_000 })
    l.onApplicationBootstrap()
    await vi.waitFor(() => expect(l.state.leader).toBe(true))
    expect(clients[0].queries).toEqual(["select pg_try_advisory_lock(hashtext($1)) as ok", `listen ${LIVE_NOTIFY_CHANNEL}`])
    expect(sink.resyncAll).toHaveBeenCalledTimes(1)
    clients[0].emit("notification", { channel: LIVE_NOTIFY_CHANNEL, payload: JSON.stringify({ t: "expenses", op: "INSERT", id: "e", b: B }) })
    expect(sink.deliver).toHaveBeenCalledWith({ rooms: [rooms.book(B)], event: "change", payload: { table: "expenses", bookId: B, id: "e", op: "INSERT" } })

    clients[0].emit("error", new Error("se cayó"))
    await vi.waitFor(() => expect(l.state.sessions).toBe(2))
    expect(sink.resyncAll).toHaveBeenCalledTimes(2)
    await l.onApplicationShutdown()
    expect(l.state.leader).toBe(false)
  })

  it("sin el candado (otra instancia escucha): no hace LISTEN y queda en espera", async () => {
    const fanout = new LiveFanout(log)
    const c = fakeClient({ lock: false })
    const l = new PgLiveListener(cfg, fanout, log, () => c, { standbyMs: 10_000 })
    l.onApplicationBootstrap()
    await vi.waitFor(() => expect(c.queries.length).toBe(1))
    await new Promise((r) => setTimeout(r, 20))
    expect(c.queries.some((q) => q.startsWith("listen"))).toBe(false)
    expect(l.state.leader).toBe(false)
    const stop = l.onApplicationShutdown()
    await Promise.race([stop, new Promise((r) => setTimeout(r, 50))])
  })

  it("apagada por defecto (REALTIME_PG_LISTEN=0): no abre conexiones", () => {
    const factory = vi.fn()
    new PgLiveListener({ pgListen: false } as RealtimeConfig, new LiveFanout(log), log, factory).onApplicationBootstrap()
    expect(factory).not.toHaveBeenCalled()
  })
})

describe("configuración", () => {
  const app = { webOrigins: ["http://localhost:3000"], db: { adapter: "supabase" as const, url: undefined } }
  it("valores por defecto: sin Redis, sin LISTEN, revisión cada 10 min y presencia de 60 s", () => {
    expect(loadRealtimeConfig({}, app)).toMatchObject({ redisUrl: undefined, path: "/socket.io", tokenCheckMs: 600_000, presenceTtlMs: 60_000, pgListen: false, apiEmit: true, maxBooks: 5 })
  })
  it("errores con el nombre de la variable, nunca su valor", () => {
    expect(() => loadRealtimeConfig({ REDIS_URL: "http://clave-secreta@host" }, app)).toThrow(ConfigError)
    try {
      loadRealtimeConfig({ REALTIME_PG_LISTEN: "1" }, app)
      expect.unreachable()
    } catch (e) {
      expect((e as ConfigError).problems.join()).toContain("REALTIME_DATABASE_URL")
    }
    expect(loadRealtimeConfig({ REALTIME_PG_LISTEN: "1" }, { ...app, db: { adapter: "pg", url: "postgres://x" } }).pgUrl).toBe("postgres://x")
    try {
      loadRealtimeConfig({ REDIS_URL: "http://clave-secreta@host" }, app)
    } catch (e) {
      expect(String((e as Error).message)).not.toContain("clave-secreta")
    }
  })
})

describe("emisor de la API (MODE=api → Redis → gateway)", () => {
  it("usa to(salas).emit, serverSideEmit para revalidar y emit para resync", () => {
    const emit = vi.fn()
    const em = { to: vi.fn(() => ({ emit })), serverSideEmit: vi.fn(), emit: vi.fn() }
    const sink = emitterSink(em as never)
    sink.deliver({ rooms: ["book:1"], event: "change", payload: { table: "expenses", bookId: B, op: "INSERT" } })
    sink.revalidateHousehold(H)
    sink.resyncAll("r")
    expect(em.to).toHaveBeenCalledWith(["book:1"])
    expect(emit).toHaveBeenCalledWith("change", { table: "expenses", bookId: B, op: "INSERT" })
    expect(em.serverSideEmit).toHaveBeenCalledWith("revalidate", H)
    expect(em.emit).toHaveBeenCalledWith("resync", { reason: "r" })
  })
})

describe("contratos compartidos", () => {
  it("la migración del trigger cubre exactamente NOTIFY_TABLES (automation_events solo INSERT)", () => {
    const sql = readFileSync(join(__dirname, "../../../../../supabase/migrations/20261103004100_live_notify.sql"), "utf8")
    const arr = (name: string) => [...(new RegExp(`${name} text\\[\\] := array\\[([^\\]]+)\\]`).exec(sql)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect([...arr("live_tables"), ...arr("insert_only")]).toEqual([...NOTIFY_TABLES])
    expect(arr("insert_only")).toEqual(["automation_events"])
    expect(sql).toContain(`pg_notify('${LIVE_NOTIFY_CHANNEL}'`)
    // No instala triggers al aplicarse: solo crea funciones.
    expect(sql.replace(/execute format\('create trigger[^;]+;/g, "")).not.toMatch(/^\s*create trigger/im)
  })
  it("interruptor del front: solo `gateway` activa el gateway", () => {
    expect(liveSource(undefined)).toBe("supabase")
    expect(liveSource("")).toBe("supabase")
    expect(liveSource("otra")).toBe("supabase")
    expect(liveSource(" Gateway ")).toBe("gateway")
  })
  it("createBurst agrupa la ráfaga en una sola descarga", async () => {
    const flush = vi.fn()
    const b = createBurst(20, flush)
    for (let i = 0; i < 100; i++) b.add(i % 2 ? "expenses" : "incomes")
    await new Promise((r) => setTimeout(r, 40))
    expect(flush).toHaveBeenCalledTimes(1)
    expect([...flush.mock.calls[0][0]].sort()).toEqual(["expenses", "incomes"])
  })
})
