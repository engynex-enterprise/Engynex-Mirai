// V7-G: eventos de anuncios, AdSense público y consola › Anuncios. Mismas consultas que useTrack / useAdsense de
// apps/web/features/ads/ad-slot.tsx, app/ads.txt/route.ts y features/admin/admin-ads.tsx, sobre RowStore.
// - Eventos: RPC ad_track con la sesión de la persona (la función suma al anuncio y a sus vistas del día).
// - AdSense: lectura del sistema (sin sesión) de la integración global `adsense`; solo sale `client` y `slot`.
// - Consola: con la sesión del administrador (la RLS «admin anuncios/campañas» vuelve a exigirlo) y cada cambio en
//   admin_audit (SystemScope con motivo), como AdminService.
import { Injectable } from "@nestjs/common"
import type { AdsensePublic, AdsManager } from "@mirai/contracts/modules/ads"
import { adsTxt } from "@mirai/domain/ads"
import { RequestContextService } from "../../core/context/request-context.service"
import { systemScope } from "../../core/db/scope"
import { DomainError } from "../../core/errors/domain-error"
import { RowStore, type Rec } from "../../core/store/row-store"
import { num } from "../book-tables/http"

export const AD_NOT_FOUND = "No encontramos ese anuncio."
export const CAMPAIGN_NOT_FOUND = "No encontramos esa campaña."
const AUDIT = systemScope("consola de la plataforma: auditoría de anuncios")
const AD_COLS = ["id", "titulo", "texto", "imagen", "url", "cta", "anunciante", "ubicaciones", "activo", "desde", "hasta", "prioridad", "campaign_id", "formato", "media", "created_at", "updated_at"] as const
const SETTINGS = ["anuncios_adsense_pct", "anuncios_accion_cada", "anuncios_modal_horas", "anuncios_ticker"] as const

@Injectable()
export class AdsWriteService {
  constructor(
    private readonly rows: RowStore,
    private readonly ctx: RequestContextService,
  ) {}

  async track(e: { ad: string; slot: string; kind: string }): Promise<Record<string, never>> {
    await this.rows.rpc(this.ctx.db, "ad_track", { p_ad: e.ad, p_slot: e.slot, p_kind: e.kind })
    return {}
  }

  async adsense(): Promise<AdsensePublic> {
    const row = await this.rows.first<{ modo: string; planes: string[] | null; config: { client?: unknown; slot?: unknown } | null }>(systemScope("anuncios: AdSense público (id de cliente y bloque)"), "platform_integrations", {
      columns: ["modo", "planes", "config"], eq: { kind: "adsense" },
    })
    const on = !!row && row.modo !== "apagada"
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
    const client = on ? str(row?.config?.client) : null
    const slot = on ? str(row?.config?.slot) : null
    return { activo: !!(client && slot), client, slot, planes: row?.planes ?? [], adsTxt: adsTxt(client) }
  }

  // ── Consola › Anuncios ──

  private audit(accion: string, objetivo: string | null, detalle: Rec = {}) {
    return this.rows.insert(AUDIT, "admin_audit", [{ actor: this.ctx.user.id, accion, objetivo, detalle }])
  }

  async manager(desde: string, hasta: string): Promise<AdsManager> {
    const db = this.ctx.db
    const [campaigns, ads, events, reach, settings] = await Promise.all([
      this.rows.select<Rec>(db, "ad_campaigns", { order: [{ column: "created_at", ascending: false }] }),
      this.rows.select<Rec>(db, "ads", { columns: AD_COLS, order: [{ column: "created_at", ascending: false }] }),
      this.rows.select<Rec>(db, "ad_events", { columns: ["ad_id", "dia", "slot", "vistas", "clics", "cierres"], gte: { dia: desde }, lte: { dia: hasta } }),
      this.rows.rpc(db, "ad_reach", { p_desde: desde, p_hasta: hasta }),
      this.rows.first<Rec>(db, "platform_settings", { columns: SETTINGS }),
    ])
    const list = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []) as Rec[]
    return {
      campaigns: campaigns.map((c) => ({ ...c, tarifa: num(c.tarifa), presupuesto: c.presupuesto == null ? null : num(c.presupuesto), frecuencia_max: num(c.frecuencia_max), prioridad: num(c.prioridad) })) as AdsManager["campaigns"],
      ads: ads as AdsManager["ads"],
      events: events.map((e) => ({ ...e, vistas: num(e.vistas), clics: num(e.clics), cierres: num(e.cierres) })) as AdsManager["events"],
      reach: list(reach).map((r) => ({ ad_id: String(r.ad_id), alcance: num(r.alcance), vistas: num(r.vistas), clics: num(r.clics) })),
      settings: settings ? { anuncios_adsense_pct: num(settings.anuncios_adsense_pct), anuncios_accion_cada: num(settings.anuncios_accion_cada), anuncios_modal_horas: num(settings.anuncios_modal_horas), anuncios_ticker: !!settings.anuncios_ticker } : null,
    }
  }

  async createCampaign(v: Rec): Promise<{ id: string }> {
    const [row] = await this.rows.insert<{ id: string }>(this.ctx.db, "ad_campaigns", [v])
    await this.audit("crear campaña", row.id, { nombre: v.nombre })
    return { id: row.id }
  }

  async updateCampaign(id: string, patch: Rec): Promise<{ id: string }> {
    const [row] = await this.rows.update<{ id: string; desde: string | null; hasta: string | null }>(this.ctx.db, "ad_campaigns", { eq: { id } }, patch)
    if (!row) throw DomainError.notFound(CAMPAIGN_NOT_FOUND)
    await this.audit("editar campaña", id, { campos: Object.keys(patch) })
    return { id }
  }

  async deleteCampaign(id: string): Promise<{ id: string }> {
    if (!(await this.rows.delete(this.ctx.db, "ad_campaigns", { eq: { id } }))) throw DomainError.notFound(CAMPAIGN_NOT_FOUND)
    await this.audit("borrar campaña", id)
    return { id }
  }

  private async campaignExists(id: string | null | undefined) {
    if (id && !(await this.rows.first(this.ctx.db, "ad_campaigns", { columns: ["id"], eq: { id } }))) throw DomainError.validation(CAMPAIGN_NOT_FOUND, { field: "campaign_id" })
  }

  async createAd(v: Rec): Promise<{ id: string }> {
    await this.campaignExists(v.campaign_id as string | null)
    const [row] = await this.rows.insert<{ id: string }>(this.ctx.db, "ads", [{ ...v, campaign_id: v.campaign_id ?? null, imagen: v.imagen ?? null }])
    await this.audit("crear anuncio", row.id, { titulo: v.titulo })
    return { id: row.id }
  }

  async updateAd(id: string, patch: Rec): Promise<{ id: string }> {
    if ("campaign_id" in patch) await this.campaignExists(patch.campaign_id as string | null)
    const [row] = await this.rows.update<{ id: string }>(this.ctx.db, "ads", { eq: { id } }, patch)
    if (!row) throw DomainError.notFound(AD_NOT_FOUND)
    await this.audit("editar anuncio", id, { campos: Object.keys(patch) })
    return { id }
  }

  async duplicateAd(id: string): Promise<{ id: string }> {
    const ad = await this.rows.first<Rec>(this.ctx.db, "ads", { columns: AD_COLS, eq: { id } })
    if (!ad) throw DomainError.notFound(AD_NOT_FOUND)
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = ad
    void _id
    void _c
    void _u
    const [row] = await this.rows.insert<{ id: string }>(this.ctx.db, "ads", [{ ...rest, titulo: `${String(ad.titulo).slice(0, 72)} (copia)` }])
    await this.audit("duplicar anuncio", row.id, { de: id })
    return { id: row.id }
  }

  async deleteAd(id: string): Promise<{ id: string }> {
    if (!(await this.rows.delete(this.ctx.db, "ads", { eq: { id } }))) throw DomainError.notFound(AD_NOT_FOUND)
    await this.audit("borrar anuncio", id)
    return { id }
  }

  async saveSettings(p: Rec): Promise<Record<string, never>> {
    await this.rows.update(this.ctx.db, "platform_settings", { eq: { id: true } }, p)
    await this.audit("ajustes de anuncios", null, p)
    return {}
  }
}
