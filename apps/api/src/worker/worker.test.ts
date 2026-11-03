// Proceso trabajador (MODE=worker) sin nube: consumidor simulado + servidor HTTP local de destino. La prueba contra
// SQS real (ElasticMQ) está en src/adapters/aws/sqs.queue.test.ts.
import { createServer, type Server } from "node:http"
import pino from "pino"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { loadConfig } from "../core/config/config.schema"
import type { ConsumeOptions, QueueConsumer, TaskHandler } from "../core/queue/consumer.port"
import type { TaskEnvelope } from "../core/queue/envelope"
import type { QueueName } from "../core/queue/queue.port"
import { startWorker } from "./worker"

const silent = pino({ level: "silent" })
const TP = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"

class FakeConsumer implements QueueConsumer {
  readonly driver = "fake"
  handlers = new Map<QueueName, TaskHandler>()
  opts?: ConsumeOptions
  stopped: string[] = []
  closed = false
  async consume(q: QueueName, h: TaskHandler, o: ConsumeOptions) {
    this.handlers.set(q, h)
    this.opts = o
    return { stop: async () => void this.stopped.push(q) }
  }
  async close() {
    this.closed = true
  }
}

describe("worker", () => {
  let server: Server
  let target = ""
  const hits: { url?: string; auth?: string; tp?: string; attempt?: string }[] = []
  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push({ url: req.url, auth: req.headers.authorization, tp: req.headers.traceparent as string, attempt: req.headers["x-mirai-attempt"] as string })
      req.resume()
      res.writeHead(req.url?.includes("falla") ? 500 : 200).end("{}")
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
    target = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  afterAll(() => new Promise((r) => server.close(r)))

  const cfg = () => {
    const c = loadConfig({ MODE: "worker", QUEUE_DRIVER: "servicebus", SERVICEBUS_NAMESPACE: "ns.servicebus.windows.net", TASKS_TARGET_URL: target, CRON_SECRET: "cron-w", WORKER_QUEUES: "notify,automations", WORKER_CONCURRENCY: "3", HOST: "127.0.0.1" })
    c.port = 0
    return c
  }

  it("consume las colas configuradas con sus opciones, despacha con Bearer y traza, y lanza si el destino falla", async () => {
    const fc = new FakeConsumer()
    const w = await startWorker(cfg(), silent, { consumer: fc })
    expect([...fc.handlers.keys()]).toEqual(["notify", "automations"])
    expect(fc.opts).toEqual({ concurrency: 3, timeoutS: 300, retryBaseS: 10, retryMaxS: 900, maxAttempts: 5 })
    const task: TaskEnvelope = { v: 1, queue: "notify", name: "notify-h1", path: "/v1/jobs/notify/household/h1", body: {}, traceparent: TP }
    await fc.handlers.get("notify")!(task, { attempt: 2 })
    expect(hits.at(-1)).toEqual({ url: "/v1/jobs/notify/household/h1", auth: "Bearer cron-w", tp: TP, attempt: "2" })
    await expect(fc.handlers.get("automations")!({ ...task, queue: "automations", path: "/v1/jobs/falla" }, { attempt: 1 })).rejects.toThrow(/500/)

    expect((await fetch(`http://127.0.0.1:${w.port}/readyz`)).status).toBe(200)
    expect((await fetch(`http://127.0.0.1:${w.port}/v1/me`)).status).toBe(404) // no monta la API
    await w.stop("SIGTERM")
    expect(fc.stopped).toEqual(["notify", "automations"])
    expect(fc.closed).toBe(true)
    expect(w.ready()).toBe(false)
  })

  it("si una cola no arranca, cierra lo abierto y lanza", async () => {
    const fc = new FakeConsumer()
    fc.consume = async (q) => {
      if (q === "automations") throw new Error("sin permiso")
      return { stop: async () => void fc.stopped.push(q) }
    }
    await expect(startWorker(cfg(), silent, { consumer: fc, health: false })).rejects.toThrow(/sin permiso/)
    expect(fc.stopped).toEqual(["notify"])
    expect(fc.closed).toBe(true)
  })
})
