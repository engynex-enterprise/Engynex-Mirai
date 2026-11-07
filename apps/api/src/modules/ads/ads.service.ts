// Anuncio de un espacio (usePick + AdSlot de la web): segmentación de la campaña (plan del hogar del libro, dispositivo
// y frecuencia diaria), prioridad y el sorteo estable por persona y día de @mirai/domain/ads. No conoce Supabase.
import { Injectable } from "@nestjs/common"
import type { Eligible } from "@mirai/contracts/modules/ads"
import { adSeed, eligibleAds, goesToAdsense, pickAd, type AdSlotId } from "@mirai/domain/ads"
import { todayBogota } from "@mirai/domain/dates"
import { RequestContextService } from "../../core/context/request-context.service"
import { AdsRepo } from "./ads.repository"

export type EligibleQ = { slot: AdSlotId; device?: "movil" | "escritorio"; salt?: string; hoy?: string }

@Injectable()
export class AdsService {
  constructor(
    private readonly repo: AdsRepo,
    private readonly ctx: RequestContextService,
  ) {}

  async eligible(q: EligibleQ): Promise<Eligible> {
    const hoy = q.hoy ?? todayBogota()
    const userId = this.ctx.user.id
    const { plan } = this.ctx.book
    const d = await this.repo.load(this.ctx.db, { userId, hoy })
    const ok = eligibleAds(d.ads, d.campaigns, { slot: q.slot, hoy, plan: plan.id, device: q.device ?? "escritorio", vistasHoy: d.vistas })
    const ad = pickAd(ok, q.slot, hoy, adSeed(userId + q.slot + (q.salt ?? ""), hoy))
    return {
      planAds: plan.ads,
      ad,
      candidatos: ok.length,
      adsenseTurno: goesToAdsense(adSeed(userId + q.slot, hoy), d.settings?.anuncios_adsense_pct ?? 30),
      settings: d.settings,
      // V7-H3: la cinta (AdTicker) muestra varios: los elegibles por prioridad, hasta 5.
      ...(q.slot === "ticker" ? { lista: [...ok].sort((a, b) => b.prioridad - a.prioridad).slice(0, 5) } : {}),
    }
  }
}
