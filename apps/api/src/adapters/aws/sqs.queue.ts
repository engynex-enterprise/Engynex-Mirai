// AWS SQS (QUEUE_DRIVER=sqs): encolar desde la API y consumir desde MODE=worker. El SDK se carga perezosamente.
// - Una URL por cola lógica (QUEUE_NOTIFY, QUEUE_AUTOMATIONS, QUEUE_SLOW). Credenciales: cadena estándar del SDK (rol de
//   la tarea de ECS/EKS, perfil o variables AWS_*). Región: la de la URL o AWS_REGION. SQS_ENDPOINT para ElasticMQ/LocalStack.
// - Deduplicación: DedupeStore (memoria o Redis) + en colas FIFO (URL terminada en .fifo) MessageDeduplicationId = nombre
//   (ventana de 5 min de SQS) y MessageGroupId = nombre (cada tarea en su grupo: no se bloquean entre sí).
// - Retraso: DelaySeconds (colas estándar, hasta 900 s) + `notBefore` en el sobre, que el consumidor respeta escondiendo el
//   mensaje con ChangeMessageVisibility (FIFO no admite retraso por mensaje; también sirve para más de 15 min).
// - Reintento: si el trabajador falla, el mensaje no se borra y se esconde base·2^(intento-1) s (ApproximateReceiveCount);
//   tras maxReceiveCount la política de redrive de la cola lo pasa a la DLQ (Terraform). Ojo: esconder por `notBefore`
//   también cuenta como recepción.
// - Traza: atributos de mensaje `traceparent`/`tracestate` (además del sobre).
import type { Message, SQSClient } from "@aws-sdk/client-sqs"
import type { Logger } from "pino"
import { Inflight, type Consumption, type ConsumeOptions, type QueueConsumer, type TaskHandler } from "../../core/queue/consumer.port"
import { DedupeStore, MemoryDedupeStore } from "../../core/queue/dedupe"
import { backoffS, parseEnvelope, shortId, toEnvelope, type TaskEnvelope } from "../../core/queue/envelope"
import { QueuePort, assertTaskName, type EnqueueResult, type QueueName, type Task } from "../../core/queue/queue.port"
import { countEnqueue, recordJob } from "../../core/telemetry/metrics"

type Sdk = typeof import("@aws-sdk/client-sqs")

export type SqsQueueOptions = {
  urls: Partial<Record<QueueName, string>>
  region?: string
  endpoint?: string
  /** Solo pruebas (ElasticMQ). En la nube, la cadena estándar de credenciales. */
  credentials?: { accessKeyId: string; secretAccessKey: string }
  dedupe?: DedupeStore
  dedupeTtlS?: number
  /** Espera larga de ReceiveMessage (s, máx. 20). */
  waitTimeS?: number
  log?: Logger
}

const MAX_VISIBILITY_S = 43_200

/** Región de una URL de SQS (https://sqs.us-east-1.amazonaws.com/123/cola). */
export const sqsRegionFromUrl = (url: string) => /^https:\/\/sqs[.-]([a-z0-9-]+)\.amazonaws\.com(?:\.cn)?\//.exec(url)?.[1]

export const isFifoUrl = (url: string) => url.endsWith(".fifo")

export class SqsQueue extends QueuePort implements QueueConsumer {
  readonly driver = "sqs"
  private loaded?: Promise<{ sdk: Sdk; client: SQSClient }>
  private readonly dedupe: DedupeStore

  constructor(private readonly o: SqsQueueOptions) {
    super()
    this.dedupe = o.dedupe ?? new MemoryDedupeStore()
  }

  private load() {
    return (this.loaded ??= import("@aws-sdk/client-sqs").then((sdk) => {
      const first = Object.values(this.o.urls).find(Boolean)
      const region = this.o.region ?? (first ? sqsRegionFromUrl(first) : undefined)
      const client = new sdk.SQSClient({ ...(region ? { region } : {}), ...(this.o.endpoint ? { endpoint: this.o.endpoint } : {}), ...(this.o.credentials ? { credentials: this.o.credentials } : {}) })
      return { sdk, client }
    }))
  }

  private url(queue: QueueName): string {
    const u = this.o.urls[queue]
    if (!u) throw new Error(`Falta la URL de la cola ${queue} (QUEUE_${queue.toUpperCase()})`)
    return u
  }

  async enqueue(t: Task): Promise<EnqueueResult> {
    assertTaskName(t.name)
    const url = this.url(t.queue)
    const env = toEnvelope(t)
    const key = t.name ? `${t.queue}/${t.name}` : undefined
    if (key && !(await this.dedupe.claim(key, this.o.dedupeTtlS ?? 86_400))) {
      countEnqueue({ driver: this.driver, queue: t.queue, deduped: true })
      return { name: env.name, deduped: true }
    }
    try {
      const { sdk, client } = await this.load()
      const delay = t.delayS ? Math.min(900, Math.max(0, Math.round(t.delayS))) : 0
      await client.send(
        new sdk.SendMessageCommand({
          QueueUrl: url,
          MessageBody: JSON.stringify(env),
          MessageAttributes: attributes(env),
          ...(isFifoUrl(url) ? { MessageDeduplicationId: shortId(env.name), MessageGroupId: shortId(env.name) } : delay ? { DelaySeconds: delay } : {}),
        }),
      )
    } catch (e) {
      if (key) await this.dedupe.release(key).catch(() => undefined)
      throw new Error(`SQS no aceptó la tarea (${(e as Error).name})`)
    }
    countEnqueue({ driver: this.driver, queue: t.queue, deduped: false })
    return { name: env.name, deduped: false }
  }

  async consume(queue: QueueName, handler: TaskHandler, o: ConsumeOptions): Promise<Consumption> {
    const url = this.url(queue)
    const { sdk, client } = await this.load()
    const ac = new AbortController()
    const inflight = new Inflight()
    const visibility = Math.min(MAX_VISIBILITY_S, o.timeoutS + 30)
    let stopped = false

    const loop = (async () => {
      let errors = 0
      while (!stopped) {
        const free = o.concurrency - inflight.size
        if (free <= 0) {
          await inflight.next()
          continue
        }
        let msgs: Message[]
        try {
          const r = await client.send(
            new sdk.ReceiveMessageCommand({
              QueueUrl: url,
              MaxNumberOfMessages: Math.min(10, free),
              WaitTimeSeconds: Math.min(20, this.o.waitTimeS ?? 20),
              VisibilityTimeout: visibility,
              MessageAttributeNames: ["All"],
              MessageSystemAttributeNames: ["ApproximateReceiveCount"],
            }),
            { abortSignal: ac.signal },
          )
          msgs = r.Messages ?? []
          errors = 0
        } catch (e) {
          if (stopped) break
          errors++
          this.o.log?.warn({ queue, driver: this.driver, error: { name: (e as Error).name, message: (e as Error).message } }, "No se pudo leer la cola")
          await sleep(Math.min(30_000, 500 * 2 ** errors), ac.signal)
          continue
        }
        if (stopped) {
          // Llegaron mientras se apagaba: se devuelven a la cola enseguida (visibilidad 0) en vez de procesarlas.
          await Promise.allSettled(msgs.map((m) => client.send(new sdk.ChangeMessageVisibilityCommand({ QueueUrl: url, ReceiptHandle: m.ReceiptHandle!, VisibilityTimeout: 0 }))))
          break
        }
        for (const m of msgs) void inflight.track(this.handle(sdk, client, url, queue, m, handler, o))
      }
    })()

    return {
      stop: async (graceMs) => {
        stopped = true
        // No se aborta de una la espera larga: si SQS ya le asignó mensajes, abortar los dejaría escondidos hasta que venza
        // la visibilidad. Se espera a que vuelva (máx. WaitTimeSeconds) y solo se aborta si se acaba el plazo.
        const wait = Math.min(graceMs, (Math.min(20, this.o.waitTimeS ?? 20) + 2) * 1000)
        const t = setTimeout(() => ac.abort(), wait)
        await loop.catch(() => undefined)
        clearTimeout(t)
        if (!(await inflight.drain(graceMs))) this.o.log?.warn({ queue, enCurso: inflight.size }, "Apagado con tareas en curso: SQS las volverá a entregar")
      },
    }
  }

  private async handle(sdk: Sdk, client: SQSClient, url: string, queue: QueueName, m: Message, handler: TaskHandler, o: ConsumeOptions) {
    const receipt = m.ReceiptHandle!
    const del = () => client.send(new sdk.DeleteMessageCommand({ QueueUrl: url, ReceiptHandle: receipt }))
    const hide = (s: number) => client.send(new sdk.ChangeMessageVisibilityCommand({ QueueUrl: url, ReceiptHandle: receipt, VisibilityTimeout: Math.max(0, Math.min(MAX_VISIBILITY_S, Math.ceil(s))) }))
    const env = parseEnvelope(m.Body)
    const attempt = Number(m.Attributes?.ApproximateReceiveCount ?? "1") || 1
    if (!env) {
      // Nunca se podrá procesar: se borra (el log lleva el id del mensaje, no el cuerpo).
      this.o.log?.error({ queue, messageId: m.MessageId }, "Mensaje inválido en la cola: se descarta")
      await del().catch(() => undefined)
      return
    }
    env.traceparent = m.MessageAttributes?.traceparent?.StringValue ?? env.traceparent
    env.tracestate = m.MessageAttributes?.tracestate?.StringValue ?? env.tracestate
    const wait = (env.notBefore ?? 0) - Date.now()
    if (wait > 1000) {
      await hide(wait / 1000).catch((e: Error) => this.o.log?.warn({ queue, task: env.name, error: { name: e.name } }, "No se pudo aplazar la tarea"))
      return
    }
    const t0 = Date.now()
    try {
      await handler(env, { attempt })
      recordJob({ driver: this.driver, queue, ok: true }, Date.now() - t0)
      await del().catch((e: Error) => this.o.log?.warn({ queue, task: env.name, error: { name: e.name } }, "No se pudo borrar la tarea terminada (se repetirá)"))
    } catch (e) {
      recordJob({ driver: this.driver, queue, ok: false }, Date.now() - t0)
      const s = backoffS(attempt, o.retryBaseS, o.retryMaxS)
      const last = attempt >= o.maxAttempts
      this.o.log?.[last ? "error" : "warn"](
        { queue, task: env.name, attempt, retryInS: s, error: { message: (e as Error).message } },
        last ? "Tarea fallida: se agotaron los intentos (la política de redrive la pasa a la DLQ)" : "Tarea fallida: se reintenta",
      )
      await hide(s).catch(() => undefined)
    }
  }

  async close(): Promise<void> {
    if (this.loaded) (await this.loaded).client.destroy()
    await this.dedupe.close()
  }
}

function attributes(env: TaskEnvelope) {
  const a: Record<string, { DataType: "String"; StringValue: string }> = { "mirai-task": { DataType: "String", StringValue: shortId(env.name, 256) } }
  if (env.traceparent) a.traceparent = { DataType: "String", StringValue: env.traceparent }
  if (env.tracestate) a.tracestate = { DataType: "String", StringValue: env.tracestate }
  return a
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((r) => {
    const t = setTimeout(r, ms)
    signal.addEventListener("abort", () => (clearTimeout(t), r()), { once: true })
  })
}
