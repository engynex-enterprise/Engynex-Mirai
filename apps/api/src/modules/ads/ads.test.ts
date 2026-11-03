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
})
