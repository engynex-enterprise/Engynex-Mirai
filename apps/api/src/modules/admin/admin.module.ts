import { Module } from "@nestjs/common"
import { AccountModule } from "../account/account.module"
import { BillingModule } from "../billing/billing.module"
import { HouseholdsModule } from "../households/households.module"
import { SupabaseJsAdminRepo } from "./adapters/supabase-js.admin.repo"
import { AdminController } from "./admin.controller"
import { AdminRepo } from "./admin.repository"
import { AdminService } from "./admin.service"
import { NoPlatformMailer, PlatformMailer } from "./platform-mailer"

// Módulo `admin console` (§2.6). Dueño: F2-I. Consola de la plataforma con @PlatformAdmin, admin_audit en cada
// comando y sin montos de los hogares. PlatformMailer: adaptador real con F2-E-2 (@mirai/services/notify).
// Pendientes (de otros frentes): integraciones globales (F2-E-1), uso de IA (F2-F-1) y WhatsApp (F2-E-2).
@Module({
  imports: [AccountModule, BillingModule, HouseholdsModule],
  controllers: [AdminController],
  providers: [AdminService, { provide: AdminRepo, useClass: SupabaseJsAdminRepo }, { provide: PlatformMailer, useClass: NoPlatformMailer }],
})
export class AdminModule {}
