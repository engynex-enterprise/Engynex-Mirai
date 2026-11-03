// Módulo `jobs / cron` (docs/arquitectura/v6-separacion-front-back.md §2.6, §2.7.7 y §2.7.8). Dueño: F2-E.
// Trabajos programados sin sesión de persona: los llama Cloud Scheduler (OIDC) o Cloud Tasks (OIDC), y durante la
// transición también `Authorization: Bearer CRON_SECRET` (SchedulerGuard). Todos aceptan simulación: `?dry=1` o el
// cuerpo `{ "dry": true }` (el que manda Cloud Scheduler): calculan igual y no envían ni escriben.
//
// Reparto (fan-out):
//   Scheduler `5 * * * *` → POST /v1/jobs/notify/tick → latido + una tarea por hogar en la cola `notify`
//     (notify-<hogar>-<AAAAMMDDHH>) → POST /v1/jobs/notify/household/:householdId
//   + en la misma pasada: correos del plan (`notify`), automatizaciones de la hora (`automations`) y, a las 6 y a las 9,
//     las tareas diarias en la cola `slow` (refs, calendar → una tarea por persona, net-worth, plan/reminders).
//   Scheduler `*/5 * * * *` → POST /v1/jobs/automations/drain (lo que quede en automation_events).
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiOk, COMMON_ERRORS, Uuid } from "../common"

export const meta = { id: "jobs", owner: "F2-E" } as const

/** `?dry=1` (simulación). */
export const TickQuery = z.object({ dry: z.enum(["0", "1"]).optional() })
/** Cuerpo opcional de Cloud Scheduler / Cloud Tasks: `{ "dry": true }`. Lo demás se ignora. */
export const JobBody = z.object({ dry: z.boolean().optional() }).nullish()
export type JobBody = z.infer<typeof JobBody>

export const TickReport = z.object({
  /** Hora de Bogotá (0–23) en la que corrió. */
  hora: z.number().int().min(0).max(23),
  dry: z.boolean(),
  /** ¿El cron horario está vivo? (interruptor de la consola + latido; lib/notify/schedule.ts). */
  horario: z.boolean(),
  /** Hogares con al menos un libro (uno por tarea de la cola `notify`). */
  hogares: z.number().int().min(0),
  /** Tareas nuevas en Cloud Tasks (o en la cola en proceso, en local). */
  encoladas: z.number().int().min(0),
  /** Tareas que ya existían con el mismo nombre (otro tick de la misma hora): Cloud Tasks no las repite. */
  repetidas: z.number().int().min(0),
  /** Qué se encoló además de los hogares: plan-emails, automations-hourly, refs, calendar, net-worth, plan-reminders. */
  tareas: z.array(z.string()),
  /** Quién llamó: "oidc:<correo de la cuenta de servicio>" o "secret" (CRON_SECRET). */
  caller: z.string(),
  nota: z.string().optional(),
})
export type TickReport = z.infer<typeof TickReport>

/** Tarea de un hogar (la encola el tick). `at` = el minuto del tick, para que la hora y el día sean los del tick. */
export const HouseholdTaskBody = z.object({
  at: z.iso.datetime({ offset: true, error: "Fecha y hora inválidas (ISO 8601)" }),
  horario: z.boolean(),
  dry: z.boolean().optional(),
})
export type HouseholdTaskBody = z.infer<typeof HouseholdTaskBody>

export const HouseholdReport = z.object({
  householdId: Uuid,
  hora: z.number().int().min(0).max(23),
  dry: z.boolean(),
  /** Igual que `report.runs` del cron de la web: `<persona>:<libro>` (8 caracteres) → lo que salió por cada canal. */
  runs: z.record(z.string(), z.array(z.string())),
})
export type HouseholdReport = z.infer<typeof HouseholdReport>

/** Resultado de un trabajo (refs, calendar, plan, patrimonio, automatizaciones). */
export const JobReport = z.object({
  job: z.string(),
  dry: z.boolean(),
  /** Tareas encoladas (trabajos que reparten: calendar/sync, automations/drain). */
  encoladas: z.number().int().min(0).optional(),
  /** Lo mismo que devuelve hoy la tarea en el cron de la web (número, líneas o resumen). */
  resultado: z.unknown(),
})
export type JobReport = z.infer<typeof JobReport>

const c = initContract()
const job = (path: string, summary: string) => ({ method: "POST" as const, path, query: TickQuery, body: JobBody, responses: { ...COMMON_ERRORS, 200: ApiOk(JobReport) }, summary })

export const jobsContract = c.router(
  {
    notifyTick: {
      method: "POST",
      path: "/v1/jobs/notify/tick",
      query: TickQuery,
      body: JobBody,
      responses: { ...COMMON_ERRORS, 200: ApiOk(TickReport) },
      summary: "Tick horario de avisos (Cloud Scheduler): latido y una tarea por hogar",
    },
    notifyHousehold: {
      method: "POST",
      path: "/v1/jobs/notify/household/:householdId",
      pathParams: z.object({ householdId: Uuid }),
      body: HouseholdTaskBody,
      responses: { ...COMMON_ERRORS, 200: ApiOk(HouseholdReport) },
      summary: "Resúmenes de un hogar (Cloud Tasks, cola notify)",
    },
    planEmails: job("/v1/jobs/plan/emails", "Correos de los avisos del plan de las últimas 24 horas (cola notify)"),
    refsRefresh: job("/v1/jobs/refs/refresh", "TRM, usura, festivos y precios de inversiones (cola slow o Scheduler 6 a. m.)"),
    calendarSync: job("/v1/jobs/calendar/sync", "Google Calendar: una tarea por persona que lo conectó (cola slow)"),
    calendarUser: { ...job("/v1/jobs/calendar/user/:userId", "Google Calendar de una persona (Cloud Tasks, cola slow)"), pathParams: z.object({ userId: Uuid }) },
    planReminders: job("/v1/jobs/plan/reminders", "Premium por vencer o vencido (9 a. m.) y correos del plan"),
    netWorthMonthly: job("/v1/jobs/net-worth/monthly", "Foto del patrimonio del mes (el día 1, si no existe)"),
    automationsHourly: job("/v1/jobs/automations/hourly", "Automatizaciones de la hora: cola, estados, programadas y esperas (cola automations)"),
    automationsDrain: job("/v1/jobs/automations/drain", "Lo que quede en automation_events: una tarea por libro (Scheduler cada 5 min)"),
    automationsBook: { ...job("/v1/jobs/automations/book/:bookId", "Procesa la cola de un libro (outbox: después de cada escritura, cola automations)"), pathParams: z.object({ bookId: Uuid }) },
  },
  { strictStatusCodes: true },
)
