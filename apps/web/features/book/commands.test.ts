// Comandos del libro: el comando de la API con la misma forma `{ data, error }` y el mensaje en español del ApiError.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const fixedPay = vi.fn()
const fixedCharge = vi.fn()
const cardsPurchase = vi.fn()
const fundSaveApi = vi.fn()
const useFundApi = vi.fn()
vi.mock("@/lib/api/client", () => ({
  browserApi: () => ({
    fixed: { pay: fixedPay, charge: fixedCharge },
    cards: { purchase: cardsPurchase },
    savings: { fundSave: fundSaveApi },
    expenses: { useFund: useFundApi },
  }),
}))

const BOOK = "11111111-1111-4111-8111-111111111111"
const FIXED = "22222222-2222-4222-8222-222222222222"
const CARD = "33333333-3333-4333-8333-333333333333"
const ok = (data: unknown) => ({ status: 200, body: { ok: true, data }, headers: new Headers() })

async function session() {
  const { setApiSession } = await import("@/lib/api/session")
  setApiSession({ userId: "u", householdId: "h", bookId: BOOK })
}

beforeEach(() => {
  vi.stubGlobal("window", {})
  for (const f of [fixedPay, fixedCharge, cardsPurchase, fundSaveApi, useFundApi]) f.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe("comandos del libro", () => {
  it("pay_fixed_expense por POST /fixed/:id/pay y devuelve el data de la RPC", async () => {
    await session()
    fixedPay.mockResolvedValue(ok({ ajuste: "max", aporte: null, valor: 600000, periodo: "2026-11-Q1" }))
    const { payFixedExpense } = await import("@/features/fixed/commands")
    const r = await payFixedExpense({ p_fixed: FIXED, p_periodo: "2026-11-Q1", p_fecha: "2026-11-05", p_valor: 600000, p_desc_suffix: " (1ª quincena)" })
    expect(fixedPay).toHaveBeenCalledWith({ params: { bookId: BOOK, id: FIXED }, body: { periodo: "2026-11-Q1", fecha: "2026-11-05", valor: 600000 } })
    expect(r.error).toBeNull()
    expect((r.data as { ajuste: string }).ajuste).toBe("max")
  })

  it("el pago de antes del alta (prev-AAAA-MM de fixed-form) va por el comando, con el medio de pago", async () => {
    await session()
    fixedPay.mockResolvedValue(ok({ ajuste: null, aporte: null, valor: 1, periodo: "prev-2026-11" }))
    const { payFixedExpense } = await import("@/features/fixed/commands")
    await payFixedExpense({ p_fixed: FIXED, p_periodo: "prev-2026-11", p_fecha: "2026-11-05", p_valor: 1, p_medio: CARD, p_desc_suffix: "" })
    expect(fixedPay).toHaveBeenCalledWith({ params: { bookId: BOOK, id: FIXED }, body: { periodo: "prev-2026-11", fecha: "2026-11-05", valor: 1, payment_method_id: CARD } })
  })

  it("el error de la API llega como error.message en español", async () => {
    await session()
    fixedCharge.mockResolvedValue({ status: 409, body: { ok: false, code: "CONFLICT", msg: "Ese cobro ya está registrado." }, headers: new Headers() })
    const { paySubscription } = await import("@/features/fixed/commands")
    const r = await paySubscription({ p_sub: FIXED, p_fecha: "2026-11-05", p_valor: 26900 })
    expect(r).toEqual({ data: null, error: { message: "Ese cobro ya está registrado." } })
  })

  it("add_card_purchase arma el cuerpo del comando", async () => {
    await session()
    const args = { p_card: CARD, p_fecha: "2026-11-02", p_descripcion: "COMPRA EXITO", p_valor: 245300, p_cuotas: 1, p_category: undefined, p_como_gasto: true, p_external_id: "gmail:18c2ab", p_member: undefined }
    cardsPurchase.mockResolvedValue(ok({ purchase_id: "p1", expense_id: "e1" }))
    const { addCardPurchase } = await import("@/features/cards/commands")
    const r = await addCardPurchase(args)
    expect(cardsPurchase).toHaveBeenCalledWith({ params: { bookId: BOOK, id: CARD }, body: { fecha: "2026-11-02", descripcion: "COMPRA EXITO", valor: 245300, cuotas: 1, comoGasto: true, external_id: "gmail:18c2ab" } })
    expect(r.data).toEqual({ purchase_id: "p1", expense_id: "e1" })
  })

  it("fund_save y use_emergency_fund devuelven el saldo como número (igual que la RPC)", async () => {
    await session()
    fundSaveApi.mockResolvedValue(ok({ saldo: 850000 }))
    useFundApi.mockResolvedValue(ok({ saldo: 500000 }))
    const { fundSave } = await import("@/features/goals/commands")
    const { payWithEmergencyFund } = await import("@/features/expenses/commands")
    expect((await fundSave({ p_book: BOOK, p_valor: 50000, p_fecha: "2026-11-02", p_nota: "Prima" })).data).toBe(850000)
    expect(fundSaveApi).toHaveBeenLastCalledWith({ params: { bookId: BOOK }, body: { valor: 50000, fecha: "2026-11-02", nota: "Prima" } })
    expect((await payWithEmergencyFund({ p_expense: FIXED, p_valor: 50000 })).data).toBe(500000)
    // fund_save apunta al libro que recibe (p_book), aunque no sea el activo.
    await fundSave({ p_book: CARD, p_valor: 50000, p_fecha: "2026-11-02" })
    expect(fundSaveApi).toHaveBeenLastCalledWith({ params: { bookId: CARD }, body: { valor: 50000, fecha: "2026-11-02" } })
  })
})
