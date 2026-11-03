import { Module } from "@nestjs/common"
import { IntegrationsModule } from "../integrations/integrations.module"
import { AutomationsOutbox } from "./automations.outbox"
import { AutomationsRunner } from "./automations.port"
import { ServicesAutomations } from "./services.automations"

// Módulo `automations` (§2.6). Dueño: F2-E. Por ahora: el outbox (EventsService → cola `automations`) y el motor del
// servidor para los trabajos (/v1/jobs/automations/**). El CRUD, `test` y `defaults` (F2-E-4) siguen en la web.
@Module({
  imports: [IntegrationsModule],
  providers: [AutomationsOutbox, { provide: AutomationsRunner, useClass: ServicesAutomations }],
  exports: [AutomationsRunner],
})
export class AutomationsModule {}
