import { describe, expect, it } from "vitest"
import { parseCop, parseSharedText, resolveProtocolUrl, shareRedirectUrl } from "./links"
import { installPlatform } from "./platform"
import { normalizeTel } from "./contacts"

describe("enlaces web+mirai://", () => {
  it("accesos directos por su nombre", () => {
    expect(resolveProtocolUrl("web+mirai://gasto")).toBe("/gastos?nuevo=1")
    expect(resolveProtocolUrl("web+mirai:ingreso")).toBe("/ingresos?nuevo=1")
    expect(resolveProtocolUrl(encodeURIComponent("web+mirai://prestamo"))).toBe("/me-deben?nuevo=1")
    expect(resolveProtocolUrl("WEB+MIRAI://Deuda")).toBe("/le-debo?nuevo=1")
  })
  it("secciones y rutas internas con parámetros", () => {
    expect(resolveProtocolUrl("web+mirai://pagos")).toBe("/recordatorios")
    expect(resolveProtocolUrl("web+mirai://metas?nuevo=abono")).toBe("/metas?nuevo=abono")
  })
  it("nunca sale de Mirai", () => {
    expect(resolveProtocolUrl("https://malo.com")).toBe("/inicio")
    expect(resolveProtocolUrl("web+mirai:////malo.com")).toBe("/malo.com")
    expect(resolveProtocolUrl("web+mirai://\\malo.com")).toBe("/inicio")
    expect(resolveProtocolUrl("")).toBe("/inicio")
    expect(resolveProtocolUrl(null)).toBe("/inicio")
  })
})

describe("lo que se comparte a Mirai", () => {
  it("lee valores en pesos", () => {
    expect(parseCop("Pagaste $45.900 en Éxito")).toBe(45900)
    expect(parseCop("Compra por COP 1.250.000")).toBe(1250000)
    expect(parseCop("me costó 120 mil")).toBe(120000)
    expect(parseCop("Valor: 86.400,00")).toBe(86400)
    expect(parseCop("sin valor")).toBeNull()
  })
  it("arma descripción y valor desde título, texto o enlace", () => {
    expect(parseSharedText({ title: "Mercado D1", text: "Total $86.400" })).toEqual({ descripcion: "Mercado D1", valor: 86400 })
    expect(parseSharedText({ text: "Pagaste $45.900 en Éxito\nGracias por tu compra" })).toEqual({ descripcion: "Pagaste en Éxito", valor: 45900 })
    expect(parseSharedText({ url: "https://tienda.com/pedido/1" })).toEqual({ descripcion: "", valor: null })
    expect(parseSharedText({})).toBeNull()
  })
  it("respaldo sin service worker: el texto viaja en la URL del formulario", () => {
    expect(shareRedirectUrl({ text: { descripcion: "Taxi", valor: 18000 } })).toBe("/gastos?nuevo=1&compartido=texto&desc=Taxi&valor=18000")
    expect(shareRedirectUrl({ file: true })).toBe("/gastos?nuevo=1&compartido=archivo")
  })
})

describe("plataforma de instalación", () => {
  const ua = {
    iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1",
    iphoneInsta: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0",
    ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    android: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
    windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0",
    firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  }
  it("distingue cada caso", () => {
    expect(installPlatform(ua.iphone)).toBe("ios-safari")
    expect(installPlatform(ua.iphoneChrome)).toBe("ios-other")
    expect(installPlatform(ua.iphoneInsta)).toBe("ios-inapp")
    expect(installPlatform(ua.ipad, 5, "MacIntel")).toBe("ios-safari")
    expect(installPlatform(ua.ipad, 0, "MacIntel")).toBe("mac-safari")
    expect(installPlatform(ua.android)).toBe("android")
    expect(installPlatform(ua.windows)).toBe("desktop-chromium")
    expect(installPlatform(ua.firefox)).toBe("firefox")
  })
})

describe("contactos del celular", () => {
  it("deja el celular colombiano sin indicativo", () => {
    expect(normalizeTel("+57 300 123 4567")).toBe("3001234567")
    expect(normalizeTel("0057-310-555-1212")).toBe("3105551212")
    expect(normalizeTel("573001234567")).toBe("3001234567")
    expect(normalizeTel("(601) 345 6789")).toBe("6013456789")
  })
})
