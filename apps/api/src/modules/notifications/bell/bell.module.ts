import { Module } from "@nestjs/common"
import { repoProvider } from "../../../core/db/adapter"
import { PgKyselyBellRepo } from "./adapters/pg-kysely.bell.repo"
import { SupabaseJsBellRepo } from "./adapters/supabase-js.bell.repo"
import { BellController } from "./bell.controller"
import { BellRepo } from "./bell.repository"
import { BellService } from "./bell.service"

// Campana de avisos in-app (parte F2-C del módulo `notifications`; el resto es de F2-E). Submódulo aparte para que
// F2-E llene notifications.module.ts sin pisarse: NotificationsModule solo lo importa.
@Module({
  controllers: [BellController],
  providers: [BellService, repoProvider(BellRepo, { supabase: SupabaseJsBellRepo, pg: PgKyselyBellRepo })],
  exports: [BellService],
})
export class BellModule {}
