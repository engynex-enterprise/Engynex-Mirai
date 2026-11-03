import { Module } from "@nestjs/common"
import { HouseholdAccess } from "../households/household-access"
import { SiteUrl } from "../households/site-url"
import { SupabaseJsBillingRepo } from "./adapters/supabase-js.billing.repo"
import { BillingConfig } from "./billing.config"
import { BillingController, PlansController, WebhooksController } from "./billing.controller"
import { PlansReadService } from "./plans-read.service"
import { RowStoreModule } from "../../core/store/row-store.module"
import { BillingRepo } from "./billing.repository"
import { BillingService } from "./billing.service"
import { HttpMercadoPagoClient, MercadoPagoClient } from "./mercadopago.client"

// Módulo `billing` (§2.6). Dueño: F2-I (lectura pública: F2-C-3). Comandos del plan y webhooks de Mercado Pago y Wompi.
// Exporta BillingService (applyPayment, renovaciones) para households, account y admin.
// Adaptadores: supabase-js (hoy); pg-kysely llega con Cloud SQL (fase 4) con las mismas firmas del puerto.
@Module({
  controllers: [BillingController, PlansController, WebhooksController],
  imports: [RowStoreModule],
  providers: [
    BillingService,
    PlansReadService,
    BillingConfig,
    HouseholdAccess,
    SiteUrl,
    { provide: BillingRepo, useClass: SupabaseJsBillingRepo },
    { provide: MercadoPagoClient, useClass: HttpMercadoPagoClient },
  ],
  exports: [BillingService, BillingConfig, MercadoPagoClient],
})
export class BillingModule {}
