// Gateway de tiempo real de punta a punta (F2-G): app real con MODE=realtime en un puerto local y clientes
// socket.io-client reales. Sin Redis ni base: el trigger mirai_live se simula con PgLiveListener.handle().
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { io } from "socket.io-client"
import { LiveGatewayClient } from "@mirai/contracts/realtime-client"
import { LIVE_NOTIFY_CHANNEL, rooms } from "@mirai/contracts/modules/realtime"
import { EventsService } from "../../src/core/events/events.service"
import { PgLiveListener } from "../../src/modules/realtime/pg-live.listener"
import { RealtimeGateway } from "../../src/modules/realtime/realtime.gateway"
import { B_AJENO, B_GRATIS, B_PREMIUM, H_GRATIS, USERS } from "../setup/fixtures"
import { userToken } from "../setup/tokens"
import { collect, connect, connected, createRealtimeApp, next, ORIGIN_OK, type RtTestApp, type TestSocket, until, wait } from "./helpers"

let t: RtTestApp
const open: { close(): void }[] = []
const track = <T extends { close(): void }>(s: T) => (open.push(s), s)
const notify = (p: object) => t.app.get(PgLiveListener).handle({ channel: LIVE_NOTIFY_CHANNEL, payload: JSON.stringify(p) })

async function member(role: keyof typeof USERS, bookId = B_GRATIS): Promise<TestSocket> {
  const s = track(connect(t.url, await userToken(USERS[role])))
  expect(await connected(s)).toEqual({ ok: true })
  const ack = await s.emitWithAck("join:book", { bookId })
  expect(ack.ok, JSON.stringify(ack)).toBe(true)
  return s
}

beforeAll(async () => {
  t = await createRealtimeApp()
})
afterEach(async () => {
  for (const s of open.splice(0)) s.close()
  t.removed.clear()
  t.roles.clear()
  // Que el servidor termine de cerrar (y de limpiar la presencia) antes de la siguiente prueba.
  await until(() => t.app.get(RealtimeGateway).server.sockets.sockets.size === 0)
})
afterAll(async () => {
  await t?.close()
})

describe("autenticación en el handshake", () => {
  it("sin token: connect_error UNAUTHENTICATED en español", async () => {
    const r = await connected(track(connect(t.url, null)))
    expect(r).toMatchObject({ ok: false, data: { code: "UNAUTHENTICATED", msg: "Inicia sesión para ver los cambios en vivo." } })
  })

  it("token vencido, de otro emisor o basura: rechazado", async () => {
    for (const tok of [await userToken(USERS.owner, {}, { expSec: -120 }), await userToken(USERS.owner, {}, { iss: "https://otro.supabase.co/auth/v1" }), "a.b.c"]) {
      const r = await connected(track(connect(t.url, tok)))
      expect(r).toMatchObject({ ok: false, data: { code: "UNAUTHENTICATED" } })
    }
  })

  it("acepta `Authorization: Bearer` (clientes de servidor) y un origen permitido; rechaza otro origen", async () => {
    const tok = await userToken(USERS.viewer)
    expect(await connected(track(connect(t.url, null, { extraHeaders: { authorization: `Bearer ${tok}`, origin: ORIGIN_OK } })))).toEqual({ ok: true })
    expect(await connected(track(connect(t.url, tok, { extraHeaders: { origin: "https://engynex-mirai-abc123.vercel.app" } })))).toEqual({ ok: true })
    const bad = await connected(track(connect(t.url, tok, { extraHeaders: { origin: "https://malo.example" } })))
    expect(bad.ok).toBe(false)
  })

  it("también con long-polling (Cloud Run con afinidad de sesión)", async () => {
    const s = track(connect(t.url, await userToken(USERS.editor), { transports: ["polling"] }))
    expect(await connected(s)).toEqual({ ok: true })
    expect((await s.emitWithAck("join:book", { bookId: B_GRATIS })).ok).toBe(true)
  })
})

describe("join:book con membresía y rol", () => {
  it("los 5 roles entran a su libro; el ack trae hogar y rol", async () => {
    for (const role of ["owner", "admin", "editor", "registra", "viewer"] as const) {
      const s = track(connect(t.url, await userToken(USERS[role])))
      await connected(s)
      expect(await s.emitWithAck("join:book", { bookId: B_GRATIS })).toEqual({ ok: true, bookId: B_GRATIS, householdId: H_GRATIS, role })
    }
  })

  it("libro ajeno o de otro hogar: NOT_FOUND sin revelar que existe; id inválido: VALIDATION", async () => {
    const s = track(connect(t.url, await userToken(USERS.editor)))
    await connected(s)
    expect(await s.emitWithAck("join:book", { bookId: B_AJENO })).toEqual({ ok: false, code: "NOT_FOUND", msg: "No encontramos ese libro." })
    expect(await s.emitWithAck("join:book", { bookId: B_PREMIUM })).toMatchObject({ ok: false, code: "NOT_FOUND" })
    expect(await s.emitWithAck("join:book", { bookId: "nada" })).toMatchObject({ ok: false, code: "VALIDATION", msg: "Identificador inválido" })
  })

  it("las salas quedan: libro, libro por rol, hogar y persona", async () => {
    await member("registra")
    const srv = (await t.app.get(RealtimeGateway).server.fetchSockets()).find((x) => x.data.user?.id === USERS.registra)!
    expect([...srv.rooms].sort()).toEqual(
      [srv.id, rooms.book(B_GRATIS), rooms.bookRole(B_GRATIS, "registra"), rooms.household(H_GRATIS), rooms.user(USERS.registra)].sort(),
    )
  })

  it("límite de comandos por conexión: RATE_LIMITED", async () => {
    const s = await member("viewer")
    const acks = await Promise.all(Array.from({ length: 45 }, () => s.emitWithAck("leave:book", { bookId: B_PREMIUM })))
    expect(acks.filter((a) => !a.ok && a.code === "RATE_LIMITED").length).toBeGreaterThan(0)
  })
})

describe("cambios (equivalentes a postgres_changes)", () => {
  it("una tabla del libro llega a los miembros del libro y no a otros libros", async () => {
    const ana = await member("owner")
    const otro = await member("owner", B_PREMIUM)
    const got = collect(otro, "change")
    const p = next(ana, "change")
    notify({ t: "expenses", op: "INSERT", id: "e-1", b: B_GRATIS })
    expect(await p).toEqual({ table: "expenses", bookId: B_GRATIS, id: "e-1", op: "INSERT" })
    await wait(50)
    expect(got).toEqual([])
  })

  it("tablas del hogar → sala del hogar; notifications → solo la persona; automation_events INSERT → automation", async () => {
    const ana = await member("owner")
    const viewer = await member("viewer")
    const notifs = collect(viewer, "notification")
    const pHogar = next(viewer, "change")
    notify({ t: "family_members", op: "UPDATE", id: "f-1", h: H_GRATIS })
    expect(await pHogar).toEqual({ table: "family_members", householdId: H_GRATIS, id: "f-1", op: "UPDATE" })

    const pNotif = next(ana, "notification")
    notify({ t: "notifications", op: "INSERT", id: "n-1", u: USERS.owner, b: B_GRATIS })
    expect(await pNotif).toEqual({ id: "n-1", op: "INSERT" })

    const pAuto = next(viewer, "automation")
    notify({ t: "automation_events", op: "UPDATE", id: "a-0", b: B_GRATIS }) // solo INSERT
    notify({ t: "automation_events", op: "INSERT", id: "a-1", b: B_GRATIS })
    expect(await pAuto).toEqual({ bookId: B_GRATIS, id: "a-1" })
    await wait(50)
    expect(notifs).toEqual([])
  })

  it("avisos inválidos se ignoran (tabla desconocida, sin JSON, otro canal)", async () => {
    const s = await member("editor")
    const got = collect(s, "change")
    const l = t.app.get(PgLiveListener)
    const before = l.state.invalid
    notify({ t: "profiles", op: "UPDATE", id: "x" })
    l.handle({ channel: LIVE_NOTIFY_CHANNEL, payload: "{no es json" })
    l.handle({ channel: "otro", payload: JSON.stringify({ t: "expenses", op: "INSERT", b: B_GRATIS }) })
    await wait(50)
    expect(got).toEqual([])
    expect(l.state.invalid - before).toBe(2)
  })

  it("lo que avisa EventsService en el proceso (escrituras de la API) también llega", async () => {
    const s = await member("editor")
    const p = next(s, "change")
    t.app.get(EventsService).changed(B_GRATIS, ["categories"], "c-1", "UPDATE")
    expect(await p).toEqual({ table: "categories", bookId: B_GRATIS, id: "c-1", op: "UPDATE" })
  })

  it("entrega en menos de 1 s", async () => {
    const s = await member("admin")
    const t0 = performance.now()
    const p = next(s, "change")
    notify({ t: "incomes", op: "UPDATE", id: "i-1", b: B_GRATIS })
    await p
    expect(performance.now() - t0).toBeLessThan(1000)
  })
})

describe("presencia", () => {
  it("quién está y en qué pantalla; el id sale del token; al salir desaparece", async () => {
    const ana = await member("owner")
    const pepe = await member("editor")
    const p1 = next(pepe, "presence")
    expect(await ana.emitWithAck("presence:update", { bookId: B_GRATIS, path: "/gastos", nombre: "Ana", avatar: null })).toEqual({ ok: true })
    expect((await p1).users).toEqual([expect.objectContaining({ id: USERS.owner, nombre: "Ana", path: "/gastos" })])

    const p2 = next(ana, "presence")
    await pepe.emitWithAck("presence:update", { bookId: B_GRATIS, path: "/inicio", nombre: "Pepe", avatar: "mirai:gato" })
    expect((await p2).users.map((u) => [u.nombre, u.path])).toEqual([["Ana", "/gastos"], ["Pepe", "/inicio"]])

    const p3 = next(ana, "presence")
    pepe.close()
    expect((await p3).users.map((u) => u.id)).toEqual([USERS.owner])
  })

  it("dos pestañas de la misma persona cuentan una vez; sin entrar al libro: ROLE_DENIED", async () => {
    const a = await member("owner")
    const b = await member("owner")
    await a.emitWithAck("presence:update", { bookId: B_GRATIS, path: "/a", nombre: "Ana", avatar: null })
    const p = next(a, "presence")
    await b.emitWithAck("presence:update", { bookId: B_GRATIS, path: "/b", nombre: "Ana", avatar: null })
    expect((await p).users).toEqual([expect.objectContaining({ id: USERS.owner, path: "/b" })])
    expect(await a.emitWithAck("presence:update", { bookId: B_PREMIUM, path: "/x", nombre: "Ana", avatar: null })).toMatchObject({ ok: false, code: "ROLE_DENIED" })
  })

  it("al entrar recibe la lista actual", async () => {
    const ana = await member("owner")
    await ana.emitWithAck("presence:update", { bookId: B_GRATIS, path: "/metas", nombre: "Ana", avatar: null })
    const s = track(connect(t.url, await userToken(USERS.viewer)))
    await connected(s)
    const p = next(s, "presence")
    await s.emitWithAck("join:book", { bookId: B_GRATIS })
    expect((await p).users).toEqual([expect.objectContaining({ id: USERS.owner, path: "/metas" })])
  })
})

describe("revisión de token y membresía", () => {
  it("token vencido en la revisión periódica: auth:expired y desconexión", async () => {
    const s = await member("viewer")
    const p = next(s, "auth:expired")
    const off = new Promise<string>((r) => s.once("disconnect", r))
    await t.app.get(RealtimeGateway).sweep(Date.now() + 2 * 3600_000)
    expect(await p).toEqual({ msg: "Tu sesión venció. Volviendo a conectar…" })
    expect(await off).toBe("io server disconnect")
  })

  it("auth:refresh con token nuevo de la misma persona extiende la sesión; de otra persona, no", async () => {
    const s = await member("viewer")
    const r = await s.emitWithAck("auth:refresh", { token: await userToken(USERS.viewer, {}, { expSec: 7200 }) })
    expect(r).toMatchObject({ ok: true })
    expect(await s.emitWithAck("auth:refresh", { token: await userToken(USERS.owner) })).toMatchObject({ ok: false, code: "UNAUTHENTICATED" })
  })

  it("sacada del hogar: household_members cambia → book:left al instante y deja de recibir", async () => {
    const s = await member("registra")
    const left = next(s, "book:left")
    t.removed.add(USERS.registra)
    notify({ t: "household_members", op: "DELETE", h: H_GRATIS, u: USERS.registra })
    expect(await left).toEqual({ bookId: B_GRATIS, msg: "Ya no tienes acceso a este libro." })
    const got = collect(s, "change")
    notify({ t: "expenses", op: "INSERT", id: "e-9", b: B_GRATIS })
    await wait(80)
    expect(got).toEqual([])
  })

  it("cambio de rol: pasa a la sala del rol nuevo en la revisión", async () => {
    await member("editor")
    t.roles.set(USERS.editor, "viewer")
    await t.app.get(RealtimeGateway).sweep()
    const srv = (await t.app.get(RealtimeGateway).server.fetchSockets()).find((x) => x.data.user?.id === USERS.editor)!
    expect(srv.rooms.has(rooms.bookRole(B_GRATIS, "viewer"))).toBe(true)
    expect(srv.rooms.has(rooms.bookRole(B_GRATIS, "editor"))).toBe(false)
  })
})

describe("cliente compartido (@mirai/contracts/realtime-client)", () => {
  it("conecta, entra, recibe cambios, recupera la conexión sin perder eventos y avisa resync de la base", async () => {
    const tok = await userToken(USERS.owner)
    const c = track(new LiveGatewayClient({ io, url: t.url, getToken: async () => tok, socketOptions: { forceNew: true, reconnectionDelay: 50, reconnectionDelayMax: 100 } }))
    const statuses: string[] = []
    c.on("status", (s) => statuses.push(s))
    const changes: unknown[] = []
    c.on("change", (x) => changes.push(x))
    const resyncs: unknown[] = []
    c.on("resync", (r) => resyncs.push(r))

    expect(await c.join(B_GRATIS)).toEqual({ ok: true, bookId: B_GRATIS, householdId: H_GRATIS, role: "owner" })
    expect(c.status).toBe("en-vivo")
    expect(await c.join(B_GRATIS)).toMatchObject({ ok: true }) // segundo consumidor: no repite
    notify({ t: "goals", op: "UPDATE", id: "g-1", b: B_GRATIS })
    await until(() => changes.length === 1)

    // Se cae el transporte; mientras tanto cambia algo: socket.io lo recupera al volver (sin recargar el libro).
    c.raw!.io.engine.close()
    await until(() => c.status === "sin-conexion")
    notify({ t: "goals", op: "UPDATE", id: "g-2", b: B_GRATIS })
    await until(() => c.status === "en-vivo", 3_000)
    expect(c.raw!.recovered).toBe(true)
    await until(() => changes.length === 2)
    expect(resyncs).toEqual([])

    // La escucha de la base se reconectó en el servidor: pide recargar.
    t.app.get(RealtimeGateway).server.emit("resync", { reason: "escucha-reconectada" })
    await until(() => resyncs.length === 1)
    expect(resyncs[0]).toEqual({ bookId: B_GRATIS, reason: "escucha-reconectada" })
    expect(statuses).toEqual(["en-vivo", "sin-conexion", "en-vivo"])
  })

  it("si el servidor corta (token vencido) vuelve a conectar solo con el token nuevo y recarga el libro", async () => {
    let tok = await userToken(USERS.editor)
    const c = track(new LiveGatewayClient({ io, url: t.url, getToken: async () => tok, retryMs: 30, socketOptions: { forceNew: true } }))
    const resyncs: unknown[] = []
    c.on("resync", (r) => resyncs.push(r))
    await c.join(B_GRATIS)
    tok = await userToken(USERS.editor, {}, { expSec: 7200 })
    await t.app.get(RealtimeGateway).sweep(Date.now() + 2 * 3600_000)
    await until(() => c.status === "sin-conexion")
    await until(() => c.status === "en-vivo", 3_000)
    await until(() => resyncs.length === 1)
    expect(resyncs[0]).toEqual({ bookId: B_GRATIS, reason: "reconexion" })
  })

  it("presencia con latido", async () => {
    const tok = await userToken(USERS.admin)
    const c = track(new LiveGatewayClient({ io, url: t.url, getToken: async () => tok, heartbeatMs: 40, socketOptions: { forceNew: true } }))
    const seen: { users: { path: string }[] }[] = []
    c.on("presence", (p) => seen.push(p))
    await c.join(B_GRATIS)
    c.presence({ bookId: B_GRATIS, path: "/balance", nombre: "Admin", avatar: null })
    await until(() => seen.filter((p) => p.users.some((u) => u.path === "/balance")).length >= 3, 2_000)
  })
})
