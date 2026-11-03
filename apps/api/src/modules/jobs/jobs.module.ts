import { Module } from "@nestjs/common"
import { JobsController } from "./jobs.controller"
import { JobsService } from "./jobs.service"

// Módulo `jobs / cron` (§2.6). Dueño: F2-E. F2-B dejó el esqueleto protegido de POST /v1/jobs/notify/tick.
@Module({ controllers: [JobsController], providers: [JobsService] })
export class JobsModule {}
