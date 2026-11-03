// Esquemas de escritura del CRUD genérico (F2-D-1): obligatorios al crear, subconjunto al editar, nunca columnas del
// sistema ni de enlaces, enumeraciones de los `check` de la base y mensajes en español.
import { beforeAll, describe, expect, it } from "vitest"
import { BOOK_TABLE_POLICY } from "./book-tables"
import { BOOK_TABLE_COLUMNS } from "./book-table-columns"
import { BOOK_TABLE_SCHEMAS, isWritableTable, refTable, SYSTEM_COLUMNS, writeSchema } from "./book-table-schemas"
import { enableZodEs } from "./zod-es"

beforeAll(() => enableZodEs())

describe("BOOK_TABLE_SCHEMAS", () => {
  it("una por tabla genérica que se escribe; columnas reales y sin las del sistema", () => {
    const want = Object.entries(BOOK_TABLE_POLICY).filter(([, p]) => p.generic && p.write !== "system").map(([t]) => t)
    expect(Object.keys(BOOK_TABLE_SCHEMAS).sort()).toEqual(want.sort())
    for (const [t, s] of Object.entries(BOOK_TABLE_SCHEMAS)) {
      const cols = Object.keys(s.shape)
      expect(cols.length, t).toBeGreaterThan(0)
      for (const c of cols) expect(BOOK_TABLE_COLUMNS[t as keyof typeof BOOK_TABLE_COLUMNS], `${t}.${c}`).toContain(c)
      for (const c of SYSTEM_COLUMNS) expect(cols, `${t} no debe aceptar ${c}`).not.toContain(c)
    }
    expect(isWritableTable("chat_threads")).toBe(false)
    expect(isWritableTable("toString")).toBe(false)
  })

  it("crear exige los obligatorios; editar acepta cualquier subconjunto pero no vacío", () => {
    expect(writeSchema("loans", "insert").safeParse({ monto: 1 }).success).toBe(false)
    expect(writeSchema("loans", "insert").safeParse({ kind: "pagar" }).success).toBe(true)
    expect(writeSchema("loans", "update").safeParse({ nota: "x" }).success).toBe(true)
    const vacio = writeSchema("loans", "update").safeParse({})
    expect(vacio.success).toBe(false)
    expect(vacio.error?.issues[0].message).toBe("No enviaste ningún cambio.")
  })

  it("rechaza columnas desconocidas, de enlaces y valores fuera del check", () => {
    const ins = (t: Parameters<typeof writeSchema>[0], v: unknown) => writeSchema(t, "insert").safeParse(v)
    expect(ins("categories", { nombre: "X", hack: 1 }).success).toBe(false)
    expect(ins("expenses", { fixed_expense_id: "00000000-0000-4000-8000-000000000000" }).success).toBe(false)
    expect(ins("card_payments", { card_id: "00000000-0000-4000-8000-000000000000", valor: 1, compras: [] }).success).toBe(false)
    expect(ins("expenses", { origen: "inventado" }).success).toBe(false)
    expect(ins("loans", { kind: "regalo" }).success).toBe(false)
    expect(ins("entities", { nombre: "El Oro", tipo: "Casa de empeño" }).success).toBe(true)
    expect(ins("expenses", { fecha: "02/11/2026" }).error?.issues[0].message).toBe("Fecha inválida (usa AAAA-MM-DD)")
    expect(ins("expenses", { category_id: "abc" }).error?.issues[0].message).toBe("Identificador inválido")
    expect(ins("fixed_expenses", { nombre: "Arriendo", dia: 5.5 }).error?.issues[0].message).toBe("Usa un número entero")
  })

  it("la nota del titular para el contador siempre queda como «titular»", () => {
    const r = writeSchema("accountant_notes", "insert").safeParse({ share_id: "00000000-0000-4000-8000-000000000000", texto: "Hola" })
    expect(r.data).toMatchObject({ autor: "titular" })
    expect(writeSchema("accountant_notes", "insert").safeParse({ share_id: "00000000-0000-4000-8000-000000000000", texto: "Hola", autor: "contador" }).success).toBe(false)
  })

  it("referencias: la categoría de un ingreso es de income_categories", () => {
    expect(refTable("expenses", "category_id")).toBe("categories")
    expect(refTable("incomes", "category_id")).toBe("income_categories")
    expect(refTable("expenses", "member_id")).toBeUndefined()
  })
})
