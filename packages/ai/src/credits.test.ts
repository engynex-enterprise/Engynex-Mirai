import { describe, expect, it } from "vitest"
import { byDay, dayBogota, groupBy, monthStartBogota, quotaState, savings, totals, type RollupRow } from "./credits"

const row = (p: Partial<RollupRow>): RollupRow => ({
  dia: "2026-11-01", household_id: "h1", plan: "premium", feature: "chat", fuente: "ia", provider: "ai_gateway", model: "google/gemini-2.5-flash",
  de_plataforma: true, ok: true, llamadas: 1, input_tokens: 0, output_tokens: 0, cached_tokens: 0, tokens_evitados: 0, costo_usd: 0, costo_cop: 0, creditos: 0, duracion_ms: 0, ...p,
})

describe("quotaState", () => {
  it("ok, aviso al 80 % y agotado al 100 %", () => {
    expect(quotaState(100, 1000)).toMatchObject({ nivel: "ok", quedan: 900, pct: 10 })
    expect(quotaState(800, 1000)).toMatchObject({ nivel: "aviso", quedan: 200, pct: 80 })
    expect(quotaState(1000, 1000)).toMatchObject({ nivel: "agotado", quedan: 0, pct: 100 })
    expect(quotaState(1500, 1000)).toMatchObject({ nivel: "agotado", quedan: 0, pct: 100 })
  })
  it("el porcentaje de aviso es configurable", () => {
    expect(quotaState(500, 1000, 50).nivel).toBe("aviso")
    expect(quotaState(499, 1000, 50).nivel).toBe("ok")
  })
  it("cupo null = sin límite; cupo 0 = sin IA", () => {
    expect(quotaState(99999, null)).toMatchObject({ nivel: "sin_limite", quedan: null })
    expect(quotaState(0, 0).nivel).toBe("agotado")
  })
})

describe("fechas de Colombia", () => {
  it("el mes empieza a las 00:00 de Bogotá (05:00 UTC)", () => {
    expect(monthStartBogota(new Date("2026-11-15T12:00:00Z"))).toBe("2026-11-01T05:00:00.000Z")
    // 1 de diciembre a las 02:00 UTC todavía es 30 de noviembre en Colombia.
    expect(monthStartBogota(new Date("2026-12-01T02:00:00Z"))).toBe("2026-11-01T05:00:00.000Z")
    expect(dayBogota(new Date("2026-12-01T02:00:00Z"))).toBe("2026-11-30")
  })
})

describe("agregados", () => {
  const rows = [
    row({ feature: "chat", llamadas: 2, input_tokens: 4000, output_tokens: 600, costo_usd: 0.0027, creditos: 2.7, duracion_ms: 3000 }),
    row({ feature: "categorizar", fuente: "algoritmo", llamadas: 5, tokens_evitados: 3000 }),
    row({ feature: "categorizar", fuente: "cache", llamadas: 1, tokens_evitados: 500, dia: "2026-11-02" }),
    row({ feature: "factura", ok: false, llamadas: 1, dia: "2026-11-02", model: "gpt-5-mini", de_plataforma: false }),
  ]
  it("totales separan IA, caché, algoritmo y errores", () => {
    const t = totals(rows)
    expect(t).toMatchObject({ llamadas: 9, ia: 3, cache: 1, algoritmo: 5, errores: 1, tokensIn: 4000, tokensOut: 600, tokensEvitados: 3500, creditos: 2.7 })
    expect(t.msProm).toBe(1000)
  })
  it("agrupa y ordena por costo", () => {
    const g = groupBy(rows, (r) => r.feature)
    expect(g[0].k).toBe("chat")
    expect(g.find((x) => x.k === "categorizar")).toMatchObject({ llamadas: 6, cache: 1, algoritmo: 5 })
  })
  it("la serie por día rellena los días vacíos", () => {
    const s = byDay(rows, "2026-10-31", "2026-11-03")
    expect(s.map((x) => x.k)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"])
    expect(s[0].llamadas).toBe(0)
    expect(s[1].llamadas).toBe(7)
  })
  it("el ahorro valora los tokens evitados al costo promedio real", () => {
    const sv = savings(totals(rows))
    expect(sv).toMatchObject({ llamadas: 6, pct: 67, tokens: 3500 })
    expect(sv.usd).toBeCloseTo((0.0027 / 4600) * 3500, 6)
  })
})
