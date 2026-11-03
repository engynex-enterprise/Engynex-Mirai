// SECRETS_SOURCE=aws: Secrets Manager con @aws-sdk/client-secrets-manager (carga perezosa) y la cadena estándar de
// credenciales (rol de la tarea; permiso secretsmanager:GetSecretValue, y kms:Decrypt si la llave es propia).
// Referencia: ARN (arn:aws:secretsmanager:<región>:<cuenta>:secret:<nombre>) o nombre (usa AWS_REGION).
import type { SecretsManagerClient } from "@aws-sdk/client-secrets-manager"
import type { SecretResolver } from "../../core/secrets/secrets"

const ARN = /^arn:aws[a-z-]*:secretsmanager:([a-z0-9-]+):\d{12}:secret:[A-Za-z0-9/_+=.@-]+$/
const NAME = /^[A-Za-z0-9/_+=.@-]{1,512}$/

type Send = (region: string | undefined, secretId: string) => Promise<{ SecretString?: string; SecretBinary?: Uint8Array }>

export function awsSecretResolver(o: { send?: Send; region?: string } = {}): SecretResolver {
  const clients = new Map<string, Promise<{ c: SecretsManagerClient; cmd: typeof import("@aws-sdk/client-secrets-manager").GetSecretValueCommand }>>()
  const send: Send =
    o.send ??
    (async (region, id) => {
      const k = region ?? ""
      if (!clients.has(k)) clients.set(k, import("@aws-sdk/client-secrets-manager").then((m) => ({ c: new m.SecretsManagerClient(region ? { region } : {}), cmd: m.GetSecretValueCommand })))
      const { c, cmd } = await clients.get(k)!
      return c.send(new cmd({ SecretId: id }))
    })
  return async (ref) => {
    const arn = ARN.exec(ref)
    if (!arn && !NAME.test(ref)) throw new Error("Referencia de Secrets Manager inválida")
    const r = await send(arn?.[1] ?? o.region ?? process.env.AWS_REGION, ref)
    if (typeof r.SecretString === "string") return r.SecretString
    if (r.SecretBinary) return Buffer.from(r.SecretBinary).toString("utf8")
    throw new Error("Secrets Manager no devolvió datos")
  }
}
