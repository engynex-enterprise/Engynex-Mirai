// V7-G: eventos de anuncios (useTrack), AdSense público (useAdsense + ads.txt) y consola › Anuncios (admin-ads.tsx)
// con la app real y RowStore en memoria: RPC ad_track con la sesión, sin secretos en lo público, solo administradores
// en la consola y cada cambio en admin_audit (SystemScope).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { AD_NOT_FOUND, CAMPAIGN_NOT_FOUND } from "../../src/modules/ads/ads-write.service"
import { USERS } from "../setup/fixtures"
import { createV7gApp, type V7gApp } from "./app"

let t: V7gApp
const AD = "ad000000-0000-4000-8000-000000000001"
const CAMP = "ca000000-0000-4000-8000-000000000001"
const NOPE = "ff000000-0000-4000-8000-000000000009"
const ad = { id: AD, titulo: "Cuenta de ahorros", texto: "Sin cuota", imagen: null, url: "https://banco.co", cta: "Conocer más", anunciante: "Banco", ubicaciones: ["inicio"], activo: true, desde: null, hasta: null, prioridad: 0, campaign_id: CAMP, formato: "imagen", media: {}, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }
const camp = { id: CAMP, nombre: "Lanzamiento", anunciante: "Banco", objetivo: "trafico", estado: "activa", desde: null, hasta: null, modelo_cobro: "cpm", tarifa: "12.50", presupuesto: null, planes: [], dispositivos: ["movil"], frecuencia_max: "3", prioridad: 0, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }

beforeAll(async () => {
  t = await createV7gApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.fx.rows.reset()
})

describe("POST /v1/ads/events", () => {
  it("llama ad_track con la sesión de la persona (suma también a sus vistas del día)", async () => {
    const r = await t.call("POST", "/v1/ads/events", "viewer", { ad: AD, slot: "inicio", kind: "vista" })
    expect(r.body).toEqual({ ok: true, data: {} })
    expect(t.fx.rows.rpcs).toEqual([{ fn: "ad_track", args: { p_ad: AD, p_slot: "inicio", p_kind: "vista" }, scope: expect.objectContaining({ kind: "user", userId: USERS.viewer }) }])
  })

  it("espacio o evento inválido: 400 en español; sin sesión: 401", async () => {
    expect((await t.call("POST", "/v1/ads/events", "viewer", { ad: AD, slot: "inicio", kind: "like" })).body).toMatchObject({ code: "VALIDATION" })
    expect(JSON.stringify((await t.call("POST", "/v1/ads/events", "viewer", { ad: AD, slot: "techo", kind: "clic" })).body)).toContain("Espacio de anuncio inválido")
    expect((await t.call("POST", "/v1/ads/events", null, { ad: AD, slot: "inicio", kind: "clic" })).status).toBe(401)
    expect(t.fx.rows.rpcs).toEqual([])
  })
})

describe("AdSense público", () => {
  it("sin sesión: solo id de cliente, bloque y planes (nada de secretos) y el ads.txt", async () => {
    t.fx.rows.seed("platform_integrations", [{ kind: "adsense", modo: "opcional", planes: ["gratis"], config: { client: "ca-pub-1234567890", slot: "998877", otra: "x" }, secrets_enc: "v1:secreto" }])
    const r = await t.call("GET", "/v1/public/adsense", null)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ activo: true, client: "ca-pub-1234567890", slot: "998877", planes: ["gratis"], adsTxt: "google.com, pub-1234567890, DIRECT, f08c47fec0942fa0\n" })
    expect(r.raw).not.toContain("secreto")
    expect(t.fx.rows.scopesOf("platform_integrations")).toEqual(["system"])
    const txt = await t.call("GET", "/v1/public/ads.txt", null)
    expect(txt.headers["content-type"]).toMatch(/^text\/plain/)
    expect(txt.raw).toBe("google.com, pub-1234567890, DIRECT, f08c47fec0942fa0\n")
  })

  it("apagada o sin configurar: inactivo y ads.txt vacío", async () => {
    expect((await t.call("GET", "/v1/public/adsense", null)).body).toEqual({ activo: false, client: null, slot: null, planes: [], adsTxt: "" })
    t.fx.rows.seed("platform_integrations", [{ kind: "adsense", modo: "apagada", planes: [], config: { client: "ca-pub-1", slot: "2" } }])
    expect((await t.call("GET", "/v1/public/adsense", null)).body).toMatchObject({ activo: false, client: null })
    expect((await t.call("GET", "/v1/public/ads.txt", null)).raw).toBe("# Sin anuncios configurados\n")
  })
})

describe("consola › Anuncios (/v1/admin/ads)", () => {
  beforeEach(() => {
    t.fx.rows.seed("ad_campaigns", [camp]).seed("ads", [ad]).seed("ad_events", [{ ad_id: AD, dia: "2026-10-30", slot: "inicio", vistas: "10", clics: 2, cierres: 0 }, { ad_id: AD, dia: "2026-09-01", slot: "inicio", vistas: 5, clics: 0, cierres: 0 }])
    t.fx.rows.seed("platform_settings", [{ id: true, anuncios_adsense_pct: 30, anuncios_accion_cada: 3, anuncios_modal_horas: 24, anuncios_ticker: true }])
    t.fx.rows.rpcImpl.ad_reach = () => [{ ad_id: AD, alcance: "4", vistas: "10", clics: "2" }]
  })

  it("solo administradores de la plataforma", async () => {
    const r = await t.call("GET", "/v1/admin/ads?desde=2026-10-01&hasta=2026-10-31", "editor")
    expect(r.status).toBe(403)
    expect(r.body.msg).toBe("Solo el administrador de Mirai puede ver esto.")
    expect((await t.call("POST", "/v1/admin/ads/campaigns", "editor", { nombre: "Nueva" })).status).toBe(403)
  })

  it("lee campañas, anuncios, métricas del rango, alcance y ajustes (números normalizados)", async () => {
    const r = await t.call("GET", "/v1/admin/ads?desde=2026-10-01&hasta=2026-10-31", "owner")
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({
      campaigns: [{ id: CAMP, tarifa: 12.5, frecuencia_max: 3 }], ads: [{ id: AD }], events: [{ ad_id: AD, dia: "2026-10-30", vistas: 10, clics: 2 }],
      reach: [{ ad_id: AD, alcance: 4, vistas: 10, clics: 2 }], settings: { anuncios_adsense_pct: 30, anuncios_ticker: true },
    })
    expect(t.fx.rows.rpcs[0]).toMatchObject({ fn: "ad_reach", args: { p_desde: "2026-10-01", p_hasta: "2026-10-31" }, scope: { kind: "user" } })
    expect((await t.call("GET", "/v1/admin/ads?desde=2026-11-01&hasta=2026-10-01", "owner")).status).toBe(400)
  })

  it("campañas: crear (valores por defecto), editar, borrar y auditoría", async () => {
    const c = await t.call("POST", "/v1/admin/ads/campaigns", "owner", { nombre: "  Navidad  ", tarifa: 5000 })
    expect(c.status).toBe(200)
    const id = (c.body.data as { id: string }).id
    expect(t.fx.rows.all("ad_campaigns").find((x) => x.id === id)).toMatchObject({ nombre: "Navidad", estado: "borrador", objetivo: "trafico", dispositivos: ["movil", "escritorio"], frecuencia_max: 3 })
    expect((await t.call("PATCH", `/v1/admin/ads/campaigns/${id}`, "owner", { estado: "activa" })).status).toBe(200)
    expect((await t.call("PATCH", `/v1/admin/ads/campaigns/${NOPE}`, "owner", { estado: "pausada" })).body).toMatchObject({ code: "NOT_FOUND", msg: CAMPAIGN_NOT_FOUND })
    expect((await t.call("DELETE", `/v1/admin/ads/campaigns/${id}`, "owner")).status).toBe(200)
    expect(t.fx.rows.all("admin_audit").map((a) => [a.actor, a.accion, a.objetivo])).toEqual([[USERS.owner, "crear campaña", id], [USERS.owner, "editar campaña", id], [USERS.owner, "borrar campaña", id]])
    expect(new Set(t.fx.rows.scopesOf("admin_audit"))).toEqual(new Set(["system"]))
    expect(new Set(t.fx.rows.scopesOf("ad_campaigns"))).toEqual(new Set(["user"]))
  })

  it("campañas: validación en español", async () => {
    const r = await t.call("POST", "/v1/admin/ads/campaigns", "owner", { nombre: "N", dispositivos: [] })
    expect(r.status).toBe(400)
    expect(JSON.stringify(r.body)).toMatch(/al menos 2 letras|al menos un dispositivo/)
    expect(JSON.stringify((await t.call("POST", "/v1/admin/ads/campaigns", "owner", { nombre: "Navidad", desde: "2026-12-31", hasta: "2026-12-01" })).body)).toContain("La fecha final debe ser después de la inicial")
  })

  it("anuncios: crear, duplicar, pausar, borrar; campaña inexistente y enlace inválido", async () => {
    const base = { titulo: "Crédito fácil", url: "https://x.co", ubicaciones: ["lista", "modal"], campaign_id: CAMP }
    const a = await t.call("POST", "/v1/admin/ads/items", "owner", base)
    const id = (a.body.data as { id: string }).id
    expect(t.fx.rows.all("ads").find((x) => x.id === id)).toMatchObject({ cta: "Conocer más", formato: "imagen", activo: true, imagen: null, media: {} })
    expect((await t.call("POST", "/v1/admin/ads/items", "owner", { ...base, campaign_id: NOPE })).body).toMatchObject({ code: "VALIDATION", msg: CAMPAIGN_NOT_FOUND })
    expect(JSON.stringify((await t.call("POST", "/v1/admin/ads/items", "owner", { ...base, url: "http://x.co" })).body)).toContain("El enlace debe empezar por https:// o por /")
    const d = await t.call("POST", `/v1/admin/ads/items/${AD}/duplicate`, "owner")
    const copy = t.fx.rows.all("ads").find((x) => x.id === (d.body.data as { id: string }).id)
    expect(copy).toMatchObject({ titulo: "Cuenta de ahorros (copia)", campaign_id: CAMP, url: "https://banco.co" })
    expect((await t.call("PATCH", `/v1/admin/ads/items/${AD}`, "owner", { activo: false })).status).toBe(200)
    expect(t.fx.rows.all("ads").find((x) => x.id === AD)).toMatchObject({ activo: false })
    expect((await t.call("PATCH", `/v1/admin/ads/items/${AD}`, "owner", {})).status).toBe(400)
    expect((await t.call("DELETE", `/v1/admin/ads/items/${NOPE}`, "owner")).body).toMatchObject({ code: "NOT_FOUND", msg: AD_NOT_FOUND })
    expect((await t.call("DELETE", `/v1/admin/ads/items/${AD}`, "owner")).status).toBe(200)
    expect(t.fx.rows.all("admin_audit").map((x) => x.accion)).toEqual(["crear anuncio", "duplicar anuncio", "editar anuncio", "borrar anuncio"])
  })

  it("ajustes de anuncios", async () => {
    expect((await t.call("PATCH", "/v1/admin/ads/settings", "owner", { anuncios_adsense_pct: 50, anuncios_ticker: false })).status).toBe(200)
    expect(t.fx.rows.all("platform_settings")[0]).toMatchObject({ anuncios_adsense_pct: 50, anuncios_ticker: false })
    expect((await t.call("PATCH", "/v1/admin/ads/settings", "owner", { anuncios_adsense_pct: 150 })).status).toBe(400)
  })
})
