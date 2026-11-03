// SQS: utilidades sin red siempre; contra ElasticMQ (Docker) solo si hay SQS_TEST_ENDPOINT, para que `pnpm test` siga en
// verde sin Docker:
//   docker run -d --name mirai-elasticmq -p 127.0.0.1:59324:9324 softwaremill/elasticmq-native
//   SQS_TEST_ENDPOINT=http://127.0.0.1:59324 pnpm --filter api test src/adapters/aws
import { CreateQueueCommand, DeleteMessageBatchCommand, DeleteQueueCommand, GetQueueAttributesCommand, ReceiveMessageCommand, SQSClient, type Message } from "@aws-sdk/client-sqs"
import { ClsServiceManager } from "nestjs-cls"
import { createServer, type IncomingMessage, type Server } from "node:http"
import pino from "pino"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { loadConfig } from "../../core/config/config.schema"
import { CTX } from "../../core/context/request-context"
import { NoDedupeStore } from "../../core/queue/dedupe"
import type { TaskEnvelope } from "../../core/queue/envelope"
import { createDispatcher } from "../../core/queue/factory"
import { startWorker } from "../../worker/worker"
import { isFifoUrl, SqsQueue, sqsRegionFromUrl } from "./sqs.queue"

const ENDPOINT = process.env.SQS_TEST_ENDPOINT
const CREDS = { accessKeyId: "prueba", secretAccessKey: "prueba" }
const REGION = "us-east-1"
const TP = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
const silent = pino({ level: "silent" })

describe("SQS (sin red)", () => {
  it("región de la URL, FIFO por sufijo y error claro sin URL", async () => {
    expect(sqsRegionFromUrl("https://sqs.us-east-1.amazonaws.com/123456789012/mirai-notify")).toBe("us-east-1")
    expect(sqsRegionFromUrl("https://sqs.cn-north-1.amazonaws.com.cn/1/x")).toBe("cn-north-1")
    expect(sqsRegionFromUrl("http://localhost:9324/000000000000/x")).toBeUndefined()
    expect(isFifoUrl("https://sqs.us-east-1.amazonaws.com/1/a.fifo")).toBe(true)
    expect(isFifoUrl("https://sqs.us-east-1.amazonaws.com/1/a")).toBe(false)
    await expect(new SqsQueue({ urls: {} }).enqueue({ queue: "slow", path: "/x" })).rejects.toThrow(/QUEUE_SLOW/)
  })
})

describe.skipIf(!ENDPOINT)("SQS contra ElasticMQ (SQS_TEST_ENDPOINT)", () => {
  const admin = new SQSClient({ endpoint: ENDPOINT, region: REGION, credentials: CREDS })
  const tag = `v7f-${Date.now().toString(36)}`
  const urls: Record<string, string> = {}
  const created: string[] = []

  /** URL de la cola con el host del endpoint (ElasticMQ devuelve su dirección interna). */
  async function mk(name: string, fifo = false) {
    const r = await admin.send(new CreateQueueCommand({ QueueName: fifo ? `${tag}-${name}.fifo` : `${tag}-${name}`, Attributes: fifo ? { FifoQueue: "true", ContentBasedDeduplication: "false" } : {} }))
    created.push(r.QueueUrl!)
    const u = new URL(r.QueueUrl!)
    return `${ENDPOINT!.replace(/\/+$/, "")}${u.pathname}`
  }
  const adapter = (o: Partial<ConstructorParameters<typeof SqsQueue>[0]> = {}) => new SqsQueue({ urls: { notify: urls.notify, automations: urls.automations, slow: urls.slow }, endpoint: ENDPOINT, region: REGION, credentials: CREDS, waitTimeS: 1, log: silent, ...o })
  const count = async (url: string) => {
    const r = await admin.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible", "ApproximateNumberOfMessagesDelayed"] }))
    const a = r.Attributes ?? {}
    return { visible: Number(a.ApproximateNumberOfMessages), hidden: Number(a.ApproximateNumberOfMessagesNotVisible), delayed: Number(a.ApproximateNumberOfMessagesDelayed ?? 0) }
  }
  /** Borra lo que se leyó a mano (si no, vuelve a aparecer al vencer la visibilidad). */
  const ack = async (url: string, ms: Message[] | undefined) => {
    if (ms?.length) await admin.send(new DeleteMessageBatchCommand({ QueueUrl: url, Entries: ms.map((m, i) => ({ Id: String(i), ReceiptHandle: m.ReceiptHandle! })) }))
  }
  const OPTS = { concurrency: 2, timeoutS: 30, retryBaseS: 1, retryMaxS: 4, maxAttempts: 5 }

  beforeAll(async () => {
    urls.notify = await mk("notify")
    urls.automations = await mk("automations", true)
    urls.slow = await mk("slow")
  })
  afterAll(async () => {
    await Promise.allSettled(created.map((u) => admin.send(new DeleteQueueCommand({ QueueUrl: `${ENDPOINT!.replace(/\/+$/, "")}${new URL(u).pathname}` }))))
    admin.destroy()
  })

  it("encola el sobre con la traza como atributo de mensaje", async () => {
    const q = adapter()
    const cls = ClsServiceManager.getClsService()
    const r = await cls.run(() => {
      cls.set(CTX, { requestId: "r", startedAt: 0, trace: { traceId: "0af7651916cd43dd8448eb211c80319c", spanId: "b7ad6b7169203331", sampled: true } })
      return q.enqueue({ queue: "notify", path: "/v1/jobs/notify/household/h1", name: "notify-h1-2026110210", body: { a: 1 } })
    })
    expect(r).toEqual({ name: "notify-h1-2026110210", deduped: false })
    expect(await q.enqueue({ queue: "notify", path: "/x", name: "notify-h1-2026110210" })).toEqual({ name: "notify-h1-2026110210", deduped: true })
    const got = await admin.send(new ReceiveMessageCommand({ QueueUrl: urls.notify, WaitTimeSeconds: 1, MessageAttributeNames: ["All"], MaxNumberOfMessages: 10 }))
    expect(got.Messages).toHaveLength(1)
    const m = got.Messages![0]
    expect(m.MessageAttributes?.traceparent?.StringValue).toBe(TP)
    expect(JSON.parse(m.Body!)).toMatchObject({ v: 1, queue: "notify", name: "notify-h1-2026110210", path: "/v1/jobs/notify/household/h1", body: { a: 1 }, traceparent: TP })
    await ack(urls.notify, got.Messages)
    await q.close()
  })

  it("FIFO: el mismo nombre no se duplica aunque lo encolen dos instancias (MessageDeduplicationId)", async () => {
    // NoDedupeStore: sin la revisión local, para probar la deduplicación nativa de la cola FIFO.
    const a = adapter({ dedupe: new NoDedupeStore() }), b = adapter({ dedupe: new NoDedupeStore() })
    await a.enqueue({ queue: "automations", path: "/v1/jobs/automations/book/b1", name: "auto-b1-1700000000" })
    await b.enqueue({ queue: "automations", path: "/v1/jobs/automations/book/b1", name: "auto-b1-1700000000" })
    await a.enqueue({ queue: "automations", path: "/v1/jobs/automations/book/b2", name: "auto-b2-1700000000" })
    await new Promise((r) => setTimeout(r, 300))
    expect((await count(urls.automations)).visible).toBe(2)
    // Se vacía para las pruebas siguientes.
    const got = await admin.send(new ReceiveMessageCommand({ QueueUrl: urls.automations, WaitTimeSeconds: 1, MaxNumberOfMessages: 10 }))
    expect(got.Messages?.map((m) => (JSON.parse(m.Body!) as TaskEnvelope).name).sort()).toEqual(["auto-b1-1700000000", "auto-b2-1700000000"])
    await ack(urls.automations, got.Messages)
    await Promise.all([a.close(), b.close()])
  })

  it("retraso: DelaySeconds en la estándar y notBefore respetado por el consumidor en la FIFO", async () => {
    const q = adapter()
    const t0 = Date.now()
    await q.enqueue({ queue: "slow", path: "/v1/jobs/refs/refresh", name: "refs-1", delayS: 2 })
    const early = await admin.send(new ReceiveMessageCommand({ QueueUrl: urls.slow, WaitTimeSeconds: 1 }))
    expect(early.Messages ?? []).toHaveLength(0)

    await q.enqueue({ queue: "automations", path: "/v1/jobs/automations/book/b9", name: "auto-b9-delay", delayS: 2 })
    const runs: { name: string; at: number }[] = []
    const c1 = await q.consume("slow", async (t) => void runs.push({ name: t.name, at: Date.now() }), OPTS)
    const c2 = await q.consume("automations", async (t) => void runs.push({ name: t.name, at: Date.now() }), OPTS)
    await expect.poll(() => runs.length, { timeout: 10_000, interval: 100 }).toBe(2)
    for (const r of runs) expect(r.at - t0).toBeGreaterThanOrEqual(1_900)
    await Promise.all([c1.stop(2000), c2.stop(2000)])
    await expect.poll(async () => (await count(urls.slow)).visible + (await count(urls.slow)).hidden, { timeout: 3_000 }).toBe(0)
    await q.close()
  })

  it("reintento con espera creciente: el mensaje vuelve tras la espera y se borra al salir bien", async () => {
    const q = adapter()
    await q.enqueue({ queue: "notify", path: "/v1/jobs/plan/emails", name: "plan-emails-retry" })
    const tries: { attempt: number; at: number }[] = []
    const c = await q.consume("notify", async (_t, i) => {
      tries.push({ attempt: i.attempt, at: Date.now() })
      if (i.attempt < 3) throw new Error("El trabajador respondió 503")
    }, OPTS)
    await expect.poll(() => tries.length, { timeout: 15_000, interval: 100 }).toBe(3)
    expect(tries.map((t) => t.attempt)).toEqual([1, 2, 3])
    expect(tries[1].at - tries[0].at).toBeGreaterThanOrEqual(900) // 1 s
    expect(tries[2].at - tries[1].at).toBeGreaterThanOrEqual(1_900) // 2 s
    await c.stop(2000)
    await expect.poll(async () => { const n = await count(urls.notify); return n.visible + n.hidden }, { timeout: 3_000 }).toBe(0)
    await q.close()
  })

  it("trabajador (MODE=worker): consume, despacha por HTTP con Bearer CRON_SECRET y la traza, y se apaga ordenado", async () => {
    const hits: { url?: string; auth?: string; tp?: string; task?: string; body: unknown }[] = []
    let fails = 1
    const server: Server = createServer(async (req: IncomingMessage, res) => {
      let raw = ""
      for await (const ch of req) raw += ch
      hits.push({ url: req.url, auth: req.headers.authorization, tp: req.headers.traceparent as string, task: req.headers["x-mirai-task"] as string, body: JSON.parse(raw || "{}") })
      if (req.url?.includes("falla") && fails-- > 0) return void res.writeHead(503).end()
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}')
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
    const target = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const config = loadConfig({
      MODE: "worker",
      QUEUE_DRIVER: "sqs",
      QUEUE_NOTIFY: urls.notify,
      QUEUE_AUTOMATIONS: urls.automations,
      QUEUE_SLOW: urls.slow,
      SQS_ENDPOINT: ENDPOINT,
      AWS_REGION: REGION,
      TASKS_TARGET_URL: target,
      CRON_SECRET: "secreto-del-cron",
      TASKS_RETRY_BASE_S: "1",
      TASKS_RETRY_MAX_S: "2",
      WORKER_QUEUES: "notify,slow",
      HOST: "127.0.0.1",
    })
    config.port = 0 // puerto libre para /healthz
    const producer = adapter()
    const cls = ClsServiceManager.getClsService()
    await cls.run(async () => {
      cls.set(CTX, { requestId: "r", startedAt: 0, trace: { traceId: "0af7651916cd43dd8448eb211c80319c", spanId: "b7ad6b7169203331", sampled: true } })
      await producer.enqueue({ queue: "notify", path: "/v1/jobs/notify/household/h7", name: "notify-h7-2026110211", body: { at: "x" } })
      await producer.enqueue({ queue: "slow", path: "/v1/jobs/falla-una-vez", name: "falla-1" })
    })
    const w = await startWorker(config, silent, { consumer: adapter({ waitTimeS: 1 }), dispatcher: createDispatcher(config) })
    expect(w.ready()).toBe(true)
    const health = await fetch(`http://127.0.0.1:${w.port}/healthz`)
    expect(await health.json()).toEqual({ ok: true, mode: "worker" })
    expect((await fetch(`http://127.0.0.1:${w.port}/readyz`)).status).toBe(200)

    await expect.poll(() => hits.filter((h) => h.url === "/v1/jobs/falla-una-vez").length, { timeout: 15_000, interval: 100 }).toBe(2)
    await expect.poll(() => hits.some((h) => h.url === "/v1/jobs/notify/household/h7"), { timeout: 10_000 }).toBe(true)
    const h7 = hits.find((h) => h.url === "/v1/jobs/notify/household/h7")!
    expect(h7).toMatchObject({ auth: "Bearer secreto-del-cron", tp: TP, task: "notify-h7-2026110211", body: { at: "x" } })

    await w.stop("prueba")
    expect(w.ready()).toBe(false)
    await expect(fetch(`http://127.0.0.1:${w.port}/healthz`)).rejects.toThrow()
    await expect.poll(async () => { const a = await count(urls.notify), b = await count(urls.slow); return a.visible + a.hidden + b.visible + b.hidden }, { timeout: 3_000 }).toBe(0)
    await producer.close()
    await new Promise((r) => server.close(r))
  })
})
