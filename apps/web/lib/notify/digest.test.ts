// Motor de resúmenes (runRule) con dobles: sin base real ni envíos reales.
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { BookData } from "@/lib/domain"
import type { Rule } from "./digest"

vi.mock("server-only", () => ({}))

// ── Doble de Supabase: registra lo que se pide y simula la clave única de notify_claim ──
const st = vi.hoisted(() => ({
  claims: new Set<string>(),
  fails: new Map<string, number>(),
  upserts: [] as { table: string; rows: unknown }[],
  updates: [] as { table: string; v: unknown }[],
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
}))
vi.mock("@/lib/supabase/admin", () => {
  const result = (table: string, ops: [string, unknown[]][]) => {
    const op = (k: string) => ops.find((o) => o[0] === k)
    if (op("upsert")) { st.upserts.push({ table, rows: op("upsert")![1][0] }); return { data: null, error: null } }
    if (op("update")) {
      st.updates.push({ table, v: op("update")![1][0] })
      const v = op("update")![1][0] as { status?: string }
      if (table === "notification_log" && v.status === "fallido") { /* la clave queda libre */ for (const k of [...st.claims]) if (k.startsWith("#")) st.claims.delete(k) }
      return { data: null, error: null }
    }
    if (table === "profiles") return { data: { nombre: "Ana Pérez", digitos: "", ciudad: "" }, error: null }
    if (table === "notification_log") {
      const ded = ops.find((o) => o[0] === "eq" && o[1][0] === "dedupe")?.[1][1] as string
      return { data: null, count: st.fails.get(ded) ?? 0, error: null }
    }
    return { data: [], count: 0, error: null }
  }
  const q = (table: string) => {
    const ops: [string, unknown[]][] = []
    const p: Record<string, unknown> = new Proxy({}, {
      get(_t, k: string) {
        if (k === "then") return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result(table, ops)).then(res, rej)
        if (k === "maybeSingle" || k === "single") return () => Promise.resolve(result(table, ops))
        return (...a: unknown[]) => { ops.push([k, a]); return p }
      },
    })
    return p
  }
  return {
    supabaseAdmin: () => ({
      from: (t: string) => q(t),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        st.rpcs.push({ fn, args })
        const k = String(args.p_dedupe)
        if (st.claims.has(k)) return { data: null, error: null }
        st.claims.add(k)
        return { data: st.claims.size, error: null }
      },
    }),
  }
})

// Libro con un arriendo que vence en 2 días (sale un aviso de pagos).
const book: BookData = {
  settings: { umbral: 25000, limite: 200000, trm: {}, emerg_meta: 6, anticipo: 5, corte_q: 15, alerta_pres: 80 },
  categories: [], incomes: [], extraIncomes: [], expenses: [], subscriptions: [], loans: [], creditCards: [], assets: [], liabilities: [], investments: [], goals: [], calendarEvents: [], contacts: [], entities: [],
  fixedExpenses: [{ id: "f1", nombre: "Arriendo", valor: 1500000, frec: "mensual", dia: 4, category_id: null, payments: [] } as never],
}
vi.mock("@/lib/book-data", () => ({ loadBookData: async () => ({ ...book, raw: { settings: {} } }) }))
vi.mock("@/features/integrations/store", () => ({ getIntegration: async (_h: string, k: string) => (k === "email_resend" ? { kind: k, enabled: true, config: {}, secrets: {}, source: "plataforma" } : null) }))
const sendEmail = vi.hoisted(() => vi.fn(async () => "msg-1"))
vi.mock("@/lib/notify/email", () => ({ EMAIL_KINDS: ["email_resend"], brandEmail: (t: string, b: string) => `${t}${b}`, sendEmail }))
vi.mock("@/lib/notify/channels", () => ({ fallbackNote: () => null, pushReady: () => false, sendPush: vi.fn(), sendTelegram: vi.fn(), sendWhatsApp: vi.fn() }))

const { defaultRule, runRule } = await import("./digest")

const READY = { email: true, telegram: false, whatsapp: false, push: false }
const rule = (): Rule => ({ ...defaultRule("u1", "b1"), canales: { app: true, email: true }, hora: 9 })
/** 2026-11-02 a la hora `h` de Colombia (UTC−5). */
const at = (h: number) => new Date(Date.UTC(2026, 10, 2, h + 5, 5))
const run = (h: number, o: { daily?: boolean; horario?: boolean } = {}, r = rule()) => runRule({ householdId: "h1", rule: r, email: "ana@correo.co", nombre: "Ana Pérez", now: at(h), ready: READY, horario: true, ...o })

beforeEach(() => {
  st.claims.clear(); st.fails.clear(); st.upserts.length = 0; st.updates.length = 0; st.rpcs.length = 0
  sendEmail.mockClear()
})

describe("runRule: hora elegida y sin duplicados", () => {
  it("con cron horario no envía antes de la hora elegida (pero sí llena la campana)", async () => {
    expect(await run(8)).toEqual([])
    expect(sendEmail).not.toHaveBeenCalled()
    expect(st.upserts.some((u) => u.table === "notifications")).toBe(true)
  })
  it("a la hora elegida envía una vez y marca el día", async () => {
    expect(await run(9)).toEqual(["email: ok"])
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(st.rpcs[0].args.p_dedupe).toBe("resumen:u1:b1:email:2026-11-02")
    expect(st.updates.find((u) => u.table === "notification_rules")?.v).toEqual({ last_sent: { email: "2026-11-02" } })
  })
  it("otra pasada el mismo día (aunque last_sent no se haya guardado) no vuelve a enviar", async () => {
    await run(9)
    expect(await run(10)).toEqual(["email: ya enviado"])
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })
  it("la pasada diaria de Vercel (6 a. m.) con cron horario vivo espera la hora de la persona", async () => {
    expect(await run(6, { daily: true })).toEqual([])
    expect(sendEmail).not.toHaveBeenCalled()
  })
  it("sin cron horario la pasada diaria envía aunque la hora elegida sea más tarde", async () => {
    expect(await run(6, { daily: true, horario: false })).toEqual(["email: ok"])
  })
  it("un canal que Mirai no ofrece o sin destino no se intenta ni deja fallos en el registro", async () => {
    const r = { ...rule(), canales: { app: true, whatsapp: true, telegram: true } }
    expect(await run(9, {}, r)).toEqual([])
    expect(st.rpcs).toHaveLength(0)
  })
  it("con el aviso apagado por la persona no hay nada que enviar", async () => {
    const r = { ...rule(), notif: { pagos: false } }
    expect(await run(9, {}, r)).toEqual([])
    expect(sendEmail).not.toHaveBeenCalled()
  })
  it("tras 3 fallos con la misma clave deja de reintentar ese día", async () => {
    st.fails.set("resumen:u1:b1:email:2026-11-02", 3)
    expect(await run(9)).toEqual(["email: ya enviado"])
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
