// Colas (§2.7.8): Cloud Tasks en GCP; en local, InlineQueue en el mismo proceso. Los trabajadores son endpoints
// /v1/jobs/** de esta misma API (protegidos con SchedulerGuard). Nombres deterministas = sin duplicados.
export type QueueName = "notify" | "automations" | "slow"

export type Task = {
  queue: QueueName
  /** Ruta del trabajador, p. ej. /v1/jobs/notify/household/<id>. */
  path: string
  body?: unknown
  /** Nombre determinista (notify-<hogar>-<AAAAMMDDHH>): Cloud Tasks rechaza el duplicado. Letras, números, - y _. */
  name?: string
  /** Segundos de espera antes de ejecutarla. */
  delayS?: number
}

export type EnqueueResult = { name: string; deduped: boolean }

export abstract class QueuePort {
  abstract enqueue(task: Task): Promise<EnqueueResult>
}

export const TASK_NAME_RE = /^[A-Za-z0-9_-]{1,500}$/
