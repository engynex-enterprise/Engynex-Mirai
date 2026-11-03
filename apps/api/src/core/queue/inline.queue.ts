// Cola en proceso para desarrollo y pruebas: deduplica por nombre y despacha con `dispatch` (por defecto, un POST a
// esta misma API con CRON_SECRET; sin secreto, solo queda registrada).
import { randomUUID } from "node:crypto"
import { countEnqueue } from "../telemetry/metrics"
import { QueuePort, TASK_NAME_RE, type EnqueueResult, type Task } from "./queue.port"
import { traceCarrier, traceHeaders } from "./trace"

export type Dispatch = (task: Task) => Promise<void>

export class InlineQueue extends QueuePort {
  readonly driver = "inline"
  private readonly seen = new Set<string>()
  readonly tasks: Task[] = []

  constructor(private readonly dispatch?: Dispatch) {
    super()
  }

  async enqueue(task: Task): Promise<EnqueueResult> {
    const name = task.name ?? randomUUID()
    if (!TASK_NAME_RE.test(name)) throw new Error(`Nombre de tarea inválido: ${name}`)
    const key = `${task.queue}/${name}`
    if (this.seen.has(key)) {
      countEnqueue({ driver: this.driver, queue: task.queue, deduped: true })
      return { name, deduped: true }
    }
    this.seen.add(key)
    this.tasks.push({ ...task, name })
    countEnqueue({ driver: this.driver, queue: task.queue, deduped: false })
    if (this.dispatch) {
      const run = () => void this.dispatch!(task).catch(() => undefined)
      if (task.delayS) setTimeout(run, task.delayS * 1000).unref()
      else setImmediate(run)
    }
    return { name, deduped: false }
  }
}

/** Despachador local: POST a la API con Bearer CRON_SECRET (SchedulerGuard lo acepta en la transición). */
export const httpDispatch = (baseUrl: string, secret: string): Dispatch => {
  return async (t) => {
    // setImmediate/setTimeout conservan el contexto asíncrono de la petición que encoló: la traza es la de esa petición.
    const headers = { authorization: `Bearer ${secret}`, "content-type": "application/json", ...traceHeaders(traceCarrier()) }
    await fetch(`${baseUrl}${t.path}`, { method: "POST", headers, body: JSON.stringify(t.body ?? {}) })
  }
}
