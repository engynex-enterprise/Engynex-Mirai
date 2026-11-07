// V7-H1: lo que Balance, Metas y Préstamos escribían directo a la base. Apagado = el update/upsert/insert de siempre
// con los mismos datos; encendido = el endpoint de la API y `{ error: { message } }` en español.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const calls: { table: string; op: string; values?: unknown; eq?: [string, unknown]; opts?: unknown }[] = []
const builder = (table: string) => ({
  update: (values: unknown) => ({ eq: async (c: string, v: unknown) => (calls.push({ table, op: "update", values, eq: [c, v] }), { data: null, error: null }) }),
  upsert: async (values: unknown, opts: unknown) => (calls.push({ table, op: "upsert", values, opts }), { data: null, error: null }),
})
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({ from: builder }) }))

const unreconcile = vi.fn()
const nwSnapshot = vi.fn()
const fund = vi.fn()
const loanPay = vi.fn()
const profile = vi.fn()
vi.mock("@/lib/api/client", async () => {
  const u = await import("@/lib/api/unwrap")
  return { ...u, browserApi: () => ({ assets: { unreconcile, snapshot: nwSnapshot }, savings: { fund }, loans: { pay: loanPay }, me: { profile } }) }
})

const BOOK = "11111111-1111-4111-8111-111111111111"
const ID = "22222222-2222-4222-8222-222222222222"
const ok = (data: unknown) => ({ status: 200, body: { ok: true, data }, headers: new Headers() })

async function session(flags: Record<string, boolean>) {
  const { setApiSession } = await import("@/lib/api/session")
  setApiSession({ cfg: { url: "https://api.test", flags }, userId: "u", householdId: "h", bookId: BOOK })
}

beforeEach(() => {
  vi.stubGlobal("window", {})
  vi.stubGlobal("document", { cookie: "" })
  calls.length = 0
  for (const f of [unreconcile, nwSnapshot, fund, loanPay, profile]) f.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe("cuentas y patrimonio (interruptor assets)", () => {
  it("apagado: descuadrar y la foto del mes como siempre", async () => {
    await session({})
    const { assetDescuadrar, guardarPatrimonio } = await import("./commands")
    await assetDescuadrar(ID)
    await guardarPatrimonio(BOOK, "2026-11", 900, 300)
    expect(calls).toEqual([
      { table: "assets", op: "update", values: { saldo_base: null, saldo_fecha: null, saldo_at: null }, eq: ["id", ID] },
      { table: "net_worth_snapshots", op: "upsert", values: { book_id: BOOK, mes: "2026-11", activos: 900, deudas: 300, patrimonio: 600 }, opts: { onConflict: "book_id,mes" } },
    ])
  })

  it("encendido: DELETE /assets/:id/reconcile y PUT /net-worth/:mes", async () => {
    await session({ assets: true })
    unreconcile.mockResolvedValue(ok({ id: ID }))
    nwSnapshot.mockResolvedValue({ status: 400, body: { ok: false, code: "VALIDATION", msg: "Solo se guarda la foto de este mes o de meses pasados." }, headers: new Headers() })
    const { assetDescuadrar, guardarPatrimonio } = await import("./commands")
    expect(await assetDescuadrar(ID)).toEqual({ data: { id: ID }, error: null })
    expect(unreconcile).toHaveBeenCalledWith({ params: { bookId: BOOK, id: ID } })
    expect(await guardarPatrimonio(BOOK, "2026-11", 900, 300)).toEqual({ data: null, error: { message: "Solo se guarda la foto de este mes o de meses pasados." } })
    expect(nwSnapshot).toHaveBeenCalledWith({ params: { bookId: BOOK, mes: "2026-11" }, body: { activos: 900, deudas: 300 } })
    expect(calls).toEqual([])
  })
})

describe("fondo de emergencia (interruptor savings)", () => {
  it("apagado: update del fondo del libro; encendido: PUT /fund", async () => {
    const { updateFund } = await import("@/features/goals/commands")
    await session({})
    await updateFund(BOOK, { asset_id: null })
    expect(calls).toEqual([{ table: "emergency_funds", op: "update", values: { asset_id: null }, eq: ["book_id", BOOK] }])
    await session({ savings: true })
    fund.mockResolvedValue(ok({ book_id: BOOK, activo: true }))
    expect(await updateFund(BOOK, { activo: true })).toEqual({ error: null })
    expect(fund).toHaveBeenCalledWith({ params: { bookId: BOOK }, body: { activo: true } })
  })
})

describe("préstamos (interruptores loans y me)", () => {
  it("pagar cuotas o abonar por POST /loans/:id/payments", async () => {
    const { loansViaApi, payLoanApi } = await import("@/features/loans/commands")
    await session({})
    expect(loansViaApi()).toBe(false)
    await session({ loans: true })
    expect(loansViaApi()).toBe(true)
    loanPay.mockResolvedValue(ok({ pagos: [], saldo: 0, saldado: true }))
    expect((await payLoanApi(ID, { cuotas: 2, fecha: "2026-11-03", payment_method_id: null })).error).toBeNull()
    await payLoanApi(ID, { abono: 50000, modo: "plazo", fecha: "2026-11-03", payment_method_id: ID })
    expect(loanPay.mock.calls).toEqual([
      [{ params: { bookId: BOOK, id: ID }, body: { cuotas: 2, fecha: "2026-11-03", payment_method_id: null } }],
      [{ params: { bookId: BOOK, id: ID }, body: { abono: 50000, modo: "plazo", fecha: "2026-11-03", payment_method_id: ID } }],
    ])
  })

  it("perfil propio por GET /v1/me/profile", async () => {
    const { apiMyProfile, profileViaApi } = await import("@/features/loans/commands")
    await session({ me: true })
    expect(profileViaApi()).toBe(true)
    profile.mockResolvedValue({ status: 200, body: { nombre: "Ana", cobro: [{ tipo: "nequi" }] }, headers: new Headers() })
    expect(await apiMyProfile()).toMatchObject({ nombre: "Ana", cobro: [{ tipo: "nequi" }] })
  })
})
