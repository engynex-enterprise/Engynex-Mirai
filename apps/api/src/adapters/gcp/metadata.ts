// Servidor de metadatos de GCP (Cloud Run, GKE, GCE): token de acceso y token de identidad (OIDC) de la cuenta de servicio
// del servicio, sin llaves ni SDK. Lo usan Cloud Tasks, Secret Manager y el despacho de tareas con TASKS_AUTH=gcp.
const BASE = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default"

type Cached = { token: string; exp: number }

export class GcpMetadata {
  private access?: Cached
  private readonly ids = new Map<string, Cached>()

  constructor(private readonly f: typeof fetch = fetch) {}

  /** Token de acceso OAuth2 (Authorization: Bearer para las API de Google). */
  async accessToken(): Promise<string> {
    if (this.access && this.access.exp > Date.now() + 60_000) return this.access.token
    const r = await this.f(`${BASE}/token`, { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(5_000) })
    if (!r.ok) throw new Error(`Servidor de metadatos: ${r.status}`)
    const j = (await r.json()) as { access_token: string; expires_in: number }
    this.access = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 }
    return j.access_token
  }

  /** Token de identidad (JWT de Google firmado para `audience`), el mismo que manda Cloud Tasks/Scheduler. */
  async identityToken(audience: string): Promise<string> {
    const c = this.ids.get(audience)
    if (c && c.exp > Date.now() + 60_000) return c.token
    const r = await this.f(`${BASE}/identity?audience=${encodeURIComponent(audience)}&format=full`, { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(5_000) })
    if (!r.ok) throw new Error(`Servidor de metadatos (identidad): ${r.status}`)
    const token = (await r.text()).trim()
    this.ids.set(audience, { token, exp: jwtExp(token) ?? Date.now() + 50 * 60_000 })
    return token
  }
}

/** Vencimiento (ms) de un JWT sin verificarlo (solo para la caché). */
export function jwtExp(token: string): number | undefined {
  try {
    const p = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: number }
    return typeof p.exp === "number" ? p.exp * 1000 : undefined
  } catch {
    return undefined
  }
}

let shared: GcpMetadata | undefined
/** Instancia compartida (una caché de tokens por proceso). */
export const gcpMetadata = () => (shared ??= new GcpMetadata())
