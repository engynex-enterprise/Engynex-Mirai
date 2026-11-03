// Módulo `automations` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-E (CRUD y runner: V7-G).
// Endpoints: CRUD de automations, probar, plantillas por defecto, ejecuciones y drenaje.
//
// V7-G (E10): lo que la web hace hoy en apps/web/features/automations/{actions.ts,hooks.ts,runner.tsx} y con useSave
// sobre `automations`:
//   GET    /v1/books/:bookId/automations              → useAutomations (sin las borradas, por fecha de creación)
//   GET    /v1/books/:bookId/automations/:id
//   PUT    /v1/books/:bookId/automations/:id          → crear (id del navegador) o editar. El grafo pasa por GraphSchema y
//                                                       `disparador` sale de su disparador. Activar exige un grafo sin
//                                                       pendientes (validateGraph), el cupo del plan (activeLimit = trigger
//                                                       automation_limit) y, con un paso de IA, el plan con «ia».
//                                                       Guardar una activa con pendientes la pausa (como el editor).
//   DELETE /v1/books/:bookId/automations/:id          → borrado lógico (papelera); POST …/:id/restore = «Deshacer»
//   POST   /v1/books/:bookId/automations/:id/test     → testAutomation: simula con datos del libro, sin cambiar nada
//   POST   /v1/books/:bookId/automations/defaults     → ensureDefaultAutomations (idempotente por plantilla)
//   GET    /v1/books/:bookId/automation-runs          → useRuns (?automationId=&limit=)
//   POST   /v1/books/:bookId/automations/drain        → runPendingAutomations (el runner del navegador)
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { GraphSchema } from "@mirai/domain/automations/schema"
import { ApiOk, Uuid } from "../common"
import { BookParams, IdParams, Row, WRITE_ERRORS } from "./write-common"

export const meta = { id: "automations", owner: "F2-E" } as const

export { GraphSchema }

/** Fila de `automations` tal como la devuelve la base. */
export const AutomationRow = Row
export const RunRow = Row

export const AutomationUpsert = z
  .object({
    nombre: z.string({ error: "Escribe el nombre" }).trim().min(1, "Escribe el nombre").max(80, "Máximo 80 caracteres").optional(),
    descripcion: z.string().trim().max(500, "Máximo 500 caracteres").optional(),
    icon: z.string().regex(/^[a-z0-9-]{1,40}$/, "Ícono inválido").optional(),
    activo: z.boolean().optional(),
    grafo: GraphSchema.optional(),
  })
  .strict()
export type AutomationUpsert = z.infer<typeof AutomationUpsert>

export const Issue = z.object({ nodeId: z.string().optional(), field: z.string().optional(), msg: z.string() })
export const Saved = z.object({
  automation: AutomationRow,
  /** true si se guardó en pausa porque el diagrama tiene cosas por revisar. */
  pausada: z.boolean(),
  issues: z.array(Issue),
})

export const TestInput = z.object({
  /** El diagrama que está en el editor (sin guardar). Si no viene, el guardado. */
  graph: GraphSchema.optional(),
  monto: z.number().min(0).max(1e12).nullish(),
  descripcion: z.string().max(120).nullish(),
})
export const StepResult = z.object({ node: z.string(), kind: z.string(), ok: z.boolean(), msg: z.string(), branch: z.enum(["si", "no"]).optional(), wait: z.boolean().optional() })
export const TestResult = z.object({
  status: z.enum(["ok", "error", "omitida", "esperando"]),
  steps: z.array(StepResult),
  issues: z.array(Issue),
  evento: z.object({ descripcion: z.string(), monto: z.number().nullable(), fecha: z.string() }),
})
export type TestResult = z.infer<typeof TestResult>

export const RunsQuery = z.object({
  automationId: Uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(30),
})

const c = initContract()
const A = "/v1/books/:bookId/automations"
export const automationsContract = c.router(
  {
    list: { method: "GET", path: A, pathParams: BookParams, responses: { ...WRITE_ERRORS, 200: z.array(AutomationRow) }, summary: "Automatizaciones del libro (sin las borradas)" },
    get: { method: "GET", path: `${A}/:id`, pathParams: IdParams, responses: { ...WRITE_ERRORS, 200: AutomationRow }, summary: "Una automatización" },
    put: {
      method: "PUT", path: `${A}/:id`, pathParams: IdParams, body: AutomationUpsert, responses: { ...WRITE_ERRORS, 200: ApiOk(Saved) },
      summary: "Crea (con el id del navegador) o edita una automatización. Rol: «Edita» o más",
      description: "Activar exige el diagrama sin pendientes (400 con `details.issues`), un cupo libre del plan (409) y «ia» en el plan si tiene un paso de IA (402).",
    },
    remove: { method: "DELETE", path: `${A}/:id`, pathParams: IdParams, body: c.noBody(), responses: { ...WRITE_ERRORS, 200: ApiOk(AutomationRow) }, summary: "Envía la automatización a la papelera" },
    restore: { method: "POST", path: `${A}/:id/restore`, pathParams: IdParams, body: c.noBody(), responses: { ...WRITE_ERRORS, 200: ApiOk(AutomationRow) }, summary: "Deshacer: la saca de la papelera (en pausa si ya no cabe en el plan)" },
    test: { method: "POST", path: `${A}/:id/test`, pathParams: IdParams, body: TestInput, responses: { ...WRITE_ERRORS, 200: ApiOk(TestResult) }, summary: "Probar: simula con datos reales del libro sin cambiar nada" },
    defaults: { method: "POST", path: `${A}/defaults`, pathParams: BookParams, body: c.noBody(), responses: { ...WRITE_ERRORS, 200: ApiOk(z.object({ creadas: z.number() })) }, summary: "Crea las automatizaciones por defecto la primera vez (idempotente)" },
    drain: { method: "POST", path: `${A}/drain`, pathParams: BookParams, body: c.noBody(), responses: { ...WRITE_ERRORS, 200: ApiOk(z.object({ procesados: z.number() })) }, summary: "Procesa ya los eventos pendientes del libro (el runner del navegador)" },
    runs: { method: "GET", path: "/v1/books/:bookId/automation-runs", pathParams: BookParams, query: RunsQuery, responses: { ...WRITE_ERRORS, 200: z.array(RunRow) }, summary: "Últimas ejecuciones (de una automatización o de todas)" },
  },
  { strictStatusCodes: true },
)
