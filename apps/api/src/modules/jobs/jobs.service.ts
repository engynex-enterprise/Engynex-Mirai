// Trabajos programados (§2.7.7, F2-E-5). Reemplaza el cron de la web (apps/web/app/api/cron/notify), que recorre todos
// los libros en serie dentro de 60 s (riesgo R10), por un tick que reparte:
//   1. latido del cron horario (`platform_settings.cron_horario_visto`) y `horarioActivo` (lib/notify/schedule.ts);
//   2. una tarea por hogar en la cola `notify` con nombre determinista `notify-<hogar>-<AAAAMMDDHH>` (Cloud Tasks
//      rechaza el duplicado: dos ticks en la misma hora no repiten nada);
//   3. correos del plan y automatizaciones de la hora, y a las 6 y a las 9 las tareas diarias en la cola `slow`
//      (`tareasDiarias`). La API es siempre la pasada horaria: la diaria de Vercel (`daily=1`) desaparece.
// Simulación (`dry`): el tick no deja latido y todo se encola con prefijo `dry-` y `{ dry: true }`; los trabajadores
// calculan igual y no envían ni escriben (para comparar con el cron de la web, §4 paso 9).
import { Inject, Injectable } from "@nestjs/common"
import type { Logger } from "pino"
import type { HouseholdReport, HouseholdTaskBody, JobReport, TickReport } from "@mirai/contracts/modules/jobs"
import { todayBogota } from "@mirai/domain/dates"
import { horaBogota } from "@mirai/services/notify/digest"
import { tareasDiarias } from "@mirai/services/notify/schedule"
import { RequestContextService } from "../../core/context/request-context.service"
import { LOGGER } from "../../core/logging/logger"
import { QueuePort, type Task } from "../../core/queue/queue.port"
import { AutomationsRunner } from "../automations/automations.port"
import { ServicesEnv } from "../integrations/services-env"
import { NotifyJobs, PlanRemindersPort } from "./jobs.port"

export { horaBogota }

/** AAAAMMDDHH en Colombia (nombre de las tareas de la hora). */
export function stampHour(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}${p.month}${p.day}${p.hour}`
}
/** AAAAMMDD en Colombia (tareas del día). */
export const stampDay = (d: Date) => todayBogota(d).replace(/-/g, "")
/** AAAAMMDDHHmm en Colombia redondeado a 5 minutos (drain). */
export function stamp5m(d: Date) {
  const m = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", minute: "numeric" }).format(d))
  return `${stampHour(d)}${String(m - (m % 5)).padStart(2, "0")}`
}

const NO_DB = "Sin SUPABASE_SECRET_KEY: el tick no puede leer la base (solo pasa en local)."

@Injectable()
export class JobsService {
  constructor(
    private readonly ctx: RequestContextService,
    private readonly jobs: NotifyJobs,
    private readonly plan: PlanRemindersPort,
    private readonly automations: AutomationsRunner,
    private readonly queue: QueuePort,
    private readonly env: ServicesEnv,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  private get caller() {
    return this.ctx.peek()?.caller ?? "?"
  }

  /** Encola y cuenta nuevas y repetidas (una tarea que no se pudo encolar hace fallar el tick: Scheduler reintenta). */
  private async enqueueAll(tasks: Task[]) {
    let encoladas = 0, repetidas = 0
    for (let i = 0; i < tasks.length; i += 20) {
      const r = await Promise.all(tasks.slice(i, i + 20).map((t) => this.queue.enqueue(t)))
      for (const x of r) {
        if (x.deduped) repetidas++
        else encoladas++
      }
    }
    return { encoladas, repetidas }
  }

  async notifyTick(o: { dry: boolean }, now = new Date()): Promise<TickReport> {
    const hora = horaBogota(now)
    const base = { hora, dry: o.dry, caller: this.caller }
    if (!this.jobs.ready) return { ...base, horario: false, hogares: 0, encoladas: 0, repetidas: 0, tareas: [], nota: NO_DB }
    const { horario } = await this.jobs.heartbeat({ now, dry: o.dry })
    const hogares = await this.jobs.households()
    const p = o.dry ? "dry-" : "", hh = stampHour(now), dd = stampDay(now)
    const body = { dry: o.dry }
    const tasks: Task[] = hogares.map((h) => ({ queue: "notify", path: `/v1/jobs/notify/household/${h}`, name: `${p}notify-${h}-${hh}`, body: { at: now.toISOString(), horario, dry: o.dry } satisfies HouseholdTaskBody }))
    const extra: [string, Task][] = [
      ["plan-emails", { queue: "notify", path: "/v1/jobs/plan/emails", name: `${p}plan-emails-${hh}`, body }],
      ["automations-hourly", { queue: "automations", path: "/v1/jobs/automations/hourly", name: `${p}auto-hourly-${hh}`, body }],
    ]
    if (this.env.values.tickDailyTasks) {
      if (tareasDiarias({ daily: false, horario, h: hora, hora: 6 }))
        extra.push(
          ["refs", { queue: "slow", path: "/v1/jobs/refs/refresh", name: `${p}refs-${dd}`, body }],
          ["calendar", { queue: "slow", path: "/v1/jobs/calendar/sync", name: `${p}gcal-sync-${dd}`, body }],
          ["net-worth", { queue: "slow", path: "/v1/jobs/net-worth/monthly", name: `${p}net-worth-${dd}`, body }],
        )
      if (tareasDiarias({ daily: false, horario, h: hora, hora: 9 })) extra.push(["plan-reminders", { queue: "slow", path: "/v1/jobs/plan/reminders", name: `${p}plan-reminders-${dd}`, body }])
    }
    const r = await this.enqueueAll([...tasks, ...extra.map(([, t]) => t)])
    const report: TickReport = { ...base, horario, hogares: hogares.length, ...r, tareas: extra.map(([k]) => k) }
    this.log.info({ job: "notify.tick", report }, "tick de avisos")
    return report
  }

  async notifyHousehold(householdId: string, b: HouseholdTaskBody): Promise<HouseholdReport> {
    const now = new Date(b.at)
    const dry = !!b.dry
    const runs = await this.jobs.household(householdId, { now, horario: b.horario, dry })
    // Una línea por hogar en Cloud Logging (sin montos ni correos: solo prefijos de ids y el resultado por canal).
    this.log.info({ job: "notify.household", householdId, dry, runs }, "resúmenes del hogar")
    return { householdId, hora: horaBogota(now), dry, runs }
  }

  private report(job: string, dry: boolean, resultado: unknown, encoladas?: number): JobReport {
    this.log.info({ job, dry, encoladas }, `trabajo ${job}`)
    return { job, dry, resultado, ...(encoladas === undefined ? {} : { encoladas }) }
  }

  async planEmails(dry: boolean, now = new Date()) {
    return this.report("plan.emails", dry, await this.jobs.planEmails(now, dry))
  }

  async refs(dry: boolean) {
    return this.report("refs.refresh", dry, dry ? "simulado" : await this.jobs.refs())
  }

  /** Una tarea por persona que conectó Google Calendar (cola slow). */
  async calendarSync(dry: boolean, now = new Date()) {
    const users = await this.jobs.calendarUsers()
    const p = dry ? "dry-" : "", dd = stampDay(now)
    const r = await this.enqueueAll(users.map((u) => ({ queue: "slow", path: `/v1/jobs/calendar/user/${u}`, name: `${p}gcal-${u}-${dd}`, body: { dry } })))
    return this.report("calendar.sync", dry, { personas: users.length, repetidas: r.repetidas }, r.encoladas)
  }

  async calendarUser(userId: string, dry: boolean) {
    return this.report("calendar.user", dry, await this.jobs.calendarUser(userId, dry))
  }

  async planReminders(dry: boolean, now = new Date()) {
    const vencimientos = await this.plan.run(now, dry)
    const correos = await this.jobs.planEmails(now, dry)
    return this.report("plan.reminders", dry, { vencimientos, correos })
  }

  async netWorth(dry: boolean, now = new Date()) {
    return this.report("net-worth.monthly", dry, dry ? { simulado: true, dia1: todayBogota(now).endsWith("-01") } : await this.jobs.netWorth(now))
  }

  async automationsHourly(dry: boolean) {
    return this.report("automations.hourly", dry, dry ? "simulado" : await this.automations.hourly())
  }

  /** Lo que quede en automation_events: una tarea por libro (nombre por libro y ventana de 5 minutos). */
  async automationsDrain(dry: boolean, now = new Date()) {
    const books = await this.automations.pendingBooks()
    if (dry) return this.report("automations.drain", dry, { libros: books.length }, 0)
    const slot = stamp5m(now)
    const r = await this.enqueueAll(books.map((b) => ({ queue: "automations", path: `/v1/jobs/automations/book/${b}`, name: `auto-${b}-${slot}`, body: {} })))
    return this.report("automations.drain", dry, { libros: books.length, repetidas: r.repetidas }, r.encoladas)
  }

  async automationsBook(bookId: string, dry: boolean) {
    return this.report("automations.book", dry, dry ? "simulado" : await this.automations.processBook(bookId))
  }
}
