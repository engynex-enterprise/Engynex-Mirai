import { Module } from "@nestjs/common"
import { repoProvider } from "../../core/db/adapter"
import { BookTablesModule } from "../book-tables/book-tables.module"
import { PgKyselyGamiRepo } from "./adapters/pg-kysely.gami.repo"
import { SupabaseJsGamiRepo } from "./adapters/supabase-js.gami.repo"
import { GamiController } from "./gami.controller"
import { GamiRepo } from "./gami.repository"
import { GamiService } from "./gami.service"

// Módulo `gami` (docs/arquitectura/v6-separacion-front-back.md §2.6): logros, academia y referidos.
// Dueño: F2-C. Hecho: lectura de logros (GET /v1/books/:bookId/gami) y referidos (GET /v1/me/referrals).
// Pendiente: escrituras (visita del día, POST …/gami/check, preferencias de la academia).
@Module({
  imports: [BookTablesModule],
  controllers: [GamiController],
  providers: [GamiService, repoProvider(GamiRepo, { supabase: SupabaseJsGamiRepo, pg: PgKyselyGamiRepo })],
  exports: [GamiService],
})
export class GamiModule {}
