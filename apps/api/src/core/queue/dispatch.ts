// Despacho HTTP de una tarea a su trabajador (/v1/jobs/** de la API), lo mismo que hace Cloud Tasks: POST con el cuerpo,
// la traza y una credencial que SchedulerGuard acepta. Lo usan el proceso MODE=worker (SQS, Service Bus) y QUEUE_DRIVER=http.
// Credenciales (TASKS_AUTH):
//  - secret (por defecto): Bearer CRON_SECRET.
//  - gcp: token de identidad del servidor de metadatos para TASKS_AUDIENCE (la API lo valida como OIDC de Google).
//  - azure: token de Entra de la identidad administrada para `${TASKS_AUDIENCE}/.default` (emisor OIDC configurable).
//  - client_credentials: OAuth2 genérico (Cognito, Entra con secreto, Keycloak…) con TASKS_TOKEN_URL/CLIENT_ID/SECRET/SCOPE.
import { traceHeaders, type TraceCarrier } from "./trace"

export type TasksAuthConfig =
  | { kind: "secret"; secret?: string }
  | { kind: "gcp"; audience: string }
  | { kind: "azure"; audience: string }
  | { kind: "client_credentials"; tokenUrl: string; clientId: string; clientSecret: string; scope?: string }

/** Devuelve el valor del Bearer para la próxima llamada. */
export type TokenSource = () => Promise<string>

export function tokenSource(a: TasksAuthConfig, f: typeof fetch = fetch): TokenSource {
  switch (a.kind) {
    case "secret":
      return async () => {
        if (!a.secret) throw new Error("Falta CRON_SECRET para despachar tareas")
        return a.secret
      }
    case "gcp":
      return async () => (await import("../../adapters/gcp/metadata")).gcpMetadata().identityToken(a.audience)
    case "azure":
      return async () => (await import("../../adapters/azure/identity")).azureToken(`${a.audience.replace(/\/+$/, "")}/.default`)
    case "client_credentials": {
      let cached: { token: string; exp: number } | undefined
      return async () => {
        if (cached && cached.exp > Date.now() + 60_000) return cached.token
        const body = new URLSearchParams({ grant_type: "client_credentials", ...(a.scope ? { scope: a.scope } : {}) })
        const r = await f(a.tokenUrl, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${encodeURIComponent(a.clientId)}:${encodeURIComponent(a.clientSecret)}`).toString("base64")}` },
          body,
          signal: AbortSignal.timeout(10_000),
        })
        if (!r.ok) throw new Error(`El emisor de tokens respondió ${r.status}`)
        const j = (await r.json()) as { access_token?: string; expires_in?: number }
        if (!j.access_token) throw new Error("El emisor de tokens no devolvió access_token")
        cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 300) * 1000 }
        return j.access_token
      }
    }
  }
}

/** Error del trabajador remoto (status HTTP) o de red (status 0). Nunca lleva el cuerpo de la respuesta. */
export class DispatchError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export type DispatchInput = TraceCarrier & { name: string; path: string; body?: unknown; attempt?: number }

export class TaskDispatcher {
  constructor(
    private readonly o: { baseUrl: string; token: TokenSource; timeoutS: number; fetch?: typeof fetch },
  ) {}

  /** POST al trabajador. Lanza DispatchError si no responde 2xx (el que llama decide si reintenta). */
  async dispatch(t: DispatchInput, signal?: AbortSignal): Promise<number> {
    const f = this.o.fetch ?? fetch
    const timeout = AbortSignal.timeout(this.o.timeoutS * 1000)
    let r: Response
    try {
      r = await f(`${this.o.baseUrl.replace(/\/+$/, "")}${t.path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await this.o.token()}`,
          "x-mirai-task": t.name,
          ...(t.attempt ? { "x-mirai-attempt": String(t.attempt) } : {}),
          ...traceHeaders(t),
        },
        body: JSON.stringify(t.body ?? {}),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
    } catch (e) {
      throw new DispatchError(0, `No se pudo llamar al trabajador: ${(e as Error).name}`)
    }
    // Se lee (y descarta) el cuerpo para liberar la conexión.
    await r.arrayBuffer().catch(() => undefined)
    if (!r.ok) throw new DispatchError(r.status, `El trabajador respondió ${r.status}`)
    return r.status
  }
}
