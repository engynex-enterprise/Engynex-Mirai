import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { jobsContract as c, type JobBody } from "@mirai/contracts/modules/jobs"
import { Scheduler } from "../../core/auth/scheduler.guard"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { SkipDefaultLimit } from "../../core/rate-limit/rate-limit.guard"
import { JobsService } from "./jobs.service"

/** Simulación: `?dry=1` o el cuerpo `{ "dry": true }` (el que manda Cloud Scheduler). */
const isDry = (q: { dry?: "0" | "1" }, b: JobBody) => q.dry === "1" || b?.dry === true
const ok = <T>(data: T) => ({ status: 200 as const, body: { ok: true as const, data } })

// /v1/jobs/**: sin sesión de persona; SchedulerGuard exige OIDC de Cloud Scheduler/Tasks o CRON_SECRET (transición).
@Controller()
@Scheduler()
@SkipDefaultLimit()
export class JobsController {
  constructor(private readonly svc: JobsService) {}

  @TsRestHandler(c.notifyTick)
  @Idempotent()
  notifyTick() {
    return tsRestHandler(c.notifyTick, async ({ query, body }) => ok(await this.svc.notifyTick({ dry: isDry(query, body) })))
  }

  @TsRestHandler(c.notifyHousehold)
  notifyHousehold() {
    return tsRestHandler(c.notifyHousehold, async ({ params, body }) => ok(await this.svc.notifyHousehold(params.householdId, body)))
  }

  @TsRestHandler(c.planEmails)
  planEmails() {
    return tsRestHandler(c.planEmails, async ({ query, body }) => ok(await this.svc.planEmails(isDry(query, body))))
  }

  @TsRestHandler(c.refsRefresh)
  refsRefresh() {
    return tsRestHandler(c.refsRefresh, async ({ query, body }) => ok(await this.svc.refs(isDry(query, body))))
  }

  @TsRestHandler(c.calendarSync)
  calendarSync() {
    return tsRestHandler(c.calendarSync, async ({ query, body }) => ok(await this.svc.calendarSync(isDry(query, body))))
  }

  @TsRestHandler(c.calendarUser)
  calendarUser() {
    return tsRestHandler(c.calendarUser, async ({ params, query, body }) => ok(await this.svc.calendarUser(params.userId, isDry(query, body))))
  }

  @TsRestHandler(c.planReminders)
  planReminders() {
    return tsRestHandler(c.planReminders, async ({ query, body }) => ok(await this.svc.planReminders(isDry(query, body))))
  }

  @TsRestHandler(c.netWorthMonthly)
  netWorthMonthly() {
    return tsRestHandler(c.netWorthMonthly, async ({ query, body }) => ok(await this.svc.netWorth(isDry(query, body))))
  }

  @TsRestHandler(c.automationsHourly)
  automationsHourly() {
    return tsRestHandler(c.automationsHourly, async ({ query, body }) => ok(await this.svc.automationsHourly(isDry(query, body))))
  }

  @TsRestHandler(c.automationsDrain)
  automationsDrain() {
    return tsRestHandler(c.automationsDrain, async ({ query, body }) => ok(await this.svc.automationsDrain(isDry(query, body))))
  }

  @TsRestHandler(c.automationsBook)
  automationsBook() {
    return tsRestHandler(c.automationsBook, async ({ params, query, body }) => ok(await this.svc.automationsBook(params.bookId, isDry(query, body))))
  }
}
