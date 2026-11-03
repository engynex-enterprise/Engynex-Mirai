// Módulo `jobs / cron` (docs/arquitectura/v6-separacion-front-back.md §2.6 y §2.7.7). Dueño: F2-E.
// Endpoints: Tick de avisos (Scheduler), por hogar (Cloud Tasks), datos de referencia, Calendar, plan, automatizaciones y patrimonio.
//
// F2-B dejó el esqueleto de POST /v1/jobs/notify/tick (protegido con SchedulerGuard: OIDC de Cloud Scheduler o Bearer
// CRON_SECRET en la transición). Todavía no envía nada: F2-E lo llena (latido, horarioActivo, fan-out por hogar).
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiOk, COMMON_ERRORS } from "../common"

export const meta = { id: "jobs", owner: "F2-E" } as const

export const TickQuery = z.object({ dry: z.enum(["0", "1"]).optional() })
export const TickReport = z.object({
  /** Hora de Bogotá (0–23) en la que corrió. */
  hora: z.number().int().min(0).max(23),
  dry: z.boolean(),
  /** Tareas encoladas en Cloud Tasks (0 mientras sea esqueleto). */
  encoladas: z.number().int().min(0),
  /** Quién llamó: "oidc:<correo de la cuenta de servicio>" o "secret" (CRON_SECRET). */
  caller: z.string(),
  nota: z.string().optional(),
})
export type TickReport = z.infer<typeof TickReport>

const c = initContract()
export const jobsContract = c.router(
  {
    notifyTick: {
      method: "POST",
      path: "/v1/jobs/notify/tick",
      query: TickQuery,
      body: c.noBody(),
      responses: { ...COMMON_ERRORS, 200: ApiOk(TickReport) },
      summary: "Tick horario de avisos (Cloud Scheduler)",
    },
  },
  { strictStatusCodes: true },
)
