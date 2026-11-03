import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { jobsContract } from "@mirai/contracts/modules/jobs"
import { Scheduler } from "../../core/auth/scheduler.guard"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { SkipDefaultLimit } from "../../core/rate-limit/rate-limit.guard"
import { JobsService } from "./jobs.service"

// /v1/jobs/**: sin sesión de persona; SchedulerGuard exige OIDC de Cloud Scheduler/Tasks o CRON_SECRET.
@Controller()
@Scheduler()
@SkipDefaultLimit()
export class JobsController {
  constructor(private readonly svc: JobsService) {}

  @TsRestHandler(jobsContract.notifyTick)
  @Idempotent()
  notifyTick() {
    return tsRestHandler(jobsContract.notifyTick, async ({ query }) => ({ status: 200, body: { ok: true as const, data: this.svc.notifyTick({ dry: query.dry === "1" }) } }))
  }
}
