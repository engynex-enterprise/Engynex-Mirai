// Secretos (D8, §3.0 regla 2). Por defecto (SECRETS_SOURCE=env) la API solo lee variables de entorno: la plataforma las
// inyecta desde su gestor (Secret Manager → Cloud Run --set-secrets, Secrets Manager → ECS `secrets`, Key Vault →
// Container Apps `secretRef`). Adaptador OPCIONAL, apagado por defecto: con SECRETS_SOURCE=gcp|aws|azure, antes de
// loadConfig() se reemplaza cada variable cuyo valor sea una referencia `secret://…` por el valor del gestor, leído con la
// identidad de la plataforma (sin llaves):
//   gcp   secret://projects/<p>/secrets/<s>[/versions/<v>]            (REST de Secret Manager + servidor de metadatos)
//   aws   secret://arn:aws:secretsmanager:<región>:<cuenta>:secret:<n>  (o el nombre; @aws-sdk/client-secrets-manager)
//   azure secret://https://<bóveda>.vault.azure.net/secrets/<n>[/<versión>]  (@azure/identity + REST de Key Vault)
// Sufijo opcional `#clave` para sacar un campo de un secreto JSON (p. ej. secret://arn:…:secret:mirai#CRON_SECRET).
// Nunca se imprimen valores: los errores solo nombran la variable.
export const SECRET_REF = "secret://"

export type SecretsSource = "env" | "gcp" | "aws" | "azure"
const SOURCES: SecretsSource[] = ["env", "gcp", "aws", "azure"]

/** Lee una referencia (sin el prefijo secret:// ni el #clave) y devuelve el valor en texto. */
export type SecretResolver = (ref: string) => Promise<string>

export class SecretsError extends Error {
  constructor(readonly problems: string[]) {
    super(`Secretos sin resolver:\n${problems.map((p) => `  - ${p}`).join("\n")}`)
  }
}

async function loadResolver(source: Exclude<SecretsSource, "env">): Promise<SecretResolver> {
  if (source === "gcp") return (await import("../../adapters/gcp/secrets")).gcpSecretResolver()
  if (source === "aws") return (await import("../../adapters/aws/secrets")).awsSecretResolver()
  return (await import("../../adapters/azure/secrets")).azureSecretResolver()
}

/** Separa `ref#clave` (la clave solo si parece un nombre de campo). */
export function splitRef(raw: string): { ref: string; key?: string } {
  const i = raw.lastIndexOf("#")
  if (i > 0 && /^[A-Za-z0-9_.-]{1,128}$/.test(raw.slice(i + 1))) return { ref: raw.slice(0, i), key: raw.slice(i + 1) }
  return { ref: raw }
}

function pick(value: string, key: string | undefined): string {
  if (!key) return value
  const j = JSON.parse(value) as Record<string, unknown>
  const v = j?.[key]
  if (v === undefined || v === null) throw new Error("El secreto JSON no tiene esa clave")
  return typeof v === "string" ? v : JSON.stringify(v)
}

/**
 * Resuelve las referencias `secret://` de `env` (lo modifica). Devuelve los nombres de las variables resueltas.
 * Lanza SecretsError con nombres de variables (nunca valores ni detalles del secreto).
 */
export async function resolveSecretRefs(env: NodeJS.ProcessEnv = process.env, o: { source?: string; resolver?: SecretResolver; concurrency?: number } = {}): Promise<string[]> {
  const source = (o.source ?? env.SECRETS_SOURCE ?? "env").trim() || "env"
  if (!SOURCES.includes(source as SecretsSource)) throw new SecretsError([`SECRETS_SOURCE: debe ser env, gcp, aws o azure`])
  const refs = Object.entries(env).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].startsWith(SECRET_REF))
  if (!refs.length) return []
  if (source === "env") throw new SecretsError(refs.map(([k]) => `${k}: tiene una referencia secret:// pero SECRETS_SOURCE=env (inyecta el valor o elige gcp, aws o azure)`))
  let resolver: SecretResolver
  try {
    resolver = o.resolver ?? (await loadResolver(source as Exclude<SecretsSource, "env">))
  } catch {
    throw new SecretsError([`SECRETS_SOURCE=${source}: no se pudo cargar el adaptador`])
  }
  const failed: string[] = []
  const queue = [...refs]
  const work = async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      const [name, value] = e
      try {
        const { ref, key } = splitRef(value.slice(SECRET_REF.length))
        env[name] = pick(await resolver(ref), key)
      } catch {
        failed.push(`${name}: no se pudo leer el secreto de ${source} (revisa la referencia y el permiso de la identidad)`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(o.concurrency ?? 8, refs.length) }, work))
  if (failed.length) throw new SecretsError(failed.sort())
  return refs.map(([k]) => k).sort()
}
