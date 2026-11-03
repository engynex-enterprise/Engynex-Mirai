// Cloud Tasks por REST (sin @google-cloud/tasks: menos peso en la imagen). El token de acceso sale del servidor de
// metadatos de Cloud Run (cuenta de servicio del servicio). Cada tarea lleva un token OIDC para la cuenta
// TASKS_SERVICE_ACCOUNT con audiencia = API_BASE_URL, que SchedulerGuard valida al recibirla, y el `traceparent` activo
// como encabezado (la traza sigue web → api → tarea). Deduplicación nativa: Cloud Tasks rechaza un nombre repetido (409).
import { GcpMetadata } from "../../adapters/gcp/metadata"
import { countEnqueue } from "../telemetry/metrics"
import { QueuePort, assertTaskName, type EnqueueResult, type QueueName, type Task } from "./queue.port"
import { traceCarrier, traceHeaders } from "./trace"

export type CloudTasksOptions = {
  project: string
  location: string
  serviceAccount: string
  baseUrl: string
  /** Id de la cola en Cloud Tasks por nombre lógico (por defecto, el mismo nombre). */
  queues?: Partial<Record<QueueName, string>>
  fetch?: typeof fetch
  token?: () => Promise<string>
}

export class CloudTasksQueue extends QueuePort {
  readonly driver = "cloudtasks"
  private readonly f: typeof fetch
  private readonly meta: GcpMetadata

  constructor(private readonly o: CloudTasksOptions) {
    super()
    this.f = o.fetch ?? fetch
    this.meta = new GcpMetadata(this.f)
  }

  private token(): Promise<string> {
    return this.o.token ? this.o.token() : this.meta.accessToken()
  }

  async enqueue(t: Task): Promise<EnqueueResult> {
    assertTaskName(t.name)
    const parent = `projects/${this.o.project}/locations/${this.o.location}/queues/${this.o.queues?.[t.queue] ?? t.queue}`
    const task: Record<string, unknown> = {
      httpRequest: {
        url: `${this.o.baseUrl.replace(/\/+$/, "")}${t.path}`,
        httpMethod: "POST",
        headers: { "content-type": "application/json", ...traceHeaders(traceCarrier()), ...(t.name ? { "x-mirai-task": t.name } : {}) },
        body: Buffer.from(JSON.stringify(t.body ?? {})).toString("base64"),
        oidcToken: { serviceAccountEmail: this.o.serviceAccount, audience: this.o.baseUrl },
      },
    }
    if (t.name) task.name = `${parent}/tasks/${t.name}`
    if (t.delayS) task.scheduleTime = new Date(Date.now() + t.delayS * 1000).toISOString()
    const r = await this.f(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
      method: "POST",
      headers: { authorization: `Bearer ${await this.token()}`, "content-type": "application/json" },
      body: JSON.stringify({ task }),
    })
    if (r.status === 409) {
      countEnqueue({ driver: this.driver, queue: t.queue, deduped: true })
      return { name: t.name ?? "", deduped: true }
    }
    if (!r.ok) throw new Error(`Cloud Tasks respondió ${r.status}`)
    const j = (await r.json()) as { name: string }
    countEnqueue({ driver: this.driver, queue: t.queue, deduped: false })
    return { name: j.name.split("/").pop() ?? j.name, deduped: false }
  }
}
