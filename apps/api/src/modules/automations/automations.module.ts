import { Module } from "@nestjs/common"
import { RowStoreModule } from "../../core/store/row-store.module"
import { IntegrationsModule } from "../integrations/integrations.module"
import { AutomationsController } from "./automations.controller"
import { AutomationsOutbox } from "./automations.outbox"
import { AutomationsRunner } from "./automations.port"
import { AutomationsService } from "./automations.service"
import { AutomationsTester, ServicesAutomationsTester } from "./automations.tester"
import { ServicesAutomations } from "./services.automations"

// Módulo `automations` (§2.6). Dueño: F2-E (CRUD, probar, plantillas y runner: V7-G).
// - Outbox (EventsService → cola `automations`) y motor del servidor para los trabajos (/v1/jobs/automations/**).
// - V7-G: CRUD (/v1/books/:b/automations[/:id], RowStore con UserScope), probar (AutomationsTester: simulación con
//   @mirai/services), plantillas por defecto (@mirai/domain/automations/templates), historial (automation-runs) y
//   `drain` (lo que hace hoy el runner del navegador, con el mismo AutomationsRunner y su reclamo atómico).
// Interruptor `automations_server_only` (doc v6 §5 paso 9d): todavía NO es una columna de platform_settings (no se crea
// migración aquí). Cuando la web lo encienda (V7-H), el runner del navegador deja de llamar a `drain` y la cola la
// corren solo el outbox de la API y el *drain* programado; `drain` sigue disponible y es idempotente.
@Module({
  imports: [IntegrationsModule, RowStoreModule],
  controllers: [AutomationsController],
  providers: [
    AutomationsOutbox,
    AutomationsService,
    { provide: AutomationsRunner, useClass: ServicesAutomations },
    { provide: AutomationsTester, useClass: ServicesAutomationsTester },
  ],
  exports: [AutomationsRunner],
})
export class AutomationsModule {}
