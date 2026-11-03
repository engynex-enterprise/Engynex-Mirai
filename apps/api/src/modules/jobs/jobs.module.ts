import { Module } from "@nestjs/common"
import { AutomationsModule } from "../automations/automations.module"
import { IntegrationsModule } from "../integrations/integrations.module"
import { JobsController } from "./jobs.controller"
import { NotifyJobs, PlanRemindersPort } from "./jobs.port"
import { JobsService } from "./jobs.service"
import { PendingPlanReminders, ServicesNotifyJobs } from "./services.jobs"

// Módulo `jobs / cron` (§2.6, §2.7.7). Dueño: F2-E. Tick con latido y fan-out por hogar (QueuePort: Cloud Tasks por
// REST o InlineQueue en local) y los trabajadores de las colas notify, automations y slow.
// "jobs → notifications, automations, billing, google y assets": aquí por los puertos NotifyJobs (avisos, Google,
// referencias y patrimonio sobre @mirai/services), AutomationsRunner y PlanRemindersPort (F2-I lo reemplaza).
@Module({
  imports: [IntegrationsModule, AutomationsModule],
  controllers: [JobsController],
  providers: [JobsService, { provide: NotifyJobs, useClass: ServicesNotifyJobs }, { provide: PlanRemindersPort, useClass: PendingPlanReminders }],
  exports: [PlanRemindersPort],
})
export class JobsModule {}
