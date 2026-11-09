import { Module } from "@nestjs/common"
import { BillingModule } from "../billing/billing.module"
import { SupabaseJsHouseholdsRepo } from "./adapters/supabase-js.households.repo"
import { HouseholdAccess } from "./household-access"
import { HouseholdsController, InvitationsController } from "./households.controller"
import { HouseholdsRepo } from "./households.repository"
import { HouseholdsService } from "./households.service"
import { Limiter, RequestMeta } from "./limiter"
import { HouseholdMessenger, StoragePurge, SupabaseStoragePurge } from "./ports"
import { ServicesHouseholdMessenger } from "./adapters/services.messenger"
import { byObjectStore } from "../../core/files/by-driver"
import { RowStoreModule } from "../../core/store/row-store.module"
import { ObjectStorePurge } from "./object-store.purge"
import { SiteUrl } from "./site-url"

// Módulo `households` (§2.6). Dueño: F2-I. Hogar, personas, roles, invitaciones, familia, pasar el hogar, salir y
// borrar, y la bienvenida (con referidos). Exporta las piezas que usan account y admin (acceso al hogar, límites,
// mensajería y borrado de archivos). HouseholdMessenger: ServicesHouseholdMessenger (correo y WhatsApp de Mirai).
@Module({
  imports: [BillingModule, RowStoreModule],
  controllers: [HouseholdsController, InvitationsController],
  providers: [
    HouseholdsService,
    HouseholdAccess,
    Limiter,
    RequestMeta,
    SiteUrl,
    { provide: HouseholdsRepo, useClass: SupabaseJsHouseholdsRepo },
    { provide: HouseholdMessenger, useClass: ServicesHouseholdMessenger },
    byObjectStore(StoragePurge, SupabaseStoragePurge, ObjectStorePurge),
  ],
  exports: [HouseholdsService, HouseholdsRepo, HouseholdAccess, Limiter, RequestMeta, SiteUrl, HouseholdMessenger, StoragePurge],
})
export class HouseholdsModule {}
