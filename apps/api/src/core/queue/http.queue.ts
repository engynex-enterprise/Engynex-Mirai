// QUEUE_DRIVER=http: empuje HTTP directo a la API (o a TASKS_TARGET_URL) para plataformas sin colas administradas.
// `enqueue` responde enseguida y la tarea se despacha en segundo plano en este mismo proceso, con reintentos y espera
// creciente. Limitación: si el proceso se reinicia, se pierden las tareas pendientes o en espera (para eso están
// cloudtasks, sqs, servicebus). Deduplicación por nombre con DedupeStore (memoria por instancia o Redis).
import type { Logger } from "pino"
import { countEnqueue, recordJob } from "../telemetry/metrics"
import { DedupeStore, MemoryDedupeStore } from "./dedupe"
import { DispatchError, type TaskDispatcher } from "./dispatch"
import { backoffS, toEnvelope, type TaskEnvelope } from "./envelope"
import { QueuePort, assertTaskName, type EnqueueResult, type Task } from "./queue.port"

export type HttpQueueOptions = {
  dispatcher: TaskDispatcher
  dedupe?: DedupeStore
  dedupeTtlS?: number
  maxAttempts: number
  retryBaseS: number
  retryMaxS: number
  log?: Logger
}

/** 4xx que no se arreglan reintentando (sí se reintentan 401/403/408/409/425/429 y 5xx: credenciales que rotan, carga). */
export const isPermanent = (status: number) => [400, 404, 405, 410, 413, 415, 422].includes(status)

export class HttpQueue extends QueuePort {
  readonly driver = "http"
  private readonly dedupe: DedupeStore
  private readonly timers = new Set<NodeJS.Timeout>()
  private readonly running = new Set<Promise<void>>()
  private closed = false

  constructor(private readonly o: HttpQueueOptions) {
    super()
    this.dedupe = o.dedupe ?? new MemoryDedupeStore()
  }

  /** Tareas en espera o en curso (para pruebas y para el apagado). */
  get pending() {
    return this.timers.size + this.running.size
  }

  async enqueue(t: Task): Promise<EnqueueResult> {
    assertTaskName(t.name)
    if (this.closed) throw new Error("La cola HTTP ya se cerró")
    const env = toEnvelope(t)
    if (t.name && !(await this.dedupe.claim(`${t.queue}/${t.name}`, this.o.dedupeTtlS ?? 86_400))) {
      countEnqueue({ driver: this.driver, queue: t.queue, deduped: true })
      return { name: t.name, deduped: true }
    }
    this.later(env, 1, t.delayS ? t.delayS * 1000 : 0)
    countEnqueue({ driver: this.driver, queue: t.queue, deduped: false })
    return { name: env.name, deduped: false }
  }

  private later(env: TaskEnvelope, attempt: number, ms: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      const p = this.run(env, attempt).finally(() => this.running.delete(p))
      this.running.add(p)
    }, ms)
    timer.unref()
    this.timers.add(timer)
  }

  private async run(env: TaskEnvelope, attempt: number) {
    const t0 = Date.now()
    try {
      await this.o.dispatcher.dispatch({ ...env, attempt })
      recordJob({ driver: this.driver, queue: env.queue, ok: true }, Date.now() - t0)
    } catch (e) {
      recordJob({ driver: this.driver, queue: env.queue, ok: false }, Date.now() - t0)
      const status = e instanceof DispatchError ? e.status : 0
      const last = attempt >= this.o.maxAttempts || isPermanent(status) || this.closed
      this.o.log?.[last ? "error" : "warn"]({ queue: env.queue, task: env.name, attempt, status }, last ? "Tarea fallida: no se reintenta" : "Tarea fallida: se reintenta")
      if (!last) this.later(env, attempt + 1, backoffS(attempt, this.o.retryBaseS, this.o.retryMaxS) * 1000)
    }
  }

  /** Espera lo que está en curso (hasta 10 s) y descarta lo que estaba en espera (queda en el log). */
  async close(): Promise<void> {
    this.closed = true
    if (this.timers.size) this.o.log?.warn({ tareas: this.timers.size }, "Se apagó la cola HTTP con tareas en espera (se pierden)")
    for (const t of this.timers) clearTimeout(t)
    this.timers.clear()
    await Promise.race([Promise.allSettled([...this.running]), new Promise((r) => setTimeout(r, 10_000).unref())])
    await this.dedupe.close()
  }
}
