// Azure Service Bus (QUEUE_DRIVER=servicebus): encolar desde la API y consumir desde MODE=worker. SDK perezoso.
// - Conexión: SERVICEBUS_NAMESPACE (<ns>.servicebus.windows.net) con DefaultAzureCredential (identidad administrada; rol
//   "Azure Service Bus Data Sender" en la API y "Data Receiver" + "Data Sender" en el trabajador) o
//   SERVICEBUS_CONNECTION_STRING (secreto). Nombre de cola por cola lógica (QUEUE_NOTIFY…; por defecto, el mismo nombre).
// - Deduplicación: DedupeStore local + `messageId` = nombre (la cola debe tener requiresDuplicateDetection).
// - Retraso: scheduledEnqueueTimeUtc (+ `notBefore` en el sobre por si el reloj difiere).
// - Reintento: en error se completa el mensaje y se reprograma una copia con espera creciente (attempt+1,
//   messageId `<nombre>~r<n>`); al llegar a maxAttempts va a la cola de mensajes fallidos (deadLetter). Si reprogramar
//   falla, abandon: Service Bus lo entrega otra vez y tras maxDeliveryCount lo pasa solo a la DLQ.
// - Traza: applicationProperties.traceparent/tracestate (además del sobre).
import type { Logger } from "pino"
import { Inflight, type Consumption, type ConsumeOptions, type QueueConsumer, type TaskHandler } from "../../core/queue/consumer.port"
import { DedupeStore, MemoryDedupeStore } from "../../core/queue/dedupe"
import { backoffS, parseEnvelope, shortId, toEnvelope, type TaskEnvelope } from "../../core/queue/envelope"
import { QueuePort, assertTaskName, type EnqueueResult, type QueueName, type Task } from "../../core/queue/queue.port"
import { countEnqueue, recordJob } from "../../core/telemetry/metrics"

// Interfaz mínima del SDK (@azure/service-bus la cumple): las pruebas inyectan un doble.
export type SbOutMessage = {
  body: unknown
  contentType?: string
  messageId?: string
  subject?: string
  applicationProperties?: Record<string, string | number | boolean>
  scheduledEnqueueTimeUtc?: Date
}
export type SbReceivedMessage = { body: unknown; messageId?: unknown; deliveryCount?: number; applicationProperties?: Record<string, unknown> }
export interface SbSender {
  sendMessages(m: SbOutMessage): Promise<void>
  close(): Promise<void>
}
export interface SbReceiver {
  subscribe(
    h: { processMessage(m: SbReceivedMessage): Promise<void>; processError(a: { error: Error; errorSource?: string }): Promise<void> },
    o: { maxConcurrentCalls: number; autoCompleteMessages: false },
  ): { close(): Promise<void> }
  completeMessage(m: SbReceivedMessage): Promise<void>
  abandonMessage(m: SbReceivedMessage): Promise<void>
  deadLetterMessage(m: SbReceivedMessage, o: { deadLetterReason: string; deadLetterErrorDescription?: string }): Promise<void>
  close(): Promise<void>
}
export interface SbClient {
  createSender(queue: string): SbSender
  createReceiver(queue: string, o: { receiveMode: "peekLock"; maxAutoLockRenewalDurationInMs: number }): SbReceiver
  close(): Promise<void>
}

export type ServiceBusQueueOptions = {
  namespace?: string
  connectionString?: string
  /** Nombre de la cola de Service Bus por cola lógica (por defecto, el mismo). */
  queues?: Partial<Record<QueueName, string>>
  dedupe?: DedupeStore
  dedupeTtlS?: number
  log?: Logger
  /** Pruebas: cliente simulado. */
  client?: SbClient
}

export class ServiceBusQueue extends QueuePort implements QueueConsumer {
  readonly driver = "servicebus"
  private client?: Promise<SbClient>
  private readonly senders = new Map<string, SbSender>()
  private readonly dedupe: DedupeStore

  constructor(private readonly o: ServiceBusQueueOptions) {
    super()
    this.dedupe = o.dedupe ?? new MemoryDedupeStore()
  }

  private sb(): Promise<SbClient> {
    return (this.client ??= this.o.client
      ? Promise.resolve(this.o.client)
      : import("@azure/service-bus").then(async ({ ServiceBusClient }) => {
          if (this.o.connectionString) return new ServiceBusClient(this.o.connectionString) as unknown as SbClient
          if (!this.o.namespace) throw new Error("Falta SERVICEBUS_NAMESPACE o SERVICEBUS_CONNECTION_STRING")
          const { azureCredential } = await import("./identity")
          return new ServiceBusClient(this.o.namespace, await azureCredential()) as unknown as SbClient
        }))
  }

  private name(queue: QueueName) {
    return this.o.queues?.[queue] ?? queue
  }

  private async sender(queue: QueueName): Promise<SbSender> {
    const n = this.name(queue)
    let s = this.senders.get(n)
    if (!s) this.senders.set(n, (s = (await this.sb()).createSender(n)))
    return s
  }

  private async send(env: TaskEnvelope, messageId: string) {
    const props: Record<string, string> = { "mirai-task": shortId(env.name, 256), path: env.path }
    if (env.traceparent) props.traceparent = env.traceparent
    if (env.tracestate) props.tracestate = env.tracestate
    await (await this.sender(env.queue)).sendMessages({
      body: env,
      contentType: "application/json",
      messageId: shortId(messageId),
      subject: env.queue,
      applicationProperties: props,
      ...(env.notBefore && env.notBefore > Date.now() ? { scheduledEnqueueTimeUtc: new Date(env.notBefore) } : {}),
    })
  }

  async enqueue(t: Task): Promise<EnqueueResult> {
    assertTaskName(t.name)
    const env = toEnvelope(t)
    const key = t.name ? `${t.queue}/${t.name}` : undefined
    if (key && !(await this.dedupe.claim(key, this.o.dedupeTtlS ?? 86_400))) {
      countEnqueue({ driver: this.driver, queue: t.queue, deduped: true })
      return { name: env.name, deduped: true }
    }
    try {
      await this.send(env, env.name)
    } catch (e) {
      if (key) await this.dedupe.release(key).catch(() => undefined)
      throw new Error(`Service Bus no aceptó la tarea (${(e as Error).name})`)
    }
    countEnqueue({ driver: this.driver, queue: t.queue, deduped: false })
    return { name: env.name, deduped: false }
  }

  async consume(queue: QueueName, handler: TaskHandler, o: ConsumeOptions): Promise<Consumption> {
    const receiver = (await this.sb()).createReceiver(this.name(queue), { receiveMode: "peekLock", maxAutoLockRenewalDurationInMs: (o.timeoutS + 60) * 1000 })
    const inflight = new Inflight()
    let stopping = false
    const sub = receiver.subscribe(
      {
        processMessage: (m) => inflight.track(this.handle(receiver, queue, m, handler, o, () => stopping)),
        processError: async (a) => {
          this.o.log?.warn({ queue, driver: this.driver, source: a.errorSource, error: { name: a.error?.name, message: a.error?.message } }, "Service Bus con problemas")
        },
      },
      { maxConcurrentCalls: o.concurrency, autoCompleteMessages: false },
    )
    return {
      stop: async (graceMs) => {
        stopping = true
        await sub.close().catch(() => undefined)
        if (!(await inflight.drain(graceMs))) this.o.log?.warn({ queue, enCurso: inflight.size }, "Apagado con tareas en curso: Service Bus las volverá a entregar")
        await receiver.close().catch(() => undefined)
      },
    }
  }

  private async handle(r: SbReceiver, queue: QueueName, m: SbReceivedMessage, handler: TaskHandler, o: ConsumeOptions, stopping: () => boolean) {
    const env = parseEnvelope(m.body)
    if (!env) {
      this.o.log?.error({ queue, messageId: String(m.messageId ?? "") }, "Mensaje inválido en la cola: va a la cola de fallidos")
      await r.deadLetterMessage(m, { deadLetterReason: "sobre-invalido" }).catch(() => undefined)
      return
    }
    const p = m.applicationProperties ?? {}
    if (typeof p.traceparent === "string") env.traceparent = p.traceparent
    if (typeof p.tracestate === "string") env.tracestate = p.tracestate
    const attempt = env.attempt ?? 1
    if ((env.notBefore ?? 0) - Date.now() > 1000) {
      // Llegó antes de tiempo (relojes distintos): se reprograma igual.
      await this.requeue(r, m, env, attempt, `${env.name}~w${attempt}`)
      return
    }
    const t0 = Date.now()
    try {
      await handler(env, { attempt })
      recordJob({ driver: this.driver, queue, ok: true }, Date.now() - t0)
      await r.completeMessage(m).catch((e: Error) => this.o.log?.warn({ queue, task: env.name, error: { name: e.name } }, "No se pudo completar la tarea terminada (se repetirá)"))
    } catch (e) {
      recordJob({ driver: this.driver, queue, ok: false }, Date.now() - t0)
      const msg = (e as Error).message
      if (attempt >= o.maxAttempts) {
        this.o.log?.error({ queue, task: env.name, attempt, error: { message: msg } }, "Tarea fallida: se agotaron los intentos (cola de fallidos)")
        await r.deadLetterMessage(m, { deadLetterReason: "intentos-agotados", deadLetterErrorDescription: msg.slice(0, 200) }).catch(() => r.abandonMessage(m).catch(() => undefined))
        return
      }
      if (stopping()) {
        await r.abandonMessage(m).catch(() => undefined)
        return
      }
      const s = backoffS(attempt, o.retryBaseS, o.retryMaxS)
      this.o.log?.warn({ queue, task: env.name, attempt, retryInS: s, error: { message: msg } }, "Tarea fallida: se reintenta")
      await this.requeue(r, m, { ...env, notBefore: Date.now() + s * 1000 }, attempt + 1, `${env.name}~r${attempt + 1}`)
    }
  }

  /** Copia programada + completar el original; si no se puede, abandon (maxDeliveryCount → DLQ). */
  private async requeue(r: SbReceiver, m: SbReceivedMessage, env: TaskEnvelope, attempt: number, messageId: string) {
    try {
      await this.send({ ...env, attempt }, messageId)
      await r.completeMessage(m)
    } catch (e) {
      this.o.log?.warn({ queue: env.queue, task: env.name, error: { name: (e as Error).name } }, "No se pudo reprogramar la tarea: abandon")
      await r.abandonMessage(m).catch(() => undefined)
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled([...this.senders.values()].map((s) => s.close()))
    this.senders.clear()
    if (this.client) await (await this.client).close().catch(() => undefined)
    await this.dedupe.close()
  }
}
