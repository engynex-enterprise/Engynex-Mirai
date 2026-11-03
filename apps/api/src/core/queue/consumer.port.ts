// Consumo de las colas de extracción (SQS, Service Bus) desde el proceso MODE=worker. Cada adaptador recibe, respeta
// `notBefore`, llama al manejador y confirma (borra/completa) o deja reintentar con espera creciente.
import type { QueueName } from "./queue.port"
import type { TaskEnvelope } from "./envelope"

export type ConsumeOptions = {
  /** Tareas a la vez en esta cola. */
  concurrency: number
  /** Tiempo máximo de una tarea (s): visibilidad en SQS / renovación del candado en Service Bus. */
  timeoutS: number
  retryBaseS: number
  retryMaxS: number
  /** Intentos antes de rendirse (Service Bus: a la cola de mensajes fallidos; SQS: la política de redrive decide). */
  maxAttempts: number
}

/** Lanza si la tarea falló (se reintenta). `attempt` empieza en 1. */
export type TaskHandler = (task: TaskEnvelope, info: { attempt: number }) => Promise<void>

export type Consumption = {
  /** Deja de recibir y espera lo que está en curso (hasta `graceMs`). */
  stop(graceMs: number): Promise<void>
}

export interface QueueConsumer {
  readonly driver: string
  consume(queue: QueueName, handler: TaskHandler, o: ConsumeOptions): Promise<Consumption>
  close(): Promise<void>
}

/** Cuenta las tareas en curso para el apagado ordenado. */
export class Inflight {
  private n = 0
  private waiters: (() => void)[] = []

  get size() {
    return this.n
  }

  track<T>(p: Promise<T>): Promise<T> {
    this.n++
    return p.finally(() => {
      this.n--
      const w = this.waiters
      this.waiters = []
      for (const f of w) f()
    })
  }

  /** Resuelve cuando termina alguna tarea (o ya no hay ninguna). */
  next(): Promise<void> {
    if (this.n === 0) return Promise.resolve()
    return new Promise((r) => this.waiters.push(r))
  }

  /** Espera a que no quede ninguna, como máximo `ms`. true si terminaron todas. */
  async drain(ms: number): Promise<boolean> {
    const until = Date.now() + ms
    while (this.n > 0) {
      const left = until - Date.now()
      if (left <= 0) return false
      await Promise.race([this.next(), new Promise((r) => setTimeout(r, Math.min(left, 250)).unref())])
    }
    return true
  }
}
