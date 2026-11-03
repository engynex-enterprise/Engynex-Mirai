import { Module } from "@nestjs/common"
import { RowStoreModule } from "../../core/store/row-store.module"
import { IntegrationsModule } from "../integrations/integrations.module"
import { AccountantMailer, ServicesAccountantMailer } from "./accountant-mailer"
import { AccountantOwnerController } from "./accountant-owner.controller"
import { AccountantOwnerService } from "./accountant-owner.service"
import { HouseholdsModule } from "../households/households.module"
import { AccountantTokenGuard } from "./accountant-token.guard"
import { AccountantController } from "./accountant.controller"
import { AccountantRepo } from "./accountant.repository"
import { AccountantService } from "./accountant.service"
import { SupabaseJsAccountantRepo } from "./adapters/supabase-js.accountant.repo"

// Módulo `tax` (docs/arquitectura/v6-separacion-front-back.md §2.6): renta, calendario fiscal y contador.
// Dueño: F2-D (portal del contador: F2-I). F2-D agrega aquí el CRUD del titular, renta/:año y los accesos; contrato en
// packages/contracts/src/modules/tax.ts. Ejemplo completo: modules/catalogs.
// F2-I-4: portal del contador por token (AccountantController + AccountantTokenGuard, SystemScope + límite).
// V7-G: lado del titular (AccountantOwnerController: accesos, notas y documentos visibles con UserScope; correo por
// AccountantMailer con @mirai/services).
@Module({
  imports: [HouseholdsModule, RowStoreModule, IntegrationsModule],
  controllers: [AccountantController, AccountantOwnerController],
  providers: [AccountantService, AccountantTokenGuard, AccountantOwnerService, { provide: AccountantMailer, useClass: ServicesAccountantMailer }, { provide: AccountantRepo, useClass: SupabaseJsAccountantRepo }],
})
export class TaxModule {}
