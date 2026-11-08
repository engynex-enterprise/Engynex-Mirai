// Lo que Balance, Metas y Préstamos escriben por la API: el endpoint y `{ error: { message } }` en español.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

async function session() {
  const { setApiSession } = await import("@/lib/api/session")
  setApiSession({ userId: "u", householdId: "h", bookId: BOOK })
}

beforeEach(() => {
  vi.stubGlobal("window", {})
  for (const f of [unreconcile, nwSnapshot, fund, loanPay, profile]) f.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe("cuentas y patrimonio", () => {
  it("DELETE /assets/:id/reconcile y PUT /net-worth/:mes", async () => {
    await session()
    unreconcile.mockResolvedValue(ok({ id: ID }))
    nwSnapshot.mockResolvedValue({ status: 400, body: { ok: false, code: "VALIDATION", msg: "Solo se guarda la foto de este mes o de meses pasados." }, headers: new Headers() })
    const { assetDescuadrar, guardarPatrimonio } = await import("./commands")
    expect(await assetDescuadrar(ID)).toEqual({ data: { id: ID }, error: null })
    expect(unreconcile).toHaveBeenCalledWith({ params: { bookId: BOOK, id: ID } })
    expect(await guardarPatrimonio(BOOK, "2026-11", 900, 300)).toEqual({ data: null, error: { message: "Solo se guarda la foto de este mes o de meses pasados." } })
    expect(nwSnapshot).toHaveBeenCalledWith({ params: { bookId: BOOK, mes: "2026-11" }, body: { activos: 900, deudas: 300 } })
  })
})

describe("fondo de emergencia", () => {
  it("prender el fondo o cambiar su cuenta por PUT /fund", async () => {
    const { updateFund } = await import("@/features/goals/commands")
    await session()
    fund.mockResolvedValue(ok({ book_id: BOOK, activo: true }))
    expect(await updateFund(BOOK, { activo: true })).toEqual({ error: null })
    expect(fund).toHaveBeenCalledWith({ params: { bookId: BOOK }, body: { activo: true } })
  })
})

describe("préstamos", () => {
  it("pagar cuotas o abonar por POST /loans/:id/payments", async () => {
    const { payLoanApi } = await import("@/features/loans/commands")
    await session()
    loanPay.mockResolvedValue(ok({ pagos: [], saldo: 0, saldado: true }))
    expect((await payLoanApi(ID, { cuotas: 2, fecha: "2026-11-03", payment_method_id: null })).error).toBeNull()
    await payLoanApi(ID, { abono: 50000, modo: "plazo", fecha: "2026-11-03", payment_method_id: ID })
    expect(loanPay.mock.calls).toEqual([
      [{ params: { bookId: BOOK, id: ID }, body: { cuotas: 2, fecha: "2026-11-03", payment_method_id: null } }],
      [{ params: { bookId: BOOK, id: ID }, body: { abono: 50000, modo: "plazo", fecha: "2026-11-03", payment_method_id: ID } }],
    ])
  })

  it("perfil propio por GET /v1/me/profile", async () => {
    const { apiMyProfile } = await import("@/features/loans/commands")
    await session()
    profile.mockResolvedValue({ status: 200, body: { nombre: "Ana", cobro: [{ tipo: "nequi" }] }, headers: new Headers() })
    expect(await apiMyProfile()).toMatchObject({ nombre: "Ana", cobro: [{ tipo: "nequi" }] })
  })
})
