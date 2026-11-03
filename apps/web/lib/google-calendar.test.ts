// Sincronización con Google Calendar (crear, actualizar y borrar) con dobles: sin Google ni base reales.
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { BookData } from "@/lib/domain"

vi.mock("server-only", () => ({}))

const db = vi.hoisted(() => ({ map: [] as { key: string; event_id: string; hash: string; fecha: string; calendar_id: string }[], deleted: [] as string[] }))
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      const self = new Proxy(chain, {
        get(_t, k: string) {
          if (k === "then") return (res: (v: unknown) => unknown) => Promise.resolve({ data: db.map, error: null }).then(res)
          if (k === "upsert") return (row: (typeof db.map)[number]) => { db.map = [...db.map.filter((m) => m.key !== row.key), row]; return Promise.resolve({ error: null }) }
          if (k === "delete") return () => ({ eq: () => ({ eq: () => ({ in: (_c: string, keys: string[]) => { db.deleted.push(...keys); db.map = db.map.filter((m) => !keys.includes(m.key)); return Promise.resolve({ error: null }) } }) }) })
          return () => self
        },
      })
      return self
    },
  }),
}))
vi.mock("@/lib/google", () => ({ G_SCOPES: { calendar: "cal" }, googleToken: async () => "tok" }))
vi.mock("@/features/integrations/store", () => ({ getIntegration: async () => ({ config: { calendarId: "primary" }, secrets: {} }) }))
vi.mock("@/lib/plan-server", () => ({ householdCan: async () => true }))
const libro = vi.hoisted(() => ({ b: null as unknown as BookData }))
vi.mock("@/lib/notify/digest", () => ({ avisoCtx: async () => ({ book: libro.b, extras: {} }) }))

const { calBody, calKey, calPlan, syncCalendarFor } = await import("./google-calendar")

const base: BookData = {
  settings: { umbral: 0, limite: 0, trm: {}, emerg_meta: 6, anticipo: 5, corte_q: 15, alerta_pres: 80 },
  categories: [], incomes: [], extraIncomes: [], expenses: [], fixedExpenses: [], loans: [], creditCards: [], assets: [], liabilities: [], investments: [], goals: [], calendarEvents: [], contacts: [], entities: [],
  subscriptions: [{ id: "s1", nombre: "Netflix", valor: 40000, ciclo: "mensual", proximo: "2026-11-20", currency: "COP" }],
}
const calls: { method: string; url: string }[] = []
beforeEach(() => {
  db.map = []; db.deleted = []; calls.length = 0
  libro.b = base
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { calls.push({ method: String(init.method), url }); return new Response(init.method === "DELETE" ? null : "{}", { status: init.method === "DELETE" ? 204 : 200 }) }))
})

describe("plan de cambios", () => {
  it("crea lo nuevo, actualiza lo que cambió, borra lo futuro que desapareció y olvida lo pasado", () => {
    const p = calPlan(
      [{ key: "a", hash: "1", fecha: "2026-11-10" }, { key: "b", hash: "2", fecha: "2026-11-12" }],
      [{ key: "b", hash: "viejo", fecha: "2026-11-12" }, { key: "c", hash: "3", fecha: "2026-11-15" }, { key: "d", hash: "4", fecha: "2026-10-01" }],
      "2026-11-02",
    )
    expect(p).toEqual({ crear: ["a"], actualizar: ["b"], borrar: ["c"], olvidar: ["d"] })
  })
  it("el evento oculta el monto si la persona oculta montos en sus avisos", () => {
    const x = { k: "sub", id: "s1", titulo: "Netflix", sub: "Suscripción mensual", monto: 40000, fecha: "2026-11-20", dir: "pagar", go: "suscripciones" } as never
    expect(calBody(x).description).toMatch(/Valor: \$40\.000/)
    expect(calBody(x, { ocultarMontos: true }).description).not.toMatch(/Valor/)
    expect(calKey(x)).toBe("sub|s1|2026-11-20")
  })
})

describe("syncCalendarFor", () => {
  const o = { userId: "u1", bookId: "b1", householdId: "h1", today: "2026-11-02" }
  it("la primera vez crea el evento y la segunda no hace nada (idempotente)", async () => {
    expect(await syncCalendarFor(o)).toMatchObject({ creados: 1, actualizados: 0, borrados: 0 })
    expect(calls.map((c) => c.method)).toEqual(["POST"])
    calls.length = 0
    expect(await syncCalendarFor(o)).toMatchObject({ creados: 0, actualizados: 0, borrados: 0 })
    expect(calls).toHaveLength(0)
  })
  it("si cambia el monto, actualiza el mismo evento (PATCH)", async () => {
    await syncCalendarFor(o)
    calls.length = 0
    libro.b = { ...base, subscriptions: [{ ...base.subscriptions[0], valor: 45000 }] }
    expect(await syncCalendarFor(o)).toMatchObject({ actualizados: 1 })
    expect(calls.map((c) => c.method)).toEqual(["PATCH"])
  })
  it("si se pagó o se borró antes de su fecha, lo quita del calendario (DELETE)", async () => {
    await syncCalendarFor(o)
    calls.length = 0
    libro.b = { ...base, subscriptions: [] }
    expect(await syncCalendarFor(o)).toMatchObject({ borrados: 1 })
    expect(calls.map((c) => c.method)).toEqual(["DELETE"])
    expect(db.map).toHaveLength(0)
  })
})
