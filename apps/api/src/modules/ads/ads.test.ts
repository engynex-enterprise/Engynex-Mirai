// ads: el adaptador hace las consultas de useAdsData y el servicio elige como usePick (plan del libro, dispositivo).
import { describe, expect, it } from "vitest"
import { captureKysely, fakeSupabase, USER_SCOPE } from "../../../test/setup/db-doubles"
import type { RequestContextService } from "../../core/context/request-context.service"
import { PgKyselyAdsRepo } from "./adapters/pg-kysely.ads.repo"
import { SupabaseJsAdsRepo } from "./adapters/supabase-js.ads.repo"
import { AdsRepo, type AdsData } from "./ads.repository"
import { AdsService } from "./ads.service"

describe("SupabaseJsAdsRepo", () => {
  it("anuncios, campañas activas, mis vistas de hoy y los ajustes", async () => {
    const { sb, chains } = fakeSupabase((t) => (t === "ad_user_daily" ? { data: [{ ad_id: "a", vistas: 3 }], error: null } : t === "platform_settings" ? { data: null, error: null } : { data: [], error: null }))
    const d = await new SupabaseJsAdsRepo(sb).load(USER_SCOPE, { userId: "u-1", hoy: "2026-11-02" })
    expect(d).toEqual({ ads: [], campaigns: [], vistas: { a: 3 }, settings: null })
    expect(chains.map((c) => c.table)).toEqual(["ads", "ad_campaigns", "ad_user_daily", "platform_settings"])
    expect(chains[1].calls.at(-1)).toEqual(["eq", "estado", "activa"])
    expect(chains[2].calls.slice(1)).toEqual([["eq", "user_id", "u-1"], ["eq", "dia", "2026-11-02"]])
  })
  it("Kysely: mismas tablas y filtros", async () => {
    const { factory, queries } = captureKysely()
    await new PgKyselyAdsRepo(factory).load(USER_SCOPE, { userId: "u-1", hoy: "2026-11-02" })
    expect(queries().find((q) => q.sql.includes('"ad_user_daily"'))?.params).toEqual(["u-1", "2026-11-02"])
  })
})

describe("AdsService", () => {
  it("sin anuncios elegibles: ad null, y el turno de AdSense con el porcentaje de los ajustes", async () => {
    const data: AdsData = { ads: [], campaigns: [], vistas: {}, settings: { anuncios_adsense_pct: 100, anuncios_accion_cada: 3, anuncios_modal_horas: 24, anuncios_ticker: true } }
    const repo = new (class extends AdsRepo { load = async () => data })()
    const ctx = { db: USER_SCOPE, user: { id: "u-1" }, book: { plan: { id: "gratis", ads: true } } } as unknown as RequestContextService
    expect(await new AdsService(repo, ctx).eligible({ slot: "lista", hoy: "2026-11-02" })).toEqual({ planAds: true, ad: null, candidatos: 0, adsenseTurno: true, settings: data.settings })
  })

  it("cinta (ticker): además del elegido, la lista por prioridad (hasta 5); los demás espacios no la traen", async () => {
    const mk = (n: number, prioridad: number, ubicaciones = ["ticker"]) => ({ id: `ad-${n}`, titulo: `T${n}`, texto: "", imagen: null, url: "/planes", cta: "Ver", anunciante: "", ubicaciones, activo: true, desde: null, hasta: null, prioridad, campaign_id: null, formato: "texto", media: {} })
    const data: AdsData = { ads: [mk(1, 1), mk(2, 9), mk(3, 5), mk(4, 0), mk(5, 7), mk(6, 3), mk(7, 99, ["inicio"])], campaigns: [], vistas: {}, settings: null }
    const repo = new (class extends AdsRepo { load = async () => data })()
    const ctx = { db: USER_SCOPE, user: { id: "u-1" }, book: { plan: { id: "gratis", ads: true } } } as unknown as RequestContextService
    const svc = new AdsService(repo, ctx)
    const t = await svc.eligible({ slot: "ticker", hoy: "2026-11-02" })
    expect(t.candidatos).toBe(6)
    expect(t.lista?.map((a) => a.id)).toEqual(["ad-2", "ad-5", "ad-3", "ad-6", "ad-1"])
    expect(t.ad).not.toBeNull()
    expect("lista" in (await svc.eligible({ slot: "inicio", hoy: "2026-11-02" }))).toBe(false)
  })
})
