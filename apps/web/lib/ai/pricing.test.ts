import { describe, expect, it } from "vitest"
import { cheapModelFor, costFromMetadata, costUSD, creditsFor, estimateTokens, FALLBACK_PRICE, priceFor } from "./pricing"

describe("priceFor", () => {
  it("quita el prefijo del proveedor y elige la clave más específica", () => {
    expect(priceFor("google/gemini-2.5-flash")).toMatchObject({ in: 0.3, out: 2.5, known: true })
    expect(priceFor("google/gemini-2.5-flash-lite")).toMatchObject({ in: 0.1, out: 0.4 })
    expect(priceFor("gpt-5-mini")).toMatchObject({ in: 0.25, out: 2 })
    expect(priceFor("openai/gpt-5")).toMatchObject({ in: 1.25, out: 10 })
    expect(priceFor("claude-haiku-4-5")).toMatchObject({ in: 1, out: 5 })
  })
  it("los modelos gratis de OpenRouter cuestan 0", () => {
    expect(priceFor("openrouter/free")).toMatchObject({ in: 0, out: 0 })
    expect(priceFor("meta-llama/llama-3.3-70b-instruct:free")).toMatchObject({ in: 0, out: 0 })
  })
  it("un modelo desconocido usa el precio de respaldo", () => {
    expect(priceFor("acme/modelo-raro")).toMatchObject({ ...FALLBACK_PRICE, known: false })
    expect(priceFor(null).known).toBe(false)
  })
  it("el precio del administrador gana sobre la tabla", () => {
    expect(priceFor("google/gemini-2.5-flash", { "google/gemini-2.5-flash": { in: 9, out: 9 } })).toMatchObject({ in: 9, out: 9 })
    expect(priceFor("gemini-2.5-flash", { "gemini-2.5": { in: 7, out: 7 } })).toMatchObject({ in: 7 })
  })
})

describe("costUSD", () => {
  it("cobra entrada, salida y caché a su precio", () => {
    // 1M entrada (200k en caché) + 100k salida con gemini-2.5-flash: 0,8×0,3 + 0,2×0,075 + 0,1×2,5
    expect(costUSD({ input: 1_000_000, cached: 200_000, output: 100_000 }, "gemini-2.5-flash")).toBeCloseTo(0.24 + 0.015 + 0.25, 6)
  })
  it("sin precio de caché, la caché se cobra como entrada", () => {
    expect(costUSD({ input: 1_000_000, cached: 500_000 }, "llama-3.3-70b-versatile")).toBeCloseTo(0.59, 6)
  })
  it("una llamada típica de chat cuesta fracciones de centavo", () => {
    const c = costUSD({ input: 2000, output: 300 }, "google/gemini-2.5-flash")
    expect(c).toBeGreaterThan(0.001)
    expect(c).toBeLessThan(0.002)
  })
})

describe("costFromMetadata", () => {
  it("lee el costo real del AI Gateway y de OpenRouter", () => {
    expect(costFromMetadata({ gateway: { cost: "0.000123" } })).toBe(0.000123)
    expect(costFromMetadata({ openrouter: { usage: { cost: 0.002 } } })).toBe(0.002)
  })
  it("devuelve null si el proveedor no lo informa", () => {
    expect(costFromMetadata(undefined)).toBeNull()
    expect(costFromMetadata({ google: {} })).toBeNull()
    expect(costFromMetadata({ gateway: { cost: "abc" } })).toBeNull()
  })
})

describe("créditos", () => {
  it("1 crédito = US$ 0,001 por defecto y solo si lo paga la plataforma", () => {
    expect(creditsFor(0.0015)).toBe(1.5)
    expect(creditsFor(0.01, 0.002)).toBe(5)
    expect(creditsFor(0.5, 0.001, false)).toBe(0)
  })
  it("estima ~4 caracteres por token", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100)
    expect(estimateTokens(null)).toBe(0)
  })
})

describe("cheapModelFor", () => {
  it("usa el modelo barato solo si de verdad es más barato", () => {
    expect(cheapModelFor("ai_gateway", "google/gemini-2.5-flash")).toBe("google/gemini-2.5-flash-lite")
    expect(cheapModelFor("ai_openai", "gpt-5-mini")).toBe("gpt-5-nano")
    expect(cheapModelFor("ai_anthropic", "claude-sonnet-4-5")).toBe("claude-haiku-4-5")
    expect(cheapModelFor("ai_anthropic", "claude-haiku-4-5")).toBeNull()
    expect(cheapModelFor("ai_gateway", "google/gemini-2.5-flash-lite")).toBeNull()
  })
  it("respeta el modelSimple configurado y no cambia proveedores sin barato", () => {
    expect(cheapModelFor("ai_openai", "gpt-5", "gpt-4.1-nano")).toBe("gpt-4.1-nano")
    expect(cheapModelFor("ai_groq", "llama-3.3-70b-versatile")).toBeNull()
    expect(cheapModelFor("ai_openrouter", "openrouter/free")).toBeNull()
  })
})
