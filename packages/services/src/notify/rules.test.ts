import { describe, expect, it } from "vitest"
import { avisoOn } from "@mirai/domain"
import { AVISOS, avisoOf, defaultMatriz, enSilencio, maskDest, onFor } from "./rules"

describe("reglas de avisos por canal", () => {
  it("matriz por defecto: pagos y cobros por WhatsApp; hormiga solo en la app", () => {
    expect(onFor(null, "pagos", "whatsapp")).toBe(true)
    expect(onFor({}, "cobros", "whatsapp")).toBe(true)
    expect(onFor(null, "hormiga", "whatsapp")).toBe(false)
    expect(onFor(null, "hormiga", "app")).toBe(true)
    expect(defaultMatriz().inversiones?.email).toBe(true)
  })
  it("matriz del usuario: la app sale salvo false; los demás canales solo con true", () => {
    const m = { pagos: { app: false, email: true } }
    expect(onFor(m, "pagos", "app")).toBe(false)
    expect(onFor(m, "pagos", "email")).toBe(true)
    expect(onFor(m, "pagos", "whatsapp")).toBe(false)
    expect(onFor(m, "metas", "app")).toBe(true)
  })
  it("categoría por prefijo del id", () => {
    expect(avisoOf("pr:123")).toBe("empenos")
    expect(avisoOf("c:1")).toBe("cobros")
    expect(avisoOf("c:cal:e1:2026-06-30")).toBe("cobros")
    expect(avisoOf("p:cal:dian:2026:2026-11-06")).toBe("pagos")
    expect(avisoOf("t:corte:c1:2026-11-03")).toBe("tarjetas")
    expect(avisoOf("ms:a1:2026-11-02")).toBe("mesadas")
    expect(avisoOf("sg:g1:2026-11:+")).toBe("compartidos")
    expect(avisoOf("zz:1")).toBe("pagos")
  })
  it("cada tipo de aviso tiene su interruptor (avisoOn) y su fila en la matriz", () => {
    for (const a of AVISOS) {
      expect(avisoOn({}, a.k)).toBe(true)
      expect(avisoOn({ [a.k]: false }, a.k)).toBe(false)
      expect(defaultMatriz()[a.k]?.app).toBe(true)
    }
  })
  it("los empeños siguen la fila de pagos mientras la persona no los toque; los otros tipos nuevos van solo a la app", () => {
    const m = { pagos: { app: true, email: true, whatsapp: false }, cobros: { app: true, telegram: true } }
    expect(onFor(m, "empenos", "email")).toBe(true)
    expect(onFor(m, "empenos", "whatsapp")).toBe(false)
    expect(onFor(m, "compartidos", "telegram")).toBe(false)
    expect(onFor(m, "tarjetas", "app")).toBe(true)
    expect(onFor({ ...m, empenos: { app: true, email: false } }, "empenos", "email")).toBe(false)
    expect(onFor(null, "empenos", "whatsapp")).toBe(true)
    expect(onFor(null, "tarjetas", "whatsapp")).toBe(false)
  })
  it("horario de silencio que cruza la medianoche", () => {
    const s = { on: true, desde: 22, hasta: 7 }
    expect(enSilencio(23, s)).toBe(true)
    expect(enSilencio(6, s)).toBe(true)
    expect(enSilencio(12, s)).toBe(false)
    expect(enSilencio(23, { ...s, on: false })).toBe(false)
  })
})

describe("destino enmascarado en el registro de envíos", () => {
  it("correo, WhatsApp y Telegram", () => {
    expect(maskDest("email", "alberto@gmail.com")).toBe("al•••@gmail.com")
    expect(maskDest("whatsapp", "573151234567")).toBe("+57 315 ••• 4567")
    expect(maskDest("telegram", "123456789")).toBe("•••6789")
    expect(maskDest("email", "")).toBeNull()
  })
})
