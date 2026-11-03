import { Module } from "@nestjs/common"
import { repoProvider } from "../../core/db/adapter"
import { BookTablesModule } from "../book-tables/book-tables.module"
import { PgKyselyInsightsRepo } from "./adapters/pg-kysely.insights.repo"
import { SupabaseJsInsightsRepo } from "./adapters/supabase-js.insights.repo"
import { InsightsController } from "./insights.controller"
import { InsightsRepo } from "./insights.repository"
import { InsightsService } from "./insights.service"
import { PgKyselyRefsRepo } from "./refs/adapters/pg-kysely.refs.repo"
import { SupabaseJsRefsRepo } from "./refs/adapters/supabase-js.refs.repo"
import { RefsController } from "./refs/refs.controller"
import { RefsRepo } from "./refs/refs.repository"
import { RefsService } from "./refs/refs.service"

// Módulo `insights` (docs/arquitectura/v6-separacion-front-back.md §2.6): vistas calculadas y reportes (solo lectura).
// Dueño: F2-C. Vistas con @mirai/domain sobre el libro de book-tables (F2-C-4) y, en refs/, los datos de referencia
// GET /v1/refs/* (F2-C-2; no hay módulo `refs` en §2.6, así que viven aquí sin tocar modules/index.ts).
@Module({
  imports: [BookTablesModule],
  controllers: [InsightsController, RefsController],
  providers: [
    InsightsService,
    RefsService,
    repoProvider(InsightsRepo, { supabase: SupabaseJsInsightsRepo, pg: PgKyselyInsightsRepo }),
    repoProvider(RefsRepo, { supabase: SupabaseJsRefsRepo, pg: PgKyselyRefsRepo }),
  ],
  exports: [InsightsService],
})
export class InsightsModule {}
