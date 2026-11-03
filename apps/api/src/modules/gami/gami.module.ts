import { Module } from "@nestjs/common"
import { repoProvider } from "../../core/db/adapter"
import { RowStoreModule } from "../../core/store/row-store.module"
import { BookTablesModule } from "../book-tables/book-tables.module"
import { PgKyselyGamiRepo } from "./adapters/pg-kysely.gami.repo"
import { SupabaseJsGamiRepo } from "./adapters/supabase-js.gami.repo"
import { GamiController } from "./gami.controller"
import { GamiRepo } from "./gami.repository"
import { GamiService } from "./gami.service"

// Módulo `gami` (docs/arquitectura/v6-separacion-front-back.md §2.6): logros, academia y referidos.
// Dueño: F2-C. Hecho: lectura de logros (GET /v1/books/:bookId/gami) y referidos (GET /v1/me/referrals).
// V7-G: escrituras (visita del día, POST …/gami/check y …/gami/logros) con RowStore. Pendiente: preferencias de la academia
// (user_preferences.extra.academia, van con /v1/me/preferences).
@Module({
  imports: [BookTablesModule, RowStoreModule],
  controllers: [GamiController],
  providers: [GamiService, repoProvider(GamiRepo, { supabase: SupabaseJsGamiRepo, pg: PgKyselyGamiRepo })],
  exports: [GamiService],
})
export class GamiModule {}
