// Secretos portables (V7-F): por defecto solo variables; con SECRETS_SOURCE=gcp|aws|azure se resuelven las referencias
// secret://… antes de loadConfig. Los errores nombran variables, nunca valores. Sin red: fetch y SDK simulados.
import { describe, expect, it, vi } from "vitest"
import { awsSecretResolver } from "../../adapters/aws/secrets"
import { azureSecretResolver } from "../../adapters/azure/secrets"
import { gcpSecretResolver } from "../../adapters/gcp/secrets"
import { resolveSecretRefs, SecretsError, splitRef } from "./secrets"

describe("resolveSecretRefs", () => {
  it("SECRETS_SOURCE=env (por defecto) no toca nada y rechaza referencias sin adaptador", async () => {
    const env = { CRON_SECRET: "valor-normal" }
    expect(await resolveSecretRefs(env)).toEqual([])
    expect(env.CRON_SECRET).toBe("valor-normal")
    await expect(resolveSecretRefs({ ENCRYPTION_KEY: "secret://projects/p/secrets/k" })).rejects.toThrow(/ENCRYPTION_KEY: tiene una referencia secret:\/\/ pero SECRETS_SOURCE=env/)
    await expect(resolveSecretRefs({ SECRETS_SOURCE: "vault", X: "secret://a" })).rejects.toThrow(/SECRETS_SOURCE/)
  })

  it("reemplaza solo las referencias, admite #clave de un JSON y no imprime valores al fallar", async () => {
    const vals: Record<string, string> = { "projects/p/secrets/cron": "cron-123", "projects/p/secrets/json": JSON.stringify({ A: "uno", B: 2 }) }
    const resolver = vi.fn(async (ref: string) => {
      if (!(ref in vals)) throw new Error(`no existe ${ref} VALOR_SECRETO`)
      return vals[ref]
    })
    const env: NodeJS.ProcessEnv = { SECRETS_SOURCE: "gcp", CRON_SECRET: "secret://projects/p/secrets/cron", A: "secret://projects/p/secrets/json#A", B: "secret://projects/p/secrets/json#B", PLANO: "x" }
    expect(await resolveSecretRefs(env, { resolver })).toEqual(["A", "B", "CRON_SECRET"])
    expect(env).toMatchObject({ CRON_SECRET: "cron-123", A: "uno", B: "2", PLANO: "x" })
    try {
      await resolveSecretRefs({ SECRETS_SOURCE: "gcp", MALA: "secret://projects/p/secrets/nada", OTRA: "secret://projects/p/secrets/json#NO" }, { resolver })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(SecretsError)
      expect((e as SecretsError).problems).toEqual([expect.stringMatching(/^MALA: no se pudo leer el secreto de gcp/), expect.stringMatching(/^OTRA: /)])
      expect((e as Error).message).not.toMatch(/VALOR_SECRETO|projects\/p/)
    }
  })

  it("splitRef solo separa una clave con forma de nombre", () => {
    expect(splitRef("arn:aws:secretsmanager:us-east-1:123456789012:secret:mirai#CRON_SECRET")).toEqual({ ref: "arn:aws:secretsmanager:us-east-1:123456789012:secret:mirai", key: "CRON_SECRET" })
    expect(splitRef("projects/p/secrets/s")).toEqual({ ref: "projects/p/secrets/s" })
  })
})

describe("adaptadores de secretos", () => {
  it("gcp: REST de Secret Manager con el token de metadatos; versión latest por defecto; valida el nombre", async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify({ payload: { data: Buffer.from("hola ñ").toString("base64") } })))
    const r = gcpSecretResolver({ fetch: f as never, token: async () => "tok" })
    expect(await r("projects/mirai-pruebas/secrets/cron-secret")).toBe("hola ñ")
    expect(f.mock.calls[0][0]).toBe("https://secretmanager.googleapis.com/v1/projects/mirai-pruebas/secrets/cron-secret/versions/latest:access")
    expect(f.mock.calls[0][1]!.headers).toEqual({ authorization: "Bearer tok" })
    await r("projects/mirai-pruebas/secrets/cron-secret/versions/3")
    expect(f.mock.calls[1][0]).toContain("/versions/3:access")
    await expect(r("https://evil/secrets/x")).rejects.toThrow(/inválida/)
    f.mockImplementationOnce(async () => new Response("{}", { status: 403 }))
    await expect(r("projects/p/secrets/s")).rejects.toThrow(/403/)
  })

  it("aws: región del ARN, SecretString o SecretBinary", async () => {
    const send = vi.fn().mockResolvedValueOnce({ SecretString: "s-1" }).mockResolvedValueOnce({ SecretBinary: new TextEncoder().encode("bin") })
    const r = awsSecretResolver({ send, region: "us-east-2" })
    expect(await r("arn:aws:secretsmanager:sa-east-1:123456789012:secret:mirai/cron-AbCdEf")).toBe("s-1")
    expect(send).toHaveBeenLastCalledWith("sa-east-1", "arn:aws:secretsmanager:sa-east-1:123456789012:secret:mirai/cron-AbCdEf")
    expect(await r("mirai/otro")).toBe("bin")
    expect(send).toHaveBeenLastCalledWith("us-east-2", "mirai/otro")
    await expect(r("no válido con espacios")).rejects.toThrow(/inválida/)
  })

  it("azure: REST de Key Vault con el alcance de la bóveda; solo hosts de Key Vault", async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify({ value: "kv-1" })))
    const token = vi.fn(async () => "aad")
    const r = azureSecretResolver({ fetch: f as never, token })
    expect(await r("https://mirai-kv.vault.azure.net/secrets/cron-secret")).toBe("kv-1")
    expect(f.mock.calls[0][0]).toBe("https://mirai-kv.vault.azure.net/secrets/cron-secret?api-version=7.4")
    expect(token).toHaveBeenCalledWith("https://vault.azure.net/.default")
    await expect(r("https://evil.example.com/secrets/cron")).rejects.toThrow(/inválida/)
    expect(f).toHaveBeenCalledTimes(1)
  })
})
