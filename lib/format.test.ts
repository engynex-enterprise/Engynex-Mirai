import { describe, expect, it } from "vitest"
import { digitosDian, edad, proxCumple, typedMoney } from "./format"

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

describe("edad", () => {
  it("cuenta los años cumplidos y detecta el cumpleaños", () => {
    expect(edad("1990-11-01", "2026-11-01")).toEqual({ años: 36, cumple: true })
    expect(edad("1990-11-02", "2026-11-01")).toEqual({ años: 35, cumple: false })
    expect(edad("1990-10-31", "2026-11-01")).toEqual({ años: 36, cumple: false })
    expect(edad(null)).toBeNull()
  })
})

describe("proxCumple y digitosDian", () => {
  it("cuenta los días al próximo cumpleaños", () => {
    expect(proxCumple("1990-11-01", "2026-11-01")).toEqual({ dias: 0, años: 36 })
    expect(proxCumple("2018-11-13", "2026-11-01")).toEqual({ dias: 12, años: 8 })
    expect(proxCumple("1990-10-31", "2026-11-01")).toEqual({ dias: 364, años: 37 })
    expect(proxCumple("2000-02-29", "2027-02-27")).toEqual({ dias: 1, años: 27 })
  })
  it("toma los 2 últimos dígitos de la cédula", () => {
    expect(digitosDian("1.020.345.678")).toBe("78")
    expect(digitosDian("79 123 405")).toBe("05")
    expect(digitosDian("7")).toBe("")
  })
})
