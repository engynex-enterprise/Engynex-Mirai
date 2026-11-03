// Cloud Tasks por REST (sin @google-cloud/tasks: menos peso en la imagen). El token de acceso sale del servidor de
// metadatos de Cloud Run (cuenta de servicio del servicio). Cada tarea lleva un token OIDC para la cuenta
// TASKS_SERVICE_ACCOUNT con audiencia = API_BASE_URL, que SchedulerGuard valida al recibirla.
import { QueuePort, TASK_NAME_RE, type EnqueueResult, type Task } from "./queue.port"

export type CloudTasksOptions = { project: string; location: string; serviceAccount: string; baseUrl: string; fetch?: typeof fetch; token?: () => Promise<string> }

const META = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"

export class CloudTasksQueue extends QueuePort {
  private cached?: { token: string; exp: number }
  private readonly f: typeof fetch

  constructor(private readonly o: CloudTasksOptions) {
    super()
    this.f = o.fetch ?? fetch
  }

  private async token(): Promise<string> {
    if (this.o.token) return this.o.token()
    if (this.cached && this.cached.exp > Date.now() + 60_000) return this.cached.token
    const r = await this.f(META, { headers: { "Metadata-Flavor": "Google" } })
    if (!r.ok) throw new Error(`Servidor de metadatos: ${r.status}`)
    const j = (await r.json()) as { access_token: string; expires_in: number }
    this.cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 }
    return j.access_token
  }

  async enqueue(t: Task): Promise<EnqueueResult> {
    if (t.name && !TASK_NAME_RE.test(t.name)) throw new Error(`Nombre de tarea inválido: ${t.name}`)
    const parent = `projects/${this.o.project}/locations/${this.o.location}/queues/${t.queue}`
    const task: Record<string, unknown> = {
      httpRequest: {
        url: `${this.o.baseUrl.replace(/\/+$/, "")}${t.path}`,
        httpMethod: "POST",
        headers: { "content-type": "application/json" },
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
    if (r.status === 409) return { name: t.name ?? "", deduped: true }
    if (!r.ok) throw new Error(`Cloud Tasks respondió ${r.status}`)
    const j = (await r.json()) as { name: string }
    return { name: j.name.split("/").pop() ?? j.name, deduped: false }
  }
}
