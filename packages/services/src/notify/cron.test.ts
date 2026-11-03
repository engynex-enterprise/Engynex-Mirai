// Latido y pasada de resúmenes del cron (web y API) con un doble de Supabase: sin base ni envíos.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { configureServices } from "../runtime"

type Op = [string, unknown[]]
const st = vi.hoisted(() => ({ updates: [] as { table: string; v: unknown }[], queries: [] as { table: string; ops: Op[] }[], ps: { cron_horario: true, cron_horario_visto: null as string | null } }))
const H1 = "11111111-0000-4000-8000-000000000000", H2 = "22222222-0000-4000-8000-000000000000"
const data: Record<string, Record<string, unknown>[]> = {
  books: [{ id: "b1aaaaaa-x", household_id: H1 }, { id: "b2bbbbbb-x", household_id: H2 }],
  household_members: [{ household_id: H1, user_id: "u1aaaaaa-x" }, { household_id: H2, user_id: "u2bbbbbb-x" }],
  notification_rules: [],
  profiles: [{ id: "u1aaaaaa-x", email: "ana@correo.co", nombre: "Ana" }],
}
const admin = {
  from: (table: string) => {
    const ops: Op[] = []
    st.queries.push({ table, ops })
    const match = (r: Record<string, unknown>, [k, a]: Op) => {
      const col = String(a[0])
      if (!(col in r)) return true
      if (k === "eq") return r[col] === a[1]
      if (k === "in") return (a[1] as unknown[]).includes(r[col])
      return true
    }
    const filtered = () => (data[table] ?? []).filter((r) => ops.every((o) => match(r, o)))
    const p: Record<string, unknown> = new Proxy({}, {
      get(_t, k: string) {
        if (k === "then") return (res: (v: unknown) => unknown) => Promise.resolve({ data: filtered(), error: null }).then(res)
        if (k === "maybeSingle") return () => Promise.resolve({ data: table === "platform_settings" ? st.ps : null, error: null })
        if (k === "update") return (v: unknown) => { st.updates.push({ table, v }); return p }
        return (...a: unknown[]) => { ops.push([k, a]); return p }
      },
    })
    return p
  },
}
vi.mock("./digest", () => ({
  defaultRule: (u: string, b: string) => ({ user_id: u, book_id: b }),
  channelStatus: async () => ({ email: true, telegram: false, whatsapp: false, push: false }),
  runRule: async (o: { householdId: string; dry?: boolean; email: string }) => [`email: ${o.dry ? "simulado" : "ok"} (${o.email ? "con correo" : "sin correo"})`],
}))
configureServices({ admin: () => admin as never, loadBook: async () => { throw new Error("sin libro") }, encrypt: (x) => x, decrypt: (x) => x, env: () => undefined, siteUrl: () => "https://mirai.test", publicSiteUrl: () => "https://mirai.test" })
const { cronHeartbeat, householdsWithBooks, runDigests } = await import("./cron")

const now = new Date(Date.UTC(2026, 10, 2, 15, 5))
beforeEach(() => {
  st.updates.length = 0
  st.queries.length = 0
})

describe("latido del cron horario", () => {
  it("la pasada horaria deja el latido y queda en modo horario", async () => {
    expect(await cronHeartbeat({ now, daily: false })).toMatchObject({ horario: true })
    expect(st.updates).toEqual([{ table: "platform_settings", v: { cron_horario_visto: now.toISOString() } }])
  })
  it("la diaria solo lee el latido (sin latido reciente: modo diario); la simulación nunca escribe", async () => {
    expect(await cronHeartbeat({ now, daily: true })).toMatchObject({ horario: false })
    expect(await cronHeartbeat({ now, daily: false, dry: true })).toMatchObject({ horario: true })
    expect(st.updates).toEqual([])
  })
})

describe("pasada de resúmenes", () => {
  it("todos los hogares (web): mismas claves <persona>:<libro> del cron de siempre", async () => {
    expect(await runDigests({ now, daily: false, horario: true })).toEqual({ "u1aaaaaa:b1aaaaaa": ["email: ok (con correo)"], "u2bbbbbb:b2bbbbbb": ["email: ok (sin correo)"] })
  })
  it("un hogar (tarea de la API): solo sus libros y personas, y en simulación", async () => {
    expect(await runDigests({ now, daily: false, horario: true, householdId: H2, dry: true })).toEqual({ "u2bbbbbb:b2bbbbbb": ["email: simulado (sin correo)"] })
    expect(st.queries.find((q) => q.table === "books")?.ops).toContainEqual(["eq", ["household_id", H2]])
  })
  it("hogares con libros, sin repetir", async () => {
    expect(await householdsWithBooks()).toEqual([H1, H2])
  })
})
