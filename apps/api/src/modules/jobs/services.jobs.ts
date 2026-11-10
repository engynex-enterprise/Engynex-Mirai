// Adaptadores de los puertos de trabajos sobre @mirai/services (mismo código que el cron de la web).
import { Injectable } from "@nestjs/common"
import { calendarUsers, syncCalendarsOfUser } from "@mirai/services/google/calendar"
import { refreshReferenceData } from "@mirai/services/integrations/refresh"
import { cronHeartbeat, householdsWithBooks, runDigests } from "@mirai/services/notify/cron"
import { patrimonioSnapshots, planEmails } from "@mirai/services/notify/cron-tasks"
import { familiaAvisos } from "@mirai/services/notify/familia"
import { AppConfig } from "../../core/config/app-config"
import { NotifyJobs, PlanRemindersPort } from "./jobs.port"

@Injectable()
export class ServicesNotifyJobs extends NotifyJobs {
  readonly ready: boolean
  constructor(config: AppConfig) {
    super()
    this.ready = !!config.supabase.secretKey
  }
  heartbeat(o: { now: Date; dry: boolean }) {
    return cronHeartbeat({ now: o.now, daily: false, dry: o.dry })
  }
  households() {
    return householdsWithBooks()
  }
  household(householdId: string, o: { now: Date; horario: boolean; dry: boolean }) {
    return runDigests({ householdId, now: o.now, daily: false, horario: o.horario, dry: o.dry })
  }
  planEmails(now: Date, dry: boolean) {
    return planEmails(now, { dry })
  }
  familia(now: Date, dry: boolean) {
    return familiaAvisos(now, { dry })
  }
  refs() {
    return refreshReferenceData()
  }
  calendarUsers() {
    return calendarUsers()
  }
  calendarUser(userId: string, dry: boolean) {
    return syncCalendarsOfUser(userId, { dry })
  }
  netWorth(now: Date) {
    return patrimonioSnapshots(now)
  }
}

/** Hasta que F2-I conecte su BillingModule: no hace nada (la web sigue avisando los vencimientos). */
@Injectable()
export class PendingPlanReminders extends PlanRemindersPort {
  async run() {
    return "pendiente: los vencimientos de Premium los corre todavía la web (F2-I debe proveer PlanRemindersPort)"
  }
}
