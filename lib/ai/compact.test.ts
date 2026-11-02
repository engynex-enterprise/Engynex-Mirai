import { describe, expect, it } from "vitest"
import { chatWindow, clip, prune, roundMoney, toLines, topN } from "./compact"

describe("roundMoney", () => {
  it("redondea a miles desde $ 100.000 y deja exacto lo menor", () => {
    expect(roundMoney(1_234_567)).toBe(1_235_000)
    expect(roundMoney(99_999)).toBe(99_999)
    expect(roundMoney(1095)).toBe(1095)
    expect(roundMoney(1.8567)).toBe(1.86)
    expect(roundMoney(NaN)).toBe(0)
  })
})

describe("prune y toLines", () => {
  it("quita nulos y vacíos pero conserva los ceros", () => {
    expect(prune({ a: null, b: "", c: [], d: 0, e: { f: undefined }, g: "x" })).toEqual({ d: 0, g: "x" })
  })
  it("arma líneas clave: valor más cortas que el JSON", () => {
    const data = { ingreso_mensual: 4_523_456, fondo_emergencia: 0, deudas: [{ nombre: "Tarjeta", saldo: 1_200_400 }, { nombre: "Moto", saldo: 3_000_000 }], nota: null }
    const lines = toLines(data)
    expect(lines).toBe("ingreso_mensual: 4523000\nfondo_emergencia: 0\ndeudas: nombre=Tarjeta; saldo=1200000 | nombre=Moto; saldo=3000000")
    expect(lines.length).toBeLessThan(JSON.stringify(data).length * 0.85)
  })
  it("exact deja las cifras tal cual (consejero y resumen)", () => {
    expect(toLines({ cuota: 1_234_567, tasa: 1.856 }, { exact: true })).toBe("cuota: 1234567\ntasa: 1.86")
  })
})

describe("topN", () => {
  it("deja las N mayores y suma el resto en otros", () => {
    expect(topN({ a: 10, b: 50, c: 30, d: 5, e: 0 }, 2)).toEqual({ b: 50, c: 30, otros: 15 })
    expect(topN({ a: 1 }, 5)).toEqual({ a: 1 })
  })
})

describe("clip", () => {
  it("recorta sin cortar palabras", () => {
    expect(clip("hola   mundo", 20)).toBe("hola mundo")
    expect(clip("compra en el almacén del barrio", 18)).toBe("compra en el…")
  })
})

describe("chatWindow", () => {
  const msgs = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `mensaje ${i} ${"x".repeat(i === 9 ? 1000 : 10)}` }))
  it("manda solo los últimos mensajes y resume los anteriores", () => {
    const w = chatWindow(msgs, { keep: 4 })
    expect(w.text.split("\n")).toHaveLength(4)
    expect(w.text.startsWith("Persona: mensaje 6")).toBe(true)
    expect(w.resumen).toContain("mensaje 0")
    expect(w.resumen).not.toContain("mensaje 1 ") // las respuestas del asesor no van al resumen
  })
  it("recorta las respuestas largas del asesor", () => {
    const w = chatWindow(msgs, { keep: 4, botMax: 100 })
    expect(w.text.split("\n").at(-1)!.length).toBeLessThan(120)
  })
  it("sin historial previo no hay resumen", () => {
    expect(chatWindow(msgs.slice(0, 3), { keep: 6 }).resumen).toBeNull()
  })
})
