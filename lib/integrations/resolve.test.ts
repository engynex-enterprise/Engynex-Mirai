import { describe, expect, it } from "vitest"
import { USE_PLATFORM, resolveIntegration, resolvePlatformOnly } from "./resolve"

const own = (enabled: boolean, config: Record<string, unknown> = {}) => ({ enabled, config })
const g = (modo: "apagada" | "opcional" | "por_defecto" | "obligatoria", planes: string[] = []) => ({ modo, planes })

describe("integración efectiva hogar + plataforma", () => {
  it("sin nada: no hay integración (salvo variable de entorno)", () => {
    expect(resolveIntegration({ own: null, global: null, plan: "gratis" })).toBeNull()
    expect(resolveIntegration({ own: null, global: null, plan: "gratis", envReady: true })?.source).toBe("env")
  })
  it("obligatoria: siempre la de la plataforma, aunque el hogar tenga la suya o la apague", () => {
    expect(resolveIntegration({ own: own(true), global: g("obligatoria"), plan: "gratis" })).toEqual({ source: "plataforma", locked: true })
    expect(resolveIntegration({ own: own(false), global: g("obligatoria"), plan: "gratis" })?.source).toBe("plataforma")
  })
  it("por defecto: activa sin hacer nada; el hogar puede apagarla o usar la suya", () => {
    expect(resolveIntegration({ own: null, global: g("por_defecto"), plan: "gratis" })?.source).toBe("plataforma")
    expect(resolveIntegration({ own: own(false), global: g("por_defecto"), plan: "gratis" })).toBeNull()
    expect(resolveIntegration({ own: own(true), global: g("por_defecto"), plan: "gratis" })?.source).toBe("hogar")
  })
  it("opcional: solo si el hogar elige usar la de Mirai", () => {
    expect(resolveIntegration({ own: null, global: g("opcional"), plan: "gratis" })).toBeNull()
    expect(resolveIntegration({ own: own(true, { [USE_PLATFORM]: true }), global: g("opcional"), plan: "gratis" })?.source).toBe("plataforma")
  })
  it("solo aplica a los planes elegidos", () => {
    expect(resolveIntegration({ own: null, global: g("por_defecto", ["premium"]), plan: "gratis" })).toBeNull()
    expect(resolveIntegration({ own: null, global: g("obligatoria", ["premium"]), plan: "premium" })?.source).toBe("plataforma")
  })
  it("apagada: se ignora", () => {
    expect(resolveIntegration({ own: own(true), global: g("apagada"), plan: "gratis" })?.source).toBe("hogar")
  })
})

describe("integraciones que solo administra Mirai", () => {
  it("activa: la de la plataforma, solo en los planes elegidos", () => {
    expect(resolvePlatformOnly({ global: g("obligatoria"), plan: "gratis" })?.source).toBe("plataforma")
    expect(resolvePlatformOnly({ global: g("por_defecto", ["premium"]), plan: "gratis" })).toBeNull()
    expect(resolvePlatformOnly({ global: g("opcional", ["premium"]), plan: "premium" })?.source).toBe("plataforma")
  })
  it("apagada por el administrador: no se usa, aunque haya variable de entorno", () => {
    expect(resolvePlatformOnly({ global: g("apagada"), plan: "gratis", envReady: true, keyless: true })).toBeNull()
  })
  it("sin configurar: variable de entorno o servicio sin claves", () => {
    expect(resolvePlatformOnly({ global: null, plan: "gratis", envReady: true })?.source).toBe("env")
    expect(resolvePlatformOnly({ global: null, plan: "gratis", keyless: true })?.source).toBe("plataforma")
    expect(resolvePlatformOnly({ global: null, plan: "gratis" })).toBeNull()
  })
})
