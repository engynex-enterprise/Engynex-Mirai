import { Module } from "@nestjs/common"
import { repoProvider } from "../../core/db/adapter"
import { PgKyselyCatalogsRepo } from "./adapters/pg-kysely.catalogs.repo"
import { SupabaseJsCatalogsRepo } from "./adapters/supabase-js.catalogs.repo"
import { CatalogsController } from "./catalogs.controller"
import { CatalogsRepo } from "./catalogs.repository"
import { CatalogsService } from "./catalogs.service"
import { BookTablesModule } from "../book-tables/book-tables.module"
import { RegistrosService } from "./registros.service"

// Módulo `catalogs` (§2.6). Dueño: F2-D. F2-B dejó la lectura de categorías como ejemplo de punta a punta:
// contrato ts-rest → controller → service → repository (puerto) → adaptador (supabase-js hoy, Kysely para Cloud SQL).
// F2-D: RegistrosService (contacto, entidad o proveedor sin duplicar); el CRUD de cada catálogo va por book-tables.
@Module({
  imports: [BookTablesModule],
  controllers: [CatalogsController],
  providers: [CatalogsService, RegistrosService, repoProvider(CatalogsRepo, { supabase: SupabaseJsCatalogsRepo, pg: PgKyselyCatalogsRepo })],
  exports: [CatalogsService, RegistrosService],
})
export class CatalogsModule {}
