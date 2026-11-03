// Adaptador de hoy (PostgREST con el JWT de la persona), como useAdsData de la web.
import { Injectable } from "@nestjs/common"
import type { Ad } from "@mirai/contracts/modules/ads"
import type { CampaignLike } from "@mirai/domain/ads"
import type { DbScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { DomainError } from "../../../core/errors/domain-error"
import { AdsRepo, type AdsData, type AdsSettings } from "../ads.repository"

@Injectable()
export class SupabaseJsAdsRepo extends AdsRepo {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  async load(scope: DbScope, { userId, hoy }: { userId: string; hoy: string }): Promise<AdsData> {
    const sb = this.sb.for(scope)
    const [ads, camps, mine, cfg] = await Promise.all([
      sb.from("ads").select("id,titulo,texto,imagen,url,cta,anunciante,ubicaciones,activo,desde,hasta,prioridad,campaign_id,formato,media"),
      sb.from("ad_campaigns").select("id,estado,desde,hasta,planes,dispositivos,frecuencia_max,prioridad").eq("estado", "activa"),
      sb.from("ad_user_daily").select("ad_id,vistas").eq("user_id", userId).eq("dia", hoy),
      sb.from("platform_settings").select("anuncios_adsense_pct,anuncios_accion_cada,anuncios_modal_horas,anuncios_ticker").maybeSingle(),
    ])
    for (const r of [ads, camps, mine, cfg]) if (r.error) throw DomainError.fromPg(r.error)
    return {
      ads: (ads.data ?? []) as unknown as Ad[],
      campaigns: (camps.data ?? []) as CampaignLike[],
      vistas: Object.fromEntries((mine.data ?? []).map((r) => [r.ad_id, r.vistas])),
      settings: (cfg.data as AdsSettings | null) ?? null,
    }
  }
}
