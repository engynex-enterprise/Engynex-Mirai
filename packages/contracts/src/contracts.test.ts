import { describe, expect, it } from "vitest"
import { z } from "zod"
import { OWN_ROW_TABLES } from "@mirai/domain/household/roles"
import { FEATURE_LIST } from "@mirai/domain/plans"
import * as all from "./index"
import { BOOK_TABLE_POLICY, BOOK_TABLES, isGenericTable, type PolicyTable } from "./book-tables"
import { API_ERROR_STATUS, ApiError, apiError, IsoDate, IsoMonth, Money, Uuid } from "./common"
import { HOUSEHOLD_TABLES, isLiveTable, LIVE_TABLES } from "./live"
import { LIMITS } from "./limits"
import { enableZodEs, fieldErrors, miraiMessage } from "./zod-es"

const tables = Object.keys(BOOK_TABLE_POLICY) as PolicyTable[]

describe("política del CRUD del libro", () => {
  it("live coincide con LIVE_TABLES", () => {
    for (const t of tables) expect(BOOK_TABLE_POLICY[t].live, t).toBe(isLiveTable(t))
  })
  it("own coincide con OWN_ROW_TABLES del dominio y esas tablas se escriben desde 'registra'", () => {
    expect(tables.filter((t) => BOOK_TABLE_POLICY[t].own).sort()).toEqual([...OWN_ROW_TABLES].sort())
    for (const t of OWN_ROW_TABLES) expect(BOOK_TABLE_POLICY[t].write).toBe("registra")
  })
  it("backup coincide con BOOK_TABLES (la copia de seguridad) y BOOK_TABLES no se repite", () => {
    for (const t of tables) expect(BOOK_TABLE_POLICY[t].backup, t).toBe((BOOK_TABLES as readonly string[]).includes(t))
    expect(new Set(BOOK_TABLES).size).toBe(BOOK_TABLES.length)
    expect(BOOK_TABLES).toHaveLength(33)
  })
  it("las funciones Premium existen y lo de 'system' no va por el CRUD genérico", () => {
    for (const t of tables) {
      const { feature, write, generic } = BOOK_TABLE_POLICY[t]
      if (feature) expect(FEATURE_LIST).toContain(feature)
      if (write === "system") expect(generic, t).toBe(false)
    }
    expect(isGenericTable("expenses")).toBe(true)
    expect(isGenericTable("chat_messages")).toBe(false)
    expect(isGenericTable("profiles")).toBe(false)
  })
})

describe("tablas en vivo y límites", () => {
  it("sin repetidos y sin cruzar libro con hogar", () => {
    expect(new Set(LIVE_TABLES).size).toBe(LIVE_TABLES.length)
    for (const t of HOUSEHOLD_TABLES) expect(isLiveTable(t)).toBe(false)
  })
  it("cada límite tiene máximo y ventana positivos", () => {
    for (const [k, v] of Object.entries(LIMITS)) expect(v.max > 0 && v.windowS > 0, k).toBe(true)
  })
})

describe("esquemas comunes", () => {
  it("Uuid, fechas y montos", () => {
    expect(Uuid.safeParse(crypto.randomUUID()).success).toBe(true)
    expect(Uuid.safeParse("tmp-1").error?.issues[0].message).toBe("Identificador inválido")
    expect(IsoDate.safeParse("2026-11-02").success).toBe(true)
    expect(IsoDate.safeParse("02/11/2026").success).toBe(false)
    expect(IsoMonth.safeParse("2026-11").success).toBe(true)
    expect(IsoMonth.safeParse("2026-13").success).toBe(false)
    expect(Money.safeParse(15000.5).success).toBe(true)
    expect(Money.safeParse(Number.NaN).success).toBe(false)
    expect(Money.safeParse("15000").error?.issues[0].message).toBe("Escribe un valor en números")
  })
  it("ApiError: forma única con código HTTP", () => {
    const e = apiError("ROLE_DENIED", "Tu rol no permite registrar y editar todos los movimientos.")
    expect(ApiError.parse(e)).toEqual(e)
    expect(API_ERROR_STATUS[e.code]).toBe(403)
    expect(ApiError.safeParse({ ok: false, msg: "x", code: "OTRO" }).success).toBe(false)
  })
})

describe("zod en español", () => {
  it("activa la traducción es y los ajustes de Mirai", () => {
    enableZodEs()
    const S = z.object({ nombre: z.string().min(1), valor: z.number(), notas: z.string().max(3) })
    const r = S.safeParse({ nombre: "", valor: "x", notas: "abcd" })
    expect(r.success).toBe(false)
    const f = fieldErrors(r.error!)
    expect(f.nombre).toBe("Este campo es obligatorio")
    expect(f.valor).toBe("Escribe un número")
    expect(f.notas).toMatch(/demasiado|grande|máximo|como máximo/i)
    expect(miraiMessage({ code: "custom", input: 1, message: "", path: [] } as never)).toBeUndefined()
  })
})

describe("índice", () => {
  it("lista un namespace por módulo de la API (§2.6)", () => {
    const mods = Object.values(all).filter((v) => typeof v === "object" && v !== null && "meta" in v && typeof v.meta === "object" && v.meta !== null && "owner" in v.meta)
    expect(mods.length).toBe(31)
  })
})
