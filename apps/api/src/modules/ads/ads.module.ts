import { Module } from "@nestjs/common"
import { repoProvider } from "../../core/db/adapter"
import { RowStoreModule } from "../../core/store/row-store.module"
import { AdsAdminController, AdsEventsController } from "./ads-write.controller"
import { AdsWriteService } from "./ads-write.service"
import { PgKyselyAdsRepo } from "./adapters/pg-kysely.ads.repo"
import { SupabaseJsAdsRepo } from "./adapters/supabase-js.ads.repo"
import { AdsController } from "./ads.controller"
import { AdsRepo } from "./ads.repository"
import { AdsService } from "./ads.service"

// Módulo `ads` (docs/arquitectura/v6-separacion-front-back.md §2.6): anuncios elegibles y eventos.
// Dueño: F2-C. Lectura (GET /v1/books/:bookId/ads/eligible). V7-G: POST /v1/ads/events (ad_track), AdSense público
// (GET /v1/public/adsense y /v1/public/ads.txt) y la consola › Anuncios (/v1/admin/ads/**) sobre RowStore.
@Module({
  imports: [RowStoreModule],
  controllers: [AdsController, AdsEventsController, AdsAdminController],
  providers: [AdsService, AdsWriteService, repoProvider(AdsRepo, { supabase: SupabaseJsAdsRepo, pg: PgKyselyAdsRepo })],
  exports: [AdsService],
})
export class AdsModule {}
