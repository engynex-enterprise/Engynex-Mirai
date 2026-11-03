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
    // 31 de la v6 + `auth` (v7, V7-A). Cada módulo nuevo de v7 suma aquí.
    expect(mods.length).toBe(32)
    expect(mods.map((m) => (m as { meta: { id: string } }).meta.id)).toContain("auth")
  })
})

describe("interruptores de la API (api_rollout)", () => {
  it("off por defecto, qa solo para las personas de _users, on para todos", async () => {
    const { viaApi } = await import("./rollout")
    const r = { _users: ["qa-1"], me: "on", catalogs: "qa", expenses: "off" }
    expect(viaApi(r, "me", "x")).toBe(true)
    expect(viaApi(r, "catalogs", "qa-1")).toBe(true)
    expect(viaApi(r, "catalogs", "x")).toBe(false)
    expect(viaApi(r, "expenses", "qa-1")).toBe(false)
    expect(viaApi(r, "chat", "qa-1")).toBe(false)
    expect(viaApi(null, "me", "x")).toBe(false)
    expect(viaApi({ me: "raro" }, "me", "x")).toBe(false)
  })

  it("un valor inválido no apaga los demás; _off apaga todo", async () => {
    const { viaApi, resolveRollout } = await import("./rollout")
    expect(viaApi({ me: "raro", chat: "on" }, "chat", "x")).toBe(true)
    expect(resolveRollout({ _off: true, chat: "on" }, { userId: "x" })).toEqual({})
    expect(resolveRollout("basura", { userId: "x" })).toEqual({})
  })

  it("admins solo para administradores de la plataforma", async () => {
    const { viaApi } = await import("./rollout")
    expect(viaApi({ admin: "admins" }, "admin", "x", { isAdmin: true })).toBe(true)
    expect(viaApi({ admin: "admins" }, "admin", "x")).toBe(false)
  })

  it("pct:N enciende un porcentaje estable de personas", async () => {
    const { viaApi, rolloutBucket } = await import("./rollout")
    const ids = Array.from({ length: 2000 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`)
    const on = ids.filter((id) => viaApi({ chat: "pct:25" }, "chat", id)).length
    expect(on / ids.length).toBeGreaterThan(0.2)
    expect(on / ids.length).toBeLessThan(0.3)
    expect(ids.every((id) => viaApi({ chat: "pct:25" }, "chat", id) === viaApi({ chat: "pct:25" }, "chat", id))).toBe(true)
    // Subir el porcentaje nunca saca a quien ya estaba.
    expect(ids.filter((id) => viaApi({ chat: "pct:25" }, "chat", id)).every((id) => viaApi({ chat: "pct:50" }, "chat", id))).toBe(true)
    expect(viaApi({ chat: "pct:0" }, "chat", ids[0])).toBe(false)
    expect(ids.every((id) => viaApi({ chat: "pct:100" }, "chat", id))).toBe(true)
    expect(viaApi({ chat: "pct:101" }, "chat", ids[0])).toBe(false)
    expect(viaApi({ chat: "pct:50" }, "chat", null)).toBe(false)
    expect(rolloutBucket("chat", "a")).toBe(rolloutBucket("chat", "a"))
  })

  it("la clave de detalle (módulo:tabla) gana sobre la del módulo", async () => {
    const { viaApi, flagOn } = await import("./rollout")
    const r = { "book-tables": "on", "book-tables:expenses": "off" }
    expect(viaApi(r, "book-tables", "x", { detail: "expenses" })).toBe(false)
    expect(viaApi(r, "book-tables", "x", { detail: "categories" })).toBe(true)
    expect(flagOn({ "book-tables:loans": true }, "book-tables", "loans")).toBe(true)
    expect(flagOn({ "book-tables:loans": true }, "book-tables", "goals")).toBe(false)
    expect(flagOn(null, "me")).toBe(false)
  })
})
