import { describe, expect, it } from "vitest"
import { typedMoney } from "./format"

/** Simula teclear dígito por dígito como en el navegador (el campo muestra el texto reformateado). */
function typeKeys(keys: string, dec = false) {
  let text = ""
  let n = 0
  for (const k of keys) ({ n, text } = typedMoney(text + k, dec))
  return { n, text }
}

describe("typedMoney: escribir montos en vivo", () => {
  it("4.550.000 tecla por tecla no pierde dígitos", () => expect(typeKeys("4550000")).toEqual({ n: 4550000, text: "4.550.000" }))
  it("pasos intermedios", () => {
    expect(typedMoney("4.5500", false)).toEqual({ n: 45500, text: "45.500" })
    expect(typedMoney("455.0000", false)).toEqual({ n: 4550000, text: "4.550.000" })
  })
  it("pegar con símbolo y espacios", () => expect(typedMoney("$ 1.250.000", false).n).toBe(1250000))
  it("borrar todo deja vacío", () => expect(typedMoney("", false)).toEqual({ n: 0, text: "" }))
  it("con decimales (USD): coma decimal y máximo 2 decimales", () => {
    expect(typeKeys("1234,567", true)).toEqual({ n: 1234.56, text: "1.234,56" })
    expect(typedMoney("12,", true)).toEqual({ n: 12, text: "12," })
  })
})
