// Elige el adaptador de la cola según QUEUE_DRIVER (lo usan CoreModule para encolar y el proceso MODE=worker para
// consumir). Los SDK de nube viven en src/adapters/<nube>/** y se cargan solo si se eligen.
import type { Logger } from "pino"
import { SqsQueue } from "../../adapters/aws/sqs.queue"
import { ServiceBusQueue } from "../../adapters/azure/service-bus.queue"
import type { Config } from "../config/config.schema"
import { CloudTasksQueue } from "./cloud-tasks.queue"
import type { QueueConsumer } from "./consumer.port"
import { DedupeStore, MemoryDedupeStore, NoDedupeStore, RedisDedupeStore } from "./dedupe"
import { TaskDispatcher, tokenSource, type TasksAuthConfig } from "./dispatch"
import { HttpQueue } from "./http.queue"
import { httpDispatch, InlineQueue } from "./inline.queue"
import type { QueuePort } from "./queue.port"

export function dedupeStore(config: Config, log?: Logger): DedupeStore {
  const d = config.queue.dedupe
  if (d.store === "redis") return new RedisDedupeStore(d.redisUrl!, log)
  if (d.store === "none") return new NoDedupeStore()
  return new MemoryDedupeStore()
}

export function tasksAuth(config: Config): TasksAuthConfig {
  const t = config.tasks
  switch (t.auth) {
    case "gcp":
      return { kind: "gcp", audience: t.audience! }
    case "azure":
      return { kind: "azure", audience: t.audience! }
    case "client_credentials":
      return { kind: "client_credentials", tokenUrl: t.tokenUrl!, clientId: t.clientId!, clientSecret: t.clientSecret!, scope: t.scope }
    default:
      return { kind: "secret", secret: config.scheduler.cronSecret }
  }
}

/** Despachador HTTP a /v1/jobs/** (trabajador y QUEUE_DRIVER=http). */
export function createDispatcher(config: Config, f?: typeof fetch): TaskDispatcher {
  return new TaskDispatcher({ baseUrl: config.tasks.targetUrl!, token: tokenSource(tasksAuth(config), f), timeoutS: config.tasks.timeoutS, fetch: f })
}

function pull(config: Config, log?: Logger): SqsQueue | ServiceBusQueue | undefined {
  const q = config.queue
  const common = { dedupe: dedupeStore(config, log), dedupeTtlS: q.dedupe.ttlS, log }
  if (q.driver === "sqs") return new SqsQueue({ ...common, urls: q.queues, region: q.sqs.region, endpoint: q.sqs.endpoint })
  if (q.driver === "servicebus") return new ServiceBusQueue({ ...common, namespace: q.servicebus.namespace, connectionString: q.servicebus.connectionString, queues: q.queues })
  return undefined
}

/** Cola para encolar desde la API. */
export function createQueue(config: Config, log?: Logger): QueuePort {
  const q = config.queue
  if (q.driver === "cloudtasks") return new CloudTasksQueue({ project: q.project!, location: q.location, serviceAccount: q.serviceAccount!, baseUrl: q.baseUrl!, queues: q.queues })
  const p = pull(config, log)
  if (p) return p
  if (q.driver === "http") {
    const t = config.tasks
    return new HttpQueue({ dispatcher: createDispatcher(config), dedupe: dedupeStore(config, log), dedupeTtlS: q.dedupe.ttlS, maxAttempts: t.maxAttempts, retryBaseS: t.retryBaseS, retryMaxS: t.retryMaxS, log })
  }
  const secret = config.scheduler.cronSecret
  return new InlineQueue(secret ? httpDispatch(q.baseUrl ?? `http://127.0.0.1:${config.port}`, secret) : undefined)
}

/** Consumidor para MODE=worker (solo colas de extracción). */
export function createConsumer(config: Config, log?: Logger): QueueConsumer {
  const p = pull(config, log)
  if (!p) throw new Error(`MODE=worker no sirve con QUEUE_DRIVER=${config.queue.driver} (usa sqs o servicebus)`)
  return p
}
