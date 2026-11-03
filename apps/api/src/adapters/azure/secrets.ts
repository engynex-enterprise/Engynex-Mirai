// SECRETS_SOURCE=azure: Key Vault por REST con un token de DefaultAzureCredential (identidad administrada; rol
// "Key Vault Secrets User"). Referencia: https://<bóveda>.vault.azure.net/secrets/<nombre>[/<versión>]. Solo se aceptan
// hosts de Key Vault: el token nunca sale hacia otro dominio.
import type { SecretResolver } from "../../core/secrets/secrets"

const VAULT = /^https:\/\/[a-z0-9-]{3,24}\.vault\.(?:azure\.net|azure\.cn|usgovcloudapi\.net|microsoftazure\.de)\/secrets\/[A-Za-z0-9-]{1,127}(?:\/[a-f0-9]{32})?$/

export function azureSecretResolver(o: { fetch?: typeof fetch; token?: (scope: string) => Promise<string> } = {}): SecretResolver {
  const f = o.fetch ?? fetch
  const token = o.token ?? (async (scope: string) => (await import("./identity")).azureToken(scope))
  return async (ref) => {
    if (!VAULT.test(ref)) throw new Error("Referencia de Key Vault inválida")
    const r = await f(`${ref}?api-version=7.4`, { headers: { authorization: `Bearer ${await token("https://vault.azure.net/.default")}` }, signal: AbortSignal.timeout(10_000) })
    if (!r.ok) throw new Error(`Key Vault respondió ${r.status}`)
    const j = (await r.json()) as { value?: string }
    if (typeof j.value !== "string") throw new Error("Key Vault no devolvió el valor")
    return j.value
  }
}
