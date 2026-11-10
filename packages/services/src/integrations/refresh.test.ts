// Paso «usura» del cron de referencias: guarda la tasa publicada con su fuente y a los libros en automático les pone la
// que RIGE hoy (usura_vigente), no la del mes siguiente que la Superfinanciera publica antes de que empiece.
import { beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>
const db = { upserts: [] as Row[], updates: [] as { values: Row; ids: unknown[] }[], vigente: 0 as number | null }

function q(table: string) {
  const chain = {
    select: () => chain, is: () => chain, eq: () => chain, not: () => chain, gt: () => chain,
    then: (ok: (v: { data: Row[] }) => unknown) => ok({ data: table === "books" ? [{ id: "b1", household_id: "h1" }, { id: "b2", household_id: "h2" }] : table === "book_settings" ? [{ book_id: "b1" }, { book_id: "b2" }] : [] }),
    upsert: async (v: Row) => { if (table === "ref_usury_rate") db.upserts.push(v); return { error: null } },
    update: (values: Row) => ({ in: async (_c: string, ids: unknown[]) => { db.updates.push({ values, ids }); return { error: null } }, eq: async () => ({ error: null }) }),
  }
  return chain
}
vi.mock("../runtime", () => ({ rt: () => ({ admin: () => ({ from: q, rpc: async () => ({ data: db.vigente }) }) }) }))
vi.mock("./store", () => ({ getGlobalIntegration: async () => null, getIntegration: async (h: string) => ({ enabled: h === "h1" }) }))
vi.mock("./data-sources", () => ({
  fetchUsura: async () => ({ ibc: 19.2, usura: 28.8, desde: "2026-12-01", hasta: "2026-12-31" }),
  fetchTrm: async () => { throw new Error("sin red") }, fetchFx: async () => { throw new Error("sin red") }, fetchFestivos: async () => { throw new Error("sin red") },
  fetchCryptoPrices: async () => ({}), fetchStockPrice: async () => null,
}))

const { refreshReferenceData } = await import("./refresh")

beforeEach(() => { db.upserts = []; db.updates = []; db.vigente = 28.34 })

describe("cron de referencias › usura", () => {
  it("la de diciembre se guarda con su fuente, pero a los libros va la que rige hoy (28,34 % de noviembre)", async () => {
    const log = await refreshReferenceData()
    expect(db.upserts[0]).toMatchObject({ desde: "2026-12-01", modalidad: "consumo", tasa_ea: 28.8, fuente: expect.stringMatching(/Superintendencia Financiera/) })
    expect(db.updates).toEqual([{ values: { usura: 28.34 }, ids: ["b1"] }])
    expect(log.find((l) => l.startsWith("usura"))).toMatch(/vigente 28.34 %/)
  })
  it("si todavía no hay una tasa vigente para hoy, no toca los libros", async () => {
    db.vigente = null
    await refreshReferenceData()
    expect(db.updates).toEqual([])
  })
})
