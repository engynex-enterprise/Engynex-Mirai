import { describe, expect, it } from "vitest"
import { ConfigError, loadConfig } from "./config.schema"

const KEY = Buffer.alloc(32, 1).toString("base64")
const base = { SUPABASE_URL: "https://x.supabase.co/", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" }

describe("configuración por entorno (zod)", () => {
  it("local: valores por defecto y respaldo NEXT_PUBLIC_* (.env.local de la web)", () => {
    const c = loadConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" })
    expect(c).toMatchObject({ env: "local", mode: "api", port: 8080, db: { adapter: "supabase" }, webOrigins: ["http://localhost:3000"], docs: true })
    expect(c.auth).toEqual({ jwksUrl: "https://x.supabase.co/auth/v1/.well-known/jwks.json", issuer: "https://x.supabase.co/auth/v1", audience: "authenticated", jwtSecret: undefined })
    expect(c.rateLimit.store).toBe("memory")
  })

  it("pruebas/producción exigen los secretos (Secret Manager) y CORS; el error nombra variables, nunca valores", () => {
    try {
      loadConfig({ ...base, MIRAI_ENV: "produccion", SUPABASE_SECRET_KEY: "sb_secret_NO_DEBE_SALIR" })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError)
      const msg = (e as Error).message
      expect(msg).toMatch(/ENCRYPTION_KEY/)
      expect(msg).toMatch(/WEB_ORIGINS/)
      expect(msg).toMatch(/SCHEDULER_AUDIENCE/)
      expect(msg).not.toContain("NO_DEBE_SALIR")
    }
    const c = loadConfig({ ...base, MIRAI_ENV: "produccion", SUPABASE_SECRET_KEY: "s", ENCRYPTION_KEY: KEY, WEB_ORIGINS: "https://mirai.engynex.com", CRON_SECRET: "c" })
    expect(c).toMatchObject({ docs: false, validateResponses: false, rateLimit: { store: "supabase" }, webOrigins: ["https://mirai.engynex.com"] })
  })

  it("MODE=realtime fuera de local no exige las variables del cron (el gateway no tiene /v1/jobs)", () => {
    const remote = { ...base, MIRAI_ENV: "produccion", SUPABASE_SECRET_KEY: "s", ENCRYPTION_KEY: KEY, WEB_ORIGINS: "https://mirai.engynex.com" }
    expect(loadConfig({ ...remote, MODE: "realtime" })).toMatchObject({ mode: "realtime", scheduler: { cronSecret: undefined, audience: undefined, serviceAccounts: [] } })
    expect(() => loadConfig({ ...remote, MODE: "api" })).toThrow(/SCHEDULER_AUDIENCE/)
    expect(() => loadConfig({ ...base, MIRAI_ENV: "produccion", MODE: "realtime", SUPABASE_SECRET_KEY: "s", ENCRYPTION_KEY: KEY })).toThrow(/WEB_ORIGINS/)
  })

  it("valida ENCRYPTION_KEY, PORT y combinaciones (pg sin DATABASE_URL, Cloud Tasks sin proyecto)", () => {
    expect(() => loadConfig({ ...base, ENCRYPTION_KEY: "corta" })).toThrow(/32 bytes/)
    expect(() => loadConfig({ ...base, PORT: "99999" })).toThrow(ConfigError)
    expect(() => loadConfig({ ...base, DB_ADAPTER: "pg" })).toThrow(/DATABASE_URL/)
    expect(() => loadConfig({ ...base, QUEUE_DRIVER: "cloudtasks" })).toThrow(/GCP_PROJECT/)
    expect(() => loadConfig({ ...base, IDEMPOTENCY_STORE: "supabase" })).toThrow(/SUPABASE_SECRET_KEY/)
    expect(() => loadConfig({})).toThrow(/SUPABASE_URL/)
  })

  it("listas separadas por coma y booleanos", () => {
    const c = loadConfig({ ...base, WEB_ORIGINS: " https://a.co , https://b.co ", SCHEDULER_SERVICE_ACCOUNTS: "x@y.iam.gserviceaccount.com", DOCS: "0" })
    expect(c.webOrigins).toEqual(["https://a.co", "https://b.co"])
    expect(c.scheduler.serviceAccounts).toEqual(["x@y.iam.gserviceaccount.com"])
    expect(c.docs).toBe(false)
  })
})

describe("V7-F: colas portables, trabajador, emisor OIDC genérico y secretos", () => {
  const sqsUrls = { QUEUE_NOTIFY: "https://sqs.us-east-1.amazonaws.com/123456789012/mirai-notify", QUEUE_AUTOMATIONS: "https://sqs.us-east-1.amazonaws.com/123456789012/mirai-automations.fifo", QUEUE_SLOW: "https://sqs.us-east-1.amazonaws.com/123456789012/mirai-slow" }

  it("por defecto: inline, deduplicación en memoria, despacho con CRON_SECRET y secretos solo de variables", () => {
    const c = loadConfig(base)
    expect(c.queue).toMatchObject({ driver: "inline", queues: { notify: undefined, automations: undefined, slow: undefined }, dedupe: { store: "memory", ttlS: 86_400 } })
    expect(c.tasks).toMatchObject({ auth: "secret", timeoutS: 300, maxAttempts: 5, retryBaseS: 10, retryMaxS: 900 })
    expect(c.worker).toEqual({ queues: ["notify", "automations", "slow"], concurrency: 4, shutdownS: 25 })
    expect(c.secretsSource).toBe("env")
    expect(c.scheduler.oidc).toBeUndefined()
  })

  it("sqs: una URL por cola, región de la URL o AWS_REGION", () => {
    expect(() => loadConfig({ ...base, QUEUE_DRIVER: "sqs" })).toThrow(/QUEUE_NOTIFY[\s\S]*QUEUE_AUTOMATIONS[\s\S]*QUEUE_SLOW/)
    expect(() => loadConfig({ ...base, QUEUE_DRIVER: "sqs", ...sqsUrls, QUEUE_SLOW: "mirai-slow" })).toThrow(/QUEUE_SLOW debe ser la URL/)
    const c = loadConfig({ ...base, QUEUE_DRIVER: "sqs", ...sqsUrls })
    expect(c.queue).toMatchObject({ driver: "sqs", queues: { notify: sqsUrls.QUEUE_NOTIFY, automations: sqsUrls.QUEUE_AUTOMATIONS } })
    const local = { QUEUE_NOTIFY: "http://localhost:9324/000000000000/notify", QUEUE_AUTOMATIONS: "http://localhost:9324/000000000000/a", QUEUE_SLOW: "http://localhost:9324/000000000000/s" }
    expect(() => loadConfig({ ...base, QUEUE_DRIVER: "sqs", ...local, SQS_ENDPOINT: "http://localhost:9324" })).toThrow(/AWS_REGION/)
    expect(loadConfig({ ...base, QUEUE_DRIVER: "sqs", ...local, SQS_ENDPOINT: "http://localhost:9324", AWS_REGION: "us-east-1" }).queue.sqs).toEqual({ endpoint: "http://localhost:9324", region: "us-east-1" })
  })

  it("servicebus: espacio de nombres (identidad administrada) o cadena de conexión; nombres por defecto", () => {
    expect(() => loadConfig({ ...base, QUEUE_DRIVER: "servicebus" })).toThrow(/SERVICEBUS_NAMESPACE/)
    const c = loadConfig({ ...base, QUEUE_DRIVER: "servicebus", SERVICEBUS_NAMESPACE: "mirai.servicebus.windows.net", QUEUE_SLOW: "mirai-lenta" })
    expect(c.queue).toMatchObject({ servicebus: { namespace: "mirai.servicebus.windows.net" }, queues: { slow: "mirai-lenta" } })
  })

  it("MODE=worker: solo colas de extracción, destino y credencial; no pide Supabase ni CORS", () => {
    const w = { MODE: "worker", MIRAI_ENV: "produccion", QUEUE_DRIVER: "sqs", ...sqsUrls }
    expect(() => loadConfig({ ...w, QUEUE_DRIVER: "inline" })).toThrow(/MODE=worker consume colas de extracción/)
    expect(() => loadConfig(w)).toThrow(/TASKS_TARGET_URL[\s\S]*CRON_SECRET/)
    const c = loadConfig({ ...w, API_BASE_URL: "https://api.mirai.test/", CRON_SECRET: "c", WORKER_QUEUES: "notify, slow", WORKER_CONCURRENCY: "8" })
    expect(c).toMatchObject({ mode: "worker", tasks: { targetUrl: "https://api.mirai.test", audience: "https://api.mirai.test" }, worker: { queues: ["notify", "slow"], concurrency: 8 } })
    expect(() => loadConfig({ ...w, API_BASE_URL: "https://api.mirai.test", CRON_SECRET: "c", WORKER_QUEUES: "otra" })).toThrow(/cola desconocida/)
  })

  it("TASKS_AUTH: azure necesita audiencia; client_credentials necesita emisor, id y secreto (que no sale en el error)", () => {
    const h = { ...base, QUEUE_DRIVER: "http", TASKS_TARGET_URL: "https://api.mirai.test" }
    expect(() => loadConfig(h)).toThrow(/CRON_SECRET/)
    expect(() => loadConfig({ ...h, TASKS_AUTH: "azure" })).toThrow(/TASKS_AUDIENCE/)
    expect(loadConfig({ ...h, TASKS_AUTH: "gcp" }).tasks).toMatchObject({ auth: "gcp", audience: "https://api.mirai.test" })
    try {
      loadConfig({ ...h, TASKS_AUTH: "client_credentials", TASKS_CLIENT_SECRET: "NO_DEBE_SALIR" })
      expect.unreachable()
    } catch (e) {
      expect((e as Error).message).toMatch(/TASKS_TOKEN_URL[\s\S]*TASKS_CLIENT_ID/)
      expect((e as Error).message).not.toContain("NO_DEBE_SALIR")
    }
    expect(() => loadConfig({ ...base, TASKS_RETRY_BASE_S: "100", TASKS_RETRY_MAX_S: "10" })).toThrow(/TASKS_RETRY_BASE_S/)
    expect(() => loadConfig({ ...base, QUEUE_DEDUPE: "redis" })).toThrow(/REDIS_URL/)
  })

  it("emisor OIDC genérico: emisor + principales; sirve como credencial del cron fuera de local", () => {
    expect(() => loadConfig({ ...base, SCHEDULER_OIDC_ISSUER: "https://login.microsoftonline.com/t/v2.0" })).toThrow(/SCHEDULER_OIDC_PRINCIPALS/)
    expect(() => loadConfig({ ...base, SCHEDULER_OIDC_PRINCIPALS: "abc" })).toThrow(/SCHEDULER_OIDC_ISSUER/)
    const remote = { ...base, MIRAI_ENV: "produccion", SUPABASE_SECRET_KEY: "s", ENCRYPTION_KEY: KEY, WEB_ORIGINS: "https://mirai.engynex.com" }
    const c = loadConfig({ ...remote, SCHEDULER_OIDC_ISSUER: "https://sts.windows.net/t/", SCHEDULER_OIDC_AUDIENCE: "api://mirai", SCHEDULER_OIDC_PRINCIPALS: "oid-1, oid-2" })
    expect(c.scheduler.oidc).toEqual({ issuer: "https://sts.windows.net/t/", jwksUrl: undefined, audience: ["api://mirai"], principals: ["oid-1", "oid-2"] })
  })

  it("SECRETS_SOURCE solo acepta env, gcp, aws o azure", () => {
    expect(loadConfig({ ...base, SECRETS_SOURCE: "aws" }).secretsSource).toBe("aws")
    expect(() => loadConfig({ ...base, SECRETS_SOURCE: "vault" })).toThrow(/SECRETS_SOURCE/)
  })
})
