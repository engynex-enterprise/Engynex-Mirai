// Plantillas de WhatsApp en Meta (wa-meta): hosts permitidos para la imagen del ejemplo y la llamada de borrar, con
// fetch simulado (sin red).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import type { IntegrationValue } from "../integrations/store"
import { configureServices } from "../runtime"
import { allowedHost, deleteTemplate } from "./wa-meta"

const ENV: Record<string, string> = { PUBLIC_FILES_URL: "https://files.mirai.test", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" }
beforeAll(() => {
  configureServices({ admin: () => ({}) as never, loadBook: async () => { throw new Error("sin libro") }, encrypt: (x) => x, decrypt: (x) => x, env: (k) => ENV[k], siteUrl: () => "http://localhost:3000", publicSiteUrl: () => "https://mirai.test" })
})
afterEach(() => vi.unstubAllGlobals())

const V: IntegrationValue = { kind: "whatsapp", enabled: true, config: { wabaId: "7654321" }, secrets: { token: "EAAG" }, source: "plataforma" }

describe("imagen del ejemplo", () => {
  it("solo de Mirai (sitio y archivos) o de los CDN de Meta", () => {
    for (const u of ["https://files.mirai.test/ads/x.png", "https://abc.supabase.co/storage/v1/x.png", "https://mirai.test/brand/x.png", "http://localhost:3000/x.png", "https://scontent.whatsapp.net/x.jpg", "https://a.fbcdn.net/x.jpg"]) expect(allowedHost(new URL(u)), u).toBe(true)
    for (const u of ["https://evil.test/x.png", "https://fbcdn.net.evil.test/x.png"]) expect(allowedHost(new URL(u)), u).toBe(false)
  })
})

describe("eliminar plantilla", () => {
  it("DELETE a la cuenta con el nombre (y la traducción si viene)", async () => {
    const calls: { url: string; method?: string; auth?: string }[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method, auth: (init.headers as Record<string, string>).authorization })
      return new Response(JSON.stringify({ success: true }), { headers: { "content-type": "application/json" } })
    }))
    await deleteTemplate(V, "aviso_pago")
    await deleteTemplate(V, "aviso_pago", "123456")
    expect(calls).toEqual([
      { url: "https://graph.facebook.com/v23.0/7654321/message_templates?name=aviso_pago", method: "DELETE", auth: "Bearer EAAG" },
      { url: "https://graph.facebook.com/v23.0/7654321/message_templates?name=aviso_pago&hsm_id=123456", method: "DELETE", auth: "Bearer EAAG" },
    ])
  })

  it("sin cuenta de WhatsApp Business: mensaje claro y no llama a Meta", async () => {
    const f = vi.fn()
    vi.stubGlobal("fetch", f)
    await expect(deleteTemplate({ ...V, config: {} }, "x")).rejects.toThrow("Falta el ID de la cuenta de WhatsApp Business o el token")
    expect(f).not.toHaveBeenCalled()
  })
})
