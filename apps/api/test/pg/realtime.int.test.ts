// V7-I · Tiempo real sobre Postgres estándar: triggers pg_notify('mirai_live') de 0002_cloud_overrides.sql → gateway
// socket.io (MODE=realtime, REALTIME_PG_LISTEN=1) → Redis → dos clientes. Contra Postgres 17 + Redis en Docker.
// Mide la demora (criterio de §3.5: < 1 s), la presencia entre dos conexiones y la reconexión de la escucha.
import { randomUUID } from "node:crypto"
import type pg from "pg"
import { afterAll, afterEach, beforeAll, expect, it } from "vitest"
import { LIVE_NOTIFY_CHANNEL, NOTIFY_TABLES } from "@mirai/contracts/modules/realtime"
import { PgLiveListener } from "../../src/modules/realtime/pg-live.listener"
import { RealtimeGateway } from "../../src/modules/realtime/realtime.gateway"
import { B_AJENO, B_GRATIS, H_GRATIS, USERS } from "../setup/fixtures"
import { userToken } from "../setup/tokens"
import { connect as connectSocket, connected, createRealtimeApp, next, type RtTestApp, type TestSocket, until, wait } from "../realtime/helpers"
import { connect, PG_URL, pgDescribe } from "./harness"

const REDIS_URL = process.env.MIRAI_REDIS_TEST_URL
let admin: pg.Client
let t: RtTestApp
const open: TestSocket[] = []

async function member(role: keyof typeof USERS): Promise<TestSocket> {
  const s = connectSocket(t.url, await userToken(USERS[role]))
  open.push(s)
  expect(await connected(s)).toEqual({ ok: true })
  expect((await s.emitWithAck("join:book", { bookId: B_GRATIS })).ok).toBe(true)
  return s
}

pgDescribe("Tiempo real: pg_notify → gateway → clientes (Postgres 17 + Redis en Docker)", () => {
  beforeAll(async () => {
    admin = await connect()
    // El hogar y los libros de los datos semilla de las pruebas (test/setup/fixtures.ts), para que la membresía del
    // contexto en memoria coincida con lo que manda el trigger.
    await admin.query("insert into auth.users (id, email, name, email_verified) values ($1, 'rt@mirai.test', 'rt', true) on conflict do nothing", [USERS.owner])
    await admin.query("insert into public.households (id, nombre, created_by) values ($1, 'Tiempo real', $2) on conflict do nothing", [H_GRATIS, USERS.owner])
    await admin.query("insert into public.books (id, household_id, nombre, created_by) values ($1, $2, 'Casa', $3), ($4, $2, 'Ajeno', $3) on conflict do nothing", [B_GRATIS, H_GRATIS, USERS.owner, B_AJENO])
    t = await createRealtimeApp({ rt: { pgListen: true, pgUrl: PG_URL, ...(REDIS_URL ? { redisUrl: REDIS_URL } : {}) } })
    await until(() => t.app.get(PgLiveListener).state.leader, 10_000)
  })

  afterEach(async () => {
    for (const s of open.splice(0)) s.close()
    // Que el servidor termine de cerrar (y de limpiar la presencia en Redis) antes de seguir o de apagar la app.
    await until(() => t.app.get(RealtimeGateway).server.sockets.sockets.size === 0, 5_000)
    await wait(200)
  })

  afterAll(async () => {
    await t?.close()
    await admin?.query("delete from public.households where id = $1", [H_GRATIS]).catch(() => {})
    await admin?.query("delete from auth.users where id = $1", [USERS.owner]).catch(() => {})
    await admin?.end()
  })

  it("los triggers mirai_live_notify están en todas las tablas de NOTIFY_TABLES (y no queda publicación de Supabase)", async () => {
    const { rows } = await admin.query("select c.relname from pg_trigger g join pg_class c on c.oid = g.tgrelid where g.tgname = 'mirai_live_notify'")
    expect(rows.map((r) => r.relname).sort()).toEqual([...NOTIFY_TABLES].sort())
    expect((await admin.query("select count(*)::int as n from pg_publication where pubname = 'supabase_realtime'")).rows[0].n).toBe(0)
  })

  it("la carga del aviso es mínima (tabla, operación, id, libro; sin montos ni textos)", async () => {
    const l = await connect()
    try {
      await l.query(`listen ${LIVE_NOTIFY_CHANNEL}`)
      const got = new Promise<string>((res) => l.on("notification", (m) => res(m.payload ?? "")))
      const id = randomUUID()
      await admin.query("insert into public.categories (id, book_id, nombre, grupo) values ($1, $2, 'Secreta', 'g')", [id, B_GRATIS])
      expect(JSON.parse(await got)).toEqual({ t: "categories", op: "INSERT", id, b: B_GRATIS })
    } finally {
      await l.end()
    }
  })

  it("un cambio en la base llega a dos personas del libro en menos de 1 s; el de otro libro no", async () => {
    const [a, b] = [await member("owner"), await member("viewer")]
    const ajeno: unknown[] = []
    a.on("change", (c) => c.bookId === B_AJENO && ajeno.push(c))
    const start = Date.now()
    const pa = next(a, "change", 3_000)
    const pb = next(b, "change", 3_000)
    const id = randomUUID()
    await admin.query("insert into public.categories (id, book_id, nombre, grupo) values ($1, $2, 'En vivo', 'n')", [id, B_GRATIS])
    const [ca, cb] = await Promise.all([pa, pb])
    const ms = Date.now() - start
    expect(ca).toMatchObject({ table: "categories", bookId: B_GRATIS, id, op: "INSERT" })
    expect(cb).toMatchObject({ table: "categories", id })
    expect(ms).toBeLessThan(1_000)
    await admin.query("insert into public.categories (book_id, nombre, grupo) values ($1, 'Otro libro', 'n')", [B_AJENO])
    await wait(300)
    expect(ajeno).toEqual([])
  })

  it("presencia: cada uno ve al otro en el libro", async () => {
    const a = await member("owner")
    const b = await member("editor")
    const seen = next(a, "presence", 3_000)
    await b.emitWithAck("presence:update", { bookId: B_GRATIS, path: "/gastos", nombre: "Colabora", avatar: null })
    const p = await seen
    expect(p.users.map((u) => u.id)).toContain(USERS.editor)
  })

  it("si la escucha de la base se cae, se reconecta sola, avisa resync y los cambios siguen llegando", async () => {
    const a = await member("admin")
    const resync = next(a, "resync", 15_000)
    await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'mirai-realtime'")
    expect(await resync).toMatchObject({ reason: expect.any(String) })
    await until(() => t.app.get(PgLiveListener).state.leader, 15_000)
    const got = next(a, "change", 3_000)
    await admin.query("update public.categories set nombre = nombre || ' (otra vez)' where book_id = $1 and nombre = 'En vivo'", [B_GRATIS])
    expect(await got).toMatchObject({ table: "categories", op: "UPDATE" })
    expect(t.app.get(PgLiveListener).state.sessions).toBeGreaterThanOrEqual(2)
  }, 40_000)
})
