// Colas (§2.7.8, D6): un puerto y un adaptador por plataforma, elegido con QUEUE_DRIVER (core/queue/factory.ts).
//  - cloudtasks: GCP, empuje HTTP con OIDC (los trabajadores son endpoints /v1/jobs/** de esta API).
//  - sqs / servicebus: colas de extracción (AWS / Azure); las consume el proceso MODE=worker (src/worker) y las despacha
//    por HTTP a /v1/jobs/** igual que Cloud Tasks.
//  - http: empuje HTTP directo (plataformas sin colas; en el mismo proceso, sin garantía de entrega si se reinicia).
//  - inline: en proceso, para desarrollo y pruebas.
// Nombres deterministas = sin duplicados (cada adaptador lo garantiza a su manera, ver cada archivo).
export type QueueName = "notify" | "automations" | "slow"

export const QUEUE_NAMES: readonly QueueName[] = ["notify", "automations", "slow"]

export type QueueDriver = "inline" | "cloudtasks" | "sqs" | "servicebus" | "http"

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

  /** Libera clientes y conexiones (lo llama Nest al apagar). */
  async close(): Promise<void> {}

  async onApplicationShutdown(): Promise<void> {
    await this.close()
  }
}

export const TASK_NAME_RE = /^[A-Za-z0-9_-]{1,500}$/

/** Lanza si el nombre no sirve (mismo formato en todas las colas, el de Cloud Tasks). */
export function assertTaskName(name: string | undefined): void {
  if (name !== undefined && !TASK_NAME_RE.test(name)) throw new Error(`Nombre de tarea inválido: ${name}`)
}
