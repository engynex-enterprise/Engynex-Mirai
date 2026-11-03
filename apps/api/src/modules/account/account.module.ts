import { Module, type Provider } from "@nestjs/common"
import { SupabaseJsFactory } from "../../core/db/supabase-js.factory"
import { MiraiAuthService } from "../auth/mirai-auth.service"
import { RowStoreModule } from "../../core/store/row-store.module"
import { HouseholdsModule } from "../households/households.module"
import { ImportModule } from "../import/import.module"
import { BetterAuthIdentityAdmin } from "../auth/better-auth.identity-admin"
import { BetterAuthAccountRepo } from "./adapters/better-auth.account.repo"
import { SupabaseJsAccountRepo } from "./adapters/supabase-js.account.repo"
import { AccountController } from "./account.controller"
import { AccountRepo } from "./account.repository"
import { AccountService } from "./account.service"
import { AccountExportService } from "./export.service"
import { IdentityAdmin, SupabaseIdentityAdmin } from "./identity-admin"

// Módulo `account` (§2.6). Dueño: F2-I. Cuentas conectadas, cambio de correo, sesiones, actividad y borrar la cuenta,
// sobre el puerto IdentityAdmin (Supabase Auth hoy; Identity Platform en la fase 4). Exporta IdentityAdmin (consola).
// V7-G: GET /v1/account/export (AccountExportService con BookDumpService de ImportModule y RowStore).
// V7-A: con AUTH_PROVIDER=mirai la identidad es Better Auth (AuthModule, global); si no, Supabase como siempre.
const identityProviders: Provider[] = [
  SupabaseIdentityAdmin,
  {
    provide: AccountRepo,
    inject: [SupabaseJsFactory, MiraiAuthService],
    useFactory: (sb: SupabaseJsFactory, auth: MiraiAuthService) => (auth.enabled ? new BetterAuthAccountRepo(sb, auth) : new SupabaseJsAccountRepo(sb)),
  },
  {
    provide: IdentityAdmin,
    inject: [MiraiAuthService, BetterAuthIdentityAdmin, SupabaseIdentityAdmin],
    useFactory: (auth: MiraiAuthService, ba: BetterAuthIdentityAdmin, sb: SupabaseIdentityAdmin) => (auth.enabled ? ba : sb),
  },
]

@Module({
  imports: [HouseholdsModule, ImportModule, RowStoreModule],
  controllers: [AccountController],
  providers: [AccountService, AccountExportService, ...identityProviders],
  exports: [IdentityAdmin],
})
export class AccountModule {}
