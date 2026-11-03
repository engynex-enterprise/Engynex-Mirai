import { Module } from "@nestjs/common"
import { ServicesIntegrations } from "./adapters/services.integrations"
import { IntegrationsController } from "./integrations.controller"
import { IntegrationsPort } from "./integrations.port"
import { IntegrationsService } from "./integrations.service"
import { loadServicesEnv, ServicesEnv } from "./services-env"
import { ServicesRuntime } from "./services-runtime"

// Módulo `integrations` (§2.6). Dueño: F2-E. Base de notifications, google, automations y jobs ("notifications →
// integrations"): configura @mirai/services (ServicesRuntime) y exporta ServicesEnv. Probar la conexión y listar los
// modelos de IA quedan para F2-F (usan el AI SDK).
@Module({
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    { provide: IntegrationsPort, useClass: ServicesIntegrations },
    { provide: ServicesEnv, useFactory: () => ({ values: loadServicesEnv() }) },
    ServicesRuntime,
  ],
  exports: [ServicesEnv, ServicesRuntime],
})
export class IntegrationsModule {}
