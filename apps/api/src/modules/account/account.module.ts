import { Module } from "@nestjs/common"
import { HouseholdsModule } from "../households/households.module"
import { SupabaseJsAccountRepo } from "./adapters/supabase-js.account.repo"
import { AccountController } from "./account.controller"
import { AccountRepo } from "./account.repository"
import { AccountService } from "./account.service"
import { IdentityAdmin, SupabaseIdentityAdmin } from "./identity-admin"

// Módulo `account` (§2.6). Dueño: F2-I. Cuentas conectadas, cambio de correo, sesiones, actividad y borrar la cuenta,
// sobre el puerto IdentityAdmin (Supabase Auth hoy; Identity Platform en la fase 4). Exporta IdentityAdmin (consola).
@Module({
  imports: [HouseholdsModule],
  controllers: [AccountController],
  providers: [AccountService, { provide: AccountRepo, useClass: SupabaseJsAccountRepo }, { provide: IdentityAdmin, useClass: SupabaseIdentityAdmin }],
  exports: [IdentityAdmin],
})
export class AccountModule {}
