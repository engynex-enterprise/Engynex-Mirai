// Puerto de anuncios (lectura). Mismas consultas que useAdsData (apps/web/features/ads/ad-slot.tsx).
import type { Ad } from "@mirai/contracts/modules/ads"
import type { CampaignLike } from "@mirai/domain/ads"
import type { DbScope } from "../../core/db/scope"

export type AdsSettings = { anuncios_adsense_pct: number; anuncios_accion_cada: number; anuncios_modal_horas: number; anuncios_ticker: boolean }
export type AdsData = { ads: Ad[]; campaigns: CampaignLike[]; vistas: Record<string, number>; settings: AdsSettings | null }

export abstract class AdsRepo {
  abstract load(scope: DbScope, q: { userId: string; hoy: string }): Promise<AdsData>
}
