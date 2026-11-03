import { Module } from "@nestjs/common"
import { AccountModule } from "../account/account.module"
import { BillingModule } from "../billing/billing.module"
import { HouseholdsModule } from "../households/households.module"
import { RowStoreModule } from "../../core/store/row-store.module"
import { IntegrationsModule } from "../integrations/integrations.module"
import { ServicesPlatformIntegrations } from "./adapters/services.platform-integrations"
import { AdminPlatformController } from "./admin-platform.controller"
import { AdminPlatformService } from "./admin-platform.service"
import { PlatformIntegrationsPort } from "./platform-integrations.port"
import { SupabaseJsAdminRepo } from "./adapters/supabase-js.admin.repo"
import { AdminController } from "./admin.controller"
import { AdminRepo } from "./admin.repository"
import { AdminService } from "./admin.service"
import { NoPlatformMailer, PlatformMailer } from "./platform-mailer"

// Módulo `admin console` (§2.6). Dueño: F2-I. Consola de la plataforma con @PlatformAdmin, admin_audit en cada
// comando y sin montos de los hogares. PlatformMailer: adaptador real con F2-E-2 (@mirai/services/notify).
// V7-G: planes, cupones, integraciones globales y WhatsApp (AdminPlatformController; RowStore + PlatformIntegrationsPort,
// cuyo adaptador usa @mirai/services y @mirai/ai con el runtime de IntegrationsModule).
@Module({
  imports: [AccountModule, BillingModule, HouseholdsModule, RowStoreModule, IntegrationsModule],
  controllers: [AdminController, AdminPlatformController],
  providers: [AdminService, AdminPlatformService, { provide: PlatformIntegrationsPort, useClass: ServicesPlatformIntegrations }, { provide: AdminRepo, useClass: SupabaseJsAdminRepo }, { provide: PlatformMailer, useClass: NoPlatformMailer }],
})
export class AdminModule {}
