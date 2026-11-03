// Proceso trabajador (MODE=worker, V7-F): consume las colas de extracción (SQS en AWS, Service Bus en Azure) y despacha
// cada tarea por HTTP a TASKS_TARGET_URL (o API_BASE_URL) + ruta, igual que Cloud Tasks en GCP. No monta Nest ni los
// controladores de la API: solo un servidor mínimo con /healthz y /readyz para las sondas de la plataforma.
//  - Concurrencia: WORKER_CONCURRENCY tareas a la vez por cola (WORKER_QUEUES).
//  - Confirmación: borra/completa al responder 2xx; en error deja reintentar con espera creciente (TASKS_RETRY_*), hasta
//    TASKS_MAX_ATTEMPTS / la DLQ de la cola.
//  - Traza: continúa el `traceparent` guardado en la tarea (span CONSUMER + encabezado al despachar).
//  - Apagado ordenado: SIGTERM/SIGINT → deja de recibir, espera lo que está en curso (WORKER_SHUTDOWN_S) y sale.
import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api"
import { createServer, type Server } from "node:http"
import type { Logger } from "pino"
import type { Config } from "../core/config/config.schema"
import { traceFields, parseTraceHeaders } from "../core/logging/trace"
import type { Consumption, QueueConsumer, TaskHandler } from "../core/queue/consumer.port"
import type { TaskDispatcher } from "../core/queue/dispatch"
import { createConsumer, createDispatcher } from "../core/queue/factory"
import { contextFrom } from "../core/queue/trace"

export type WorkerDeps = { consumer?: QueueConsumer; dispatcher?: TaskDispatcher; health?: boolean }

export type RunningWorker = {
  /** Puerto real del servidor de salud (0 si no hay). */
  port: number
  ready(): boolean
  stop(reason?: string): Promise<void>
}

/** Manejador de cada tarea: span de OpenTelemetry con la traza de origen + POST al trabajador HTTP. */
export function dispatchHandler(dispatcher: TaskDispatcher, log: Logger, project?: string): TaskHandler {
  const tracer = trace.getTracer("mirai-worker")
  return (task, { attempt }) =>
    tracer.startActiveSpan(
      `job ${task.queue}`,
      { kind: SpanKind.CONSUMER, attributes: { "messaging.destination.name": task.queue, "messaging.message.id": task.name, "mirai.task.attempt": attempt } },
      contextFrom(task),
      async (span) => {
        const t0 = Date.now()
        const tf = traceFields(parseTraceHeaders({ traceparent: task.traceparent }), project)
        try {
          // Si OpenTelemetry está encendido, la instrumentación de fetch reemplaza el traceparent por el del span hijo.
          const status = await dispatcher.dispatch({ ...task, attempt })
          log.info({ ...tf, queue: task.queue, task: task.name, path: task.path, attempt, status, ms: Date.now() - t0 }, "Tarea despachada")
        } catch (e) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message })
          log.warn({ ...tf, queue: task.queue, task: task.name, path: task.path, attempt, ms: Date.now() - t0, error: { message: (e as Error).message } }, "Tarea fallida")
          throw e
        } finally {
          span.end()
        }
      },
    )
}

export async function startWorker(config: Config, log: Logger, deps: WorkerDeps = {}): Promise<RunningWorker> {
  const consumer = deps.consumer ?? createConsumer(config, log)
  const dispatcher = deps.dispatcher ?? createDispatcher(config)
  const handler = dispatchHandler(dispatcher, log, config.gcpProject)
  const t = config.tasks
  const opts = { concurrency: config.worker.concurrency, timeoutS: t.timeoutS, retryBaseS: t.retryBaseS, retryMaxS: t.retryMaxS, maxAttempts: t.maxAttempts }
  const running: Consumption[] = []
  let ready = false
  let stopping: Promise<void> | undefined

  let server: Server | undefined
  let port = 0
  if (deps.health !== false) {
    server = createServer((req, res) => {
      const path = (req.url ?? "/").split("?")[0]
      if (path === "/healthz") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, mode: "worker" }))
      if (path === "/readyz") return void res.writeHead(ready ? 200 : 503, { "content-type": "application/json" }).end(JSON.stringify({ ok: ready, queues: config.worker.queues, driver: consumer.driver }))
      res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, msg: "No existe" }))
    })
    await new Promise<void>((r, j) => server!.once("error", j).listen(config.port, config.host, () => r()))
    const a = server.address()
    port = typeof a === "object" && a ? a.port : config.port
  }

  try {
    for (const q of config.worker.queues) running.push(await consumer.consume(q, handler, opts))
  } catch (e) {
    await Promise.allSettled(running.map((r) => r.stop(0)))
    await consumer.close().catch(() => undefined)
    server?.close()
    throw e
  }
  ready = true
  log.info({ driver: consumer.driver, queues: config.worker.queues, concurrency: opts.concurrency, target: config.tasks.targetUrl, auth: config.tasks.auth }, "Trabajador listo")

  return {
    port,
    ready: () => ready,
    stop: (reason) =>
      (stopping ??= (async () => {
        ready = false
        log.info({ reason }, "Apagando el trabajador")
        const grace = config.worker.shutdownS * 1000
        await Promise.allSettled(running.map((r) => r.stop(grace)))
        await consumer.close().catch(() => undefined)
        await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
      })()),
  }
}

/** Arranque desde main.ts: trabajador + señales de apagado. */
export async function runWorker(config: Config, log: Logger, onExit: (code: number) => void = (c) => process.exit(c)): Promise<RunningWorker> {
  const w = await startWorker(config, log)
  const { shutdownTelemetry } = await import("../otel")
  const bye = (signal: string) => {
    void w
      .stop(signal)
      .then(() => shutdownTelemetry())
      .then(() => onExit(0))
      .catch(() => onExit(1))
  }
  process.once("SIGTERM", () => bye("SIGTERM"))
  process.once("SIGINT", () => bye("SIGINT"))
  return w
}
