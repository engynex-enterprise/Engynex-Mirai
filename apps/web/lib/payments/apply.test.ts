// Pagos del plan: reglas puras (siempre) y la transacción real de la base (apply_plan_payment) con dos conexiones a
// la vez. La parte de base es opcional porque escribe en la base compartida (crea un hogar de prueba y lo borra):
//   MIRAI_DB_TESTS=1 npx vitest run lib/payments
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { couponCounts, nextPayState, payEffect, revokeVence, type PayState } from "./state"

describe("nextPayState: un aviso viejo no retrocede el pago", () => {
  it("primer aviso y repetidos", () => {
    expect(nextPayState(null, "pendiente")).toBe("pendiente")
    expect(nextPayState(null, "aprobado")).toBe("aprobado")
    expect(nextPayState("aprobado", "aprobado")).toBe("aprobado")
  })
  it("pendiente o rechazado que llegan tarde no pisan una aprobación", () => {
    expect(nextPayState("aprobado", "pendiente")).toBe("aprobado")
    expect(nextPayState("aprobado", "rechazado")).toBe("aprobado")
    expect(nextPayState("rechazado", "pendiente")).toBe("rechazado")
  })
  it("reembolso y anulación son finales", () => {
    expect(nextPayState("aprobado", "reembolsado")).toBe("reembolsado")
    expect(nextPayState("reembolsado", "aprobado")).toBe("reembolsado")
    expect(nextPayState("anulado", "aprobado")).toBe("anulado")
  })
  it("un rechazo puede aprobarse después (reintento en la pasarela)", () => {
    expect(nextPayState("rechazado", "aprobado")).toBe("aprobado")
    expect(nextPayState("pendiente", "aprobado")).toBe("aprobado")
  })
})

describe("payEffect: dos aprobaciones = una extensión; el reembolso revoca", () => {
  const run = (avisos: PayState[]) => {
    let prev: PayState | null = null
    let ext = 0, rev = 0
    for (const a of avisos) {
      const next = nextPayState(prev, a)
      const fx = payEffect(prev, next)
      ext += fx.extend ? 1 : 0
      rev += fx.revoke ? 1 : 0
      prev = next
    }
    return { ext, rev, final: prev }
  }
  it("la pasarela reenvía la aprobación", () => {
    expect(run(["pendiente", "aprobado", "aprobado", "pendiente", "aprobado"])).toEqual({ ext: 1, rev: 0, final: "aprobado" })
  })
  it("aprobado y luego reembolsado: se extiende una vez y se revoca una vez", () => {
    expect(run(["aprobado", "reembolsado", "reembolsado", "aprobado"])).toEqual({ ext: 1, rev: 1, final: "reembolsado" })
  })
  it("rechazos repetidos avisan una sola vez", () => {
    expect(payEffect(null, "rechazado").rejected).toBe(true)
    expect(payEffect("rechazado", "rechazado").rejected).toBe(false)
  })
})

describe("cupones y reembolsos", () => {
  it("Mercado Pago: el cupón cuenta solo en el primer pago de la suscripción", () => {
    expect(couponCounts("mercadopago", 0)).toBe(true)
    expect(couponCounts("mercadopago", 2)).toBe(false)
    expect(couponCounts("wompi", 3)).toBe(true)
  })
  it("quitar un periodo (mes con fin de mes y año)", () => {
    const now = new Date("2026-11-02T12:00:00Z")
    expect(revokeVence("2026-12-02T12:00:00Z", "mes", now)).toEqual({ vence: new Date("2026-11-02T12:00:00Z"), vencida: true })
    expect(revokeVence("2027-03-31T12:00:00Z", "mes", now).vence.toISOString().slice(0, 10)).toBe("2027-02-28")
    expect(revokeVence("2027-12-20T12:00:00Z", "anio", now)).toEqual({ vence: new Date("2026-12-20T12:00:00Z"), vencida: false })
  })
})

// ── La transacción real (opcional) ──────────────────────────────────────────────────────────────────────────
type Client = { connect(): Promise<void>; end(): Promise<void>; query(q: string, v?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }
const dbUrl = (() => {
  if (!process.env.MIRAI_DB_TESTS) return null
  try { process.loadEnvFile?.(".env.local") } catch { /* sin archivo: se usa la variable del entorno */ }
  return process.env.SUPABASE_DB_URL ?? null
})()

describe.skipIf(!dbUrl)("apply_plan_payment en la base (MIRAI_DB_TESTS=1)", () => {
  const ref = `vitest-${Date.now()}`
  let a: Client, b: Client, household = ""
  const connect = async () => {
    const pg = (await import("pg")).default
    const c = new pg.Client({ connectionString: dbUrl!, ssl: { rejectUnauthorized: false } }) as unknown as Client
    await c.connect()
    return c
  }
  const apply = (c: Client, estado: PayState) =>
    c.query("select public.apply_plan_payment($1, 'wompi', $2, 'mes', 14900, $3) as r", [household, ref, estado]).then((x) => x.rows[0].r as { first_approval: boolean; revoked: boolean; vence_at: string | null })

  beforeAll(async () => {
    // La función tiene que existir (migración aplicada).
    expect(readFileSync(path.join(__dirname, "../../../../supabase/migrations/20261103003400_planes_automat.sql"), "utf8")).toContain("apply_plan_payment")
    a = await connect()
    b = await connect()
    household = String((await a.query("insert into public.households(nombre) values ('QA vitest pagos') returning id")).rows[0].id)
  })
  afterAll(async () => {
    if (a) {
      await a.query("delete from public.plan_payments where proveedor = 'wompi' and referencia = $1", [ref])
      if (household) await a.query("delete from public.households where id = $1", [household])
      await a.end()
    }
    if (b) await b.end()
  })

  it("dos aprobaciones simultáneas extienden una sola vez", async () => {
    const [r1, r2] = await Promise.all([apply(a, "aprobado"), apply(b, "aprobado")])
    expect([r1.first_approval, r2.first_approval].filter(Boolean)).toHaveLength(1)
    const subs = (await a.query("select vence_at, estado from public.plan_subscriptions where household_id = $1", [household])).rows
    expect(subs).toHaveLength(1)
    const dias = (new Date(String(subs[0].vence_at)).getTime() - Date.now()) / 86_400_000
    expect(dias).toBeGreaterThan(27)
    expect(dias).toBeLessThan(32)
    expect((await a.query("select public.household_plan($1) as p", [household])).rows[0].p).toBe("premium")
    // Un "pendiente" atrasado no deshace la aprobación.
    await apply(a, "pendiente")
    expect((await a.query("select estado from public.plan_payments where referencia = $1", [ref])).rows[0].estado).toBe("aprobado")
  })

  it("un reembolso quita el periodo y el hogar vuelve a Gratis", async () => {
    const r = await apply(a, "reembolsado")
    expect(r.revoked).toBe(true)
    const sub = (await a.query("select estado from public.plan_subscriptions where household_id = $1", [household])).rows[0]
    expect(sub.estado).toBe("vencida")
    expect((await a.query("select public.household_plan($1) as p", [household])).rows[0].p).toBe("gratis")
    // El reembolso repetido no resta otra vez.
    expect((await apply(b, "reembolsado")).revoked).toBe(false)
  })
})
