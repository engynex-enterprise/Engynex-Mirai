import { describe, expect, it } from "vitest"
import { CSP_BASE, cspDirectives, securityHeaders } from "./headers"

const get = (h: { key: string; value: string }[], k: string) => h.find((x) => x.key === k)?.value

describe("cabeceras de seguridad", () => {
  it("producción: CSP base aplicada, completa en solo reportar, HSTS y sin iframes ajenos", () => {
    const h = securityHeaders({ dev: false, supabaseUrl: "https://abc.supabase.co" })
    expect(get(h, "Content-Security-Policy")).toBe(CSP_BASE)
    expect(get(h, "Content-Security-Policy-Report-Only")).toContain("wss://abc.supabase.co")
    expect(get(h, "Strict-Transport-Security")).toMatch(/max-age=\d+/)
    expect(get(h, "X-Frame-Options")).toBe("SAMEORIGIN")
    expect(get(h, "X-Content-Type-Options")).toBe("nosniff")
    expect(get(h, "Permissions-Policy")).toContain("microphone=(self)")
  })
  it("con MIRAI_CSP_ENFORCE la CSP completa se aplica", () => {
    const h = securityHeaders({ dev: false, enforceCsp: true })
    expect(get(h, "Content-Security-Policy")).toContain("script-src")
    expect(get(h, "Content-Security-Policy-Report-Only")).toBeUndefined()
  })
  it("la CSP completa no rompe AdSense ni Supabase y bloquea lo peligroso", () => {
    const c = cspDirectives({ dev: false, supabaseUrl: "https://abc.supabase.co" })
    expect(c).toContain("object-src 'none'")
    expect(c).toContain("frame-ancestors 'self'")
    expect(c).toMatch(/script-src [^;]*https:/)
    expect(c).not.toContain("'unsafe-eval'")
    expect(c).toContain("upgrade-insecure-requests")
  })
  it("desarrollo: sin HSTS y con eval para la recarga en caliente", () => {
    const h = securityHeaders({ dev: true })
    expect(get(h, "Strict-Transport-Security")).toBeUndefined()
    expect(cspDirectives({ dev: true })).toContain("'unsafe-eval'")
  })
})
