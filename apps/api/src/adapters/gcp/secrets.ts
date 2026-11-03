// SECRETS_SOURCE=gcp: Secret Manager por REST con el token del servidor de metadatos (cuenta de servicio del servicio,
// rol roles/secretmanager.secretAccessor). Sin SDK. Referencia: projects/<p>/secrets/<s>[/versions/<v>] (por defecto latest).
import type { SecretResolver } from "../../core/secrets/secrets"
import { GcpMetadata } from "./metadata"

const NAME = /^projects\/[a-z0-9-]{1,64}\/secrets\/[A-Za-z0-9_-]{1,255}(?:\/versions\/(?:latest|\d+))?$/

export function gcpSecretResolver(o: { fetch?: typeof fetch; token?: () => Promise<string> } = {}): SecretResolver {
  const f = o.fetch ?? fetch
  const meta = new GcpMetadata(f)
  const token = o.token ?? (() => meta.accessToken())
  return async (ref) => {
    if (!NAME.test(ref)) throw new Error("Referencia de Secret Manager inválida")
    const name = ref.includes("/versions/") ? ref : `${ref}/versions/latest`
    const r = await f(`https://secretmanager.googleapis.com/v1/${name}:access`, { headers: { authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(10_000) })
    if (!r.ok) throw new Error(`Secret Manager respondió ${r.status}`)
    const j = (await r.json()) as { payload?: { data?: string } }
    if (typeof j.payload?.data !== "string") throw new Error("Secret Manager no devolvió datos")
    return Buffer.from(j.payload.data, "base64").toString("utf8")
  }
}
