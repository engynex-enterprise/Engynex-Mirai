import { Module } from "@nestjs/common"
import { repoProvider } from "../../core/db/adapter"
import { PgKyselyAdsRepo } from "./adapters/pg-kysely.ads.repo"
import { SupabaseJsAdsRepo } from "./adapters/supabase-js.ads.repo"
import { AdsController } from "./ads.controller"
import { AdsRepo } from "./ads.repository"
import { AdsService } from "./ads.service"

// Módulo `ads` (docs/arquitectura/v6-separacion-front-back.md §2.6): anuncios elegibles y eventos.
// Dueño: F2-C. Hecho: lectura (GET /v1/books/:bookId/ads/eligible). Pendiente: POST /v1/ads/events (ad_track) y
// GET /v1/public/adsense.
@Module({
  controllers: [AdsController],
  providers: [AdsService, repoProvider(AdsRepo, { supabase: SupabaseJsAdsRepo, pg: PgKyselyAdsRepo })],
  exports: [AdsService],
})
export class AdsModule {}
