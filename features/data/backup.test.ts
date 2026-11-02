import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({}) }))

const { sanitizeDump } = await import("./backup")
type Dump = Parameters<typeof sanitizeDump>[0]

const CAT = "11111111-1111-4111-8111-111111111111"
const AJENO = "22222222-2222-4222-8222-222222222222"
const FAM = "33333333-3333-4333-8333-333333333333"

describe("restaurar respaldo: limpieza del JSON", () => {
  const dump = {
    app: "mirai", v: 5, book_id: "b", household_id: "h", nombre: "x", fecha: "", settings: {},
    data: {
      categories: [{ id: CAT, nombre: "Mercado" }],
      expenses: [
        { id: "e1", category_id: CAT, member_id: FAM, fixed_expense_id: AJENO, member_ids: [FAM, AJENO], created_by: AJENO },
        "no soy una fila", null,
      ],
      tabla_ajena: [{ id: "z" }],
    },
  } as unknown as Dump
  const out = sanitizeDump(dump, new Set([FAM]))
  it("conserva las referencias del mismo respaldo y a integrantes del hogar", () => {
    expect(out.expenses[0].category_id).toBe(CAT)
    expect(out.expenses[0].member_id).toBe(FAM)
    expect(out.expenses[0].member_ids).toEqual([FAM])
    expect(out.expenses[0].created_by).toBe(AJENO) // quién lo creó no es una referencia a otro libro
  })
  it("anula referencias a registros de otros libros", () => { expect(out.expenses[0].fixed_expense_id).toBeNull() })
  it("descarta filas que no son objetos y tablas que no son del libro", () => {
    expect(out.expenses).toHaveLength(1)
    expect((out as Record<string, unknown>).tabla_ajena).toBeUndefined()
  })
  it("un respaldo sin datos no falla", () => { expect(sanitizeDump({} as Dump, new Set()).expenses).toEqual([]) })
})
