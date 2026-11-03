import { describe, expect, it } from "vitest"
import { assembleBook, BOOK_PART_NAMES, loadBookDataWith, partsForTable, SINGLE_ROW_PARTS, type BookPart, type BookParts } from "./book-data"

const empty = () => Object.fromEntries(BOOK_PART_NAMES.map((p) => [p, []])) as unknown as BookParts

describe("partes del libro", () => {
  it("cada tabla recarga solo su parte y la del padre que la embebe", () => {
    expect(partsForTable("expenses")).toEqual(["expenses"])
    expect(partsForTable("loan_payments")).toEqual(["loans"])
    expect(partsForTable("card_purchases")).toEqual(["credit_cards"])
    expect(partsForTable("fixed_expense_payments")).toEqual(["fixed_expenses"])
    expect(partsForTable("wishlist")).toEqual([])
  })

  it("arma el libro igual que antes (filtros de activos, hijos vivos y números)", () => {
    const p = empty()
    p.book_settings = [{ umbral: "20000", limite: null, trm: {}, pct: {}, uvt: {}, smmlv: {} }]
    p.incomes = [{ id: "a", activo: true }, { id: "b", activo: false }]
    p.subscriptions = [{ id: "s1", activa: true, proximo: "2026-11-10" }, { id: "s2", activa: true, proximo: null }, { id: "s3", activa: false, proximo: "2026-11-10" }]
    p.loans = [{ id: "l", extra: "5", loan_payments: [{ id: "p1", deleted_at: null }, { id: "p2", deleted_at: "2026-01-01" }] }]
    p.credit_cards = [{ id: "c", cupo: "100", card_purchases: null }]
    const b = assembleBook(p)
    expect(b.settings.umbral).toBe(20000)
    expect(b.settings.limite).toBe(0)
    expect(b.incomes.map((i) => i.id)).toEqual(["a"])
    expect(b.subscriptions.map((s) => s.id)).toEqual(["s1"])
    expect(b.loans[0].extra).toBe(5)
    expect(b.loans[0].payments.map((x) => x.id)).toEqual(["p1"])
    expect(b.creditCards[0]).toMatchObject({ cupo: 100, purchases: [] })
  })
})

describe("cargador como parámetro (loadBookDataWith)", () => {
  it("pide cada parte una vez y arma el libro igual que assembleBook", async () => {
    const pedidas: BookPart[] = []
    const b = await loadBookDataWith(async (part) => {
      pedidas.push(part)
      return part === "book_settings" ? [{ umbral: "1", trm: {}, pct: {}, uvt: {}, smmlv: {} }] : part === "incomes" ? [{ id: "a", activo: true }] : []
    })
    expect([...pedidas].sort()).toEqual([...BOOK_PART_NAMES].sort())
    expect(b.settings.umbral).toBe(1)
    expect(b.incomes.map((i) => i.id)).toEqual(["a"])
    expect(SINGLE_ROW_PARTS).toEqual(["book_settings", "emergency_funds"])
  })
  it("propaga el error del cargador", async () => {
    await expect(loadBookDataWith(async () => { throw new Error("No encontramos los ajustes de este libro") })).rejects.toThrow("No encontramos los ajustes")
  })
})
