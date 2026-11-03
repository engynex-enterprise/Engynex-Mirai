// Configuración de la API validada con zod (§2.7.9). Se lee una sola vez al arrancar desde process.env: en Cloud Run
// las variables públicas van como variables normales y los secretos se montan desde Secret Manager (--set-secrets).
// Si algo falta o está mal, la API no arranca y el mensaje dice QUÉ variable (nunca su valor).
import { z } from "zod"
import { isValidKey } from "@mirai/crypto"

const bool = (def: boolean) =>
  z
    .enum(["1", "0", "true", "false", "si", "no", ""])
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : v === "1" || v === "true" || v === "si"))
const list = z
  .string()
  .optional()
  .transform((v) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean))
const url = z.url({ error: "Debe ser una URL (https://…)" })
const opt = z.string().trim().min(1).optional()

/** Variables que entiende la API. Los nombres NEXT_PUBLIC_* sirven de respaldo para desarrollo local (.env.local). */
export const EnvSchema = z
  .object({
    MIRAI_ENV: z.enum(["local", "pruebas", "produccion"]).default("local"),
    /** worker (V7-F): consume las colas de extracción (sqs, servicebus) y despacha cada tarea por HTTP a /v1/jobs/**. */
    MODE: z.enum(["api", "realtime", "worker"]).default("api"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    HOST: z.string().default("0.0.0.0"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

    SUPABASE_URL: url.optional(),
    NEXT_PUBLIC_SUPABASE_URL: url.optional(),
    SUPABASE_PUBLISHABLE_KEY: opt,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: opt,
    /** Secret Manager. Salta RLS: solo SystemScope (cron, webhooks, límites de tasa…). */
    SUPABASE_SECRET_KEY: opt,
    /** Secret Manager. Solo si el proyecto aún firma con HS256 (hoy firma con ES256 y se valida con JWKS). */
    SUPABASE_JWT_SECRET: opt,
    AUTH_JWKS_URL: url.optional(),
    AUTH_ISSUER: z.string().optional(),
    AUTH_AUDIENCE: z.string().default("authenticated"),

    /** Secret Manager. 32 bytes en base64. NUNCA cambiarla en un despliegue existente. */
    ENCRYPTION_KEY: z.string().optional().refine((v) => v === undefined || isValidKey(v), "ENCRYPTION_KEY debe tener 32 bytes en base64"),

    /** Secret Manager (transición): Bearer que hoy usa el cron de Vercel y pg_cron. */
    CRON_SECRET: opt,
    /** Audiencia del token OIDC de Cloud Scheduler / Cloud Tasks (la URL del servicio). */
    SCHEDULER_AUDIENCE: opt,
    /** Cuentas de servicio que pueden llamar a /v1/jobs/** (p. ej. mirai-scheduler@<proyecto>.iam.gserviceaccount.com). */
    SCHEDULER_SERVICE_ACCOUNTS: list,

    /** Orígenes del front permitidos por CORS (coma). Acepta un `*` como comodín: https://engynex-mirai-*.vercel.app */
    WEB_ORIGINS: list,

    DB_ADAPTER: z.enum(["supabase", "pg", "postgrest"]).default("supabase"),
    /** Secret Manager (fase 4, Cloud SQL). */
    DATABASE_URL: opt,
    /** v7 (V7-D): PostgREST interno (solo tráfico interno) para DB_ADAPTER=postgrest. */
    POSTGREST_URL: url.optional(),
    /** Secret Manager (V7-D). HS256, 32+ caracteres: lo conocen solo la API y PostgREST (PGRST_JWT_SECRET). */
    POSTGREST_JWT_SECRET: z.string().min(32, "POSTGREST_JWT_SECRET debe tener 32 caracteres o más").optional(),

    RATE_LIMIT_STORE: z.enum(["memory", "supabase"]).optional(),
    /** Peticiones por minuto por persona (o IP) en cada instancia, en memoria (no toca la base). */
    RATE_LIMIT_DEFAULT_PER_MIN: z.coerce.number().int().min(1).default(300),
    /** `supabase` necesita la migración 20261103003800_api_idempotency.sql aplicada. */
    IDEMPOTENCY_STORE: z.enum(["memory", "supabase"]).default("memory"),

    QUEUE_DRIVER: z.enum(["inline", "cloudtasks", "sqs", "servicebus", "http"]).default("inline"),
    GCP_PROJECT: opt,
    GCP_LOCATION: z.string().default("us-west1"),
    TASKS_SERVICE_ACCOUNT: opt,
    /** URL pública de esta API (Cloud Tasks la llama de vuelta). */
    API_BASE_URL: url.optional(),

    // ── V7-F: colas portables, trabajador, emisor OIDC genérico y secretos (core/queue, src/worker, core/secrets) ──
    /** Cola por nombre lógico: URL en SQS, nombre en Service Bus, id en Cloud Tasks (por defecto notify/automations/slow). */
    QUEUE_NOTIFY: opt,
    QUEUE_AUTOMATIONS: opt,
    QUEUE_SLOW: opt,
    /** Deduplicación por nombre del lado del que encola (sqs, servicebus, http): memory (por instancia) | redis | none. */
    QUEUE_DEDUPE: z.enum(["memory", "redis", "none"]).default("memory"),
    QUEUE_DEDUPE_TTL_S: z.coerce.number().int().min(60).max(30 * 86_400).default(86_400),
    /** QUEUE_DEDUPE=redis (la misma de tiempo real sirve). */
    REDIS_URL: z.string().regex(/^rediss?:\/\//, "Debe empezar por redis:// o rediss://").optional(),
    /** SQS: endpoint propio (ElasticMQ, LocalStack). La región sale de la URL de la cola o de AWS_REGION. */
    SQS_ENDPOINT: url.optional(),
    AWS_REGION: opt,
    /** Service Bus con identidad administrada: <espacio>.servicebus.windows.net */
    SERVICEBUS_NAMESPACE: opt,
    /** Secreto. Alternativa a SERVICEBUS_NAMESPACE (cadena de conexión con SAS). */
    SERVICEBUS_CONNECTION_STRING: opt,
    /** A dónde despachan las tareas el trabajador y QUEUE_DRIVER=http (por defecto API_BASE_URL). */
    TASKS_TARGET_URL: url.optional(),
    /** Credencial del despacho: secret (Bearer CRON_SECRET) | gcp (identidad del servidor de metadatos) | azure (identidad administrada) | client_credentials (OAuth2). */
    TASKS_AUTH: z.enum(["secret", "gcp", "azure", "client_credentials"]).default("secret"),
    /** gcp: audiencia del token (por defecto la URL de destino). azure: recurso de la app de Entra (api://…). */
    TASKS_AUDIENCE: opt,
    TASKS_TOKEN_URL: url.optional(),
    TASKS_CLIENT_ID: opt,
    /** Secreto (TASKS_AUTH=client_credentials). */
    TASKS_CLIENT_SECRET: opt,
    TASKS_SCOPE: opt,
    TASKS_TIMEOUT_S: z.coerce.number().int().min(5).max(3_600).default(300),
    TASKS_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(5),
    TASKS_RETRY_BASE_S: z.coerce.number().int().min(1).max(3_600).default(10),
    TASKS_RETRY_MAX_S: z.coerce.number().int().min(1).max(43_200).default(900),
    /** MODE=worker: colas a consumir (coma; por defecto las tres). */
    WORKER_QUEUES: list,
    /** MODE=worker: tareas a la vez por cola. */
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
    /** MODE=worker: segundos para terminar lo que está en curso al recibir SIGTERM. */
    WORKER_SHUTDOWN_S: z.coerce.number().int().min(1).max(600).default(25),
    /** Emisor OIDC genérico para /v1/jobs/** (Azure Entra, Cognito, Keycloak…), además del de Google. */
    SCHEDULER_OIDC_ISSUER: url.optional(),
    /** JWKS fijo (si no, se descubre en <issuer>/.well-known/openid-configuration). */
    SCHEDULER_OIDC_JWKS_URL: url.optional(),
    /** Audiencias aceptadas (coma). Vacío = no se revisa `aud` (p. ej. tokens de acceso de Cognito, que no la traen). */
    SCHEDULER_OIDC_AUDIENCE: list,
    /** Principales permitidos (coma): se comparan con sub, email, client_id, azp, appid y oid. */
    SCHEDULER_OIDC_PRINCIPALS: list,
    /** Secretos: env (por defecto, variables inyectadas por la plataforma) | gcp | aws | azure (resuelve valores secret://…). */
    SECRETS_SOURCE: z.enum(["env", "gcp", "aws", "azure"]).default("env"),

    DOCS: bool(true),
    VALIDATE_RESPONSES: bool(true),
    APP_VERSION: z.string().default("0.0.0"),
    GIT_COMMIT: z.string().optional(),
    K_REVISION: z.string().optional(),
  })
  .transform((e, ctx) => {
    const remote = e.MIRAI_ENV !== "local"
    const supabaseUrl = (e.SUPABASE_URL ?? e.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/+$/, "")
    const publishableKey = e.SUPABASE_PUBLISHABLE_KEY ?? e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    const need = (cond: unknown, path: string, message: string) => {
      if (!cond) ctx.addIssue({ code: "custom", path: [path], message })
    }
    // El trabajador (MODE=worker) no toca la base ni atiende al navegador: solo cola y despacho HTTP.
    const worker = e.MODE === "worker"
    need(worker || supabaseUrl, "SUPABASE_URL", "Falta SUPABASE_URL")
    need(worker || publishableKey, "SUPABASE_PUBLISHABLE_KEY", "Falta SUPABASE_PUBLISHABLE_KEY")
    if (remote && !worker) {
      need(e.SUPABASE_SECRET_KEY, "SUPABASE_SECRET_KEY", "Falta SUPABASE_SECRET_KEY (Secret Manager)")
      need(e.ENCRYPTION_KEY, "ENCRYPTION_KEY", "Falta ENCRYPTION_KEY (Secret Manager)")
      need(e.WEB_ORIGINS.length, "WEB_ORIGINS", "Falta WEB_ORIGINS (orígenes del front para CORS)")
      // El gateway (MODE=realtime) no monta /v1/jobs/**: no necesita credenciales del cron.
      if (e.MODE === "api")
        need(
          e.CRON_SECRET || (e.SCHEDULER_AUDIENCE && e.SCHEDULER_SERVICE_ACCOUNTS.length) || (e.SCHEDULER_OIDC_ISSUER && e.SCHEDULER_OIDC_PRINCIPALS.length),
          "SCHEDULER_AUDIENCE",
          "Configura SCHEDULER_AUDIENCE + SCHEDULER_SERVICE_ACCOUNTS (OIDC de Google), SCHEDULER_OIDC_ISSUER + SCHEDULER_OIDC_PRINCIPALS (otro emisor) o CRON_SECRET",
        )
    }
    if (e.DB_ADAPTER === "pg") need(e.DATABASE_URL, "DATABASE_URL", "DB_ADAPTER=pg necesita DATABASE_URL")
    if (e.DB_ADAPTER === "postgrest") {
      need(e.POSTGREST_URL, "POSTGREST_URL", "DB_ADAPTER=postgrest necesita POSTGREST_URL")
      need(e.POSTGREST_JWT_SECRET, "POSTGREST_JWT_SECRET", "DB_ADAPTER=postgrest necesita POSTGREST_JWT_SECRET")
    }
    if (e.QUEUE_DRIVER === "cloudtasks") {
      need(e.GCP_PROJECT, "GCP_PROJECT", "QUEUE_DRIVER=cloudtasks necesita GCP_PROJECT")
      need(e.API_BASE_URL, "API_BASE_URL", "QUEUE_DRIVER=cloudtasks necesita API_BASE_URL")
      need(e.TASKS_SERVICE_ACCOUNT, "TASKS_SERVICE_ACCOUNT", "QUEUE_DRIVER=cloudtasks necesita TASKS_SERVICE_ACCOUNT")
    }
    // V7-F: colas portables, trabajador, despacho y emisor OIDC genérico.
    const queueRefs = { notify: e.QUEUE_NOTIFY, automations: e.QUEUE_AUTOMATIONS, slow: e.QUEUE_SLOW }
    const tasksTarget = (e.TASKS_TARGET_URL ?? e.API_BASE_URL)?.replace(/\/+$/, "")
    if (e.QUEUE_DRIVER === "sqs") {
      for (const [q, v] of Object.entries(queueRefs)) {
        const key = `QUEUE_${q.toUpperCase()}`
        need(v, key, `QUEUE_DRIVER=sqs necesita ${key} (URL de la cola)`)
        if (v) need(/^https?:\/\//.test(v), key, `${key} debe ser la URL de la cola de SQS (https://sqs.<región>.amazonaws.com/<cuenta>/<cola>)`)
      }
      const anyUrl = Object.values(queueRefs).find(Boolean) ?? ""
      need(e.AWS_REGION || /^https:\/\/sqs[.-][a-z0-9-]+\.amazonaws\.com/.test(anyUrl), "AWS_REGION", "QUEUE_DRIVER=sqs necesita AWS_REGION (o URLs de SQS con la región)")
    }
    if (e.QUEUE_DRIVER === "servicebus") need(e.SERVICEBUS_NAMESPACE || e.SERVICEBUS_CONNECTION_STRING, "SERVICEBUS_NAMESPACE", "QUEUE_DRIVER=servicebus necesita SERVICEBUS_NAMESPACE (identidad administrada) o SERVICEBUS_CONNECTION_STRING")
    if (e.QUEUE_DEDUPE === "redis") need(e.REDIS_URL, "REDIS_URL", "QUEUE_DEDUPE=redis necesita REDIS_URL")
    if (worker) need(e.QUEUE_DRIVER === "sqs" || e.QUEUE_DRIVER === "servicebus", "QUEUE_DRIVER", "MODE=worker consume colas de extracción: QUEUE_DRIVER=sqs o servicebus")
    if (worker || e.QUEUE_DRIVER === "http") {
      const who = worker ? "MODE=worker" : "QUEUE_DRIVER=http"
      need(tasksTarget, "TASKS_TARGET_URL", `${who} necesita TASKS_TARGET_URL o API_BASE_URL (a dónde despachar las tareas)`)
      if (e.TASKS_AUTH === "secret") need(e.CRON_SECRET, "CRON_SECRET", `${who} con TASKS_AUTH=secret necesita CRON_SECRET`)
      if (e.TASKS_AUTH === "azure") need(e.TASKS_AUDIENCE, "TASKS_AUDIENCE", "TASKS_AUTH=azure necesita TASKS_AUDIENCE (p. ej. api://mirai-api)")
      if (e.TASKS_AUTH === "client_credentials") {
        need(e.TASKS_TOKEN_URL, "TASKS_TOKEN_URL", "TASKS_AUTH=client_credentials necesita TASKS_TOKEN_URL")
        need(e.TASKS_CLIENT_ID, "TASKS_CLIENT_ID", "TASKS_AUTH=client_credentials necesita TASKS_CLIENT_ID")
        need(e.TASKS_CLIENT_SECRET, "TASKS_CLIENT_SECRET", "TASKS_AUTH=client_credentials necesita TASKS_CLIENT_SECRET")
      }
    }
    const workerQueues = e.WORKER_QUEUES.length ? e.WORKER_QUEUES : ["notify", "automations", "slow"]
    for (const q of workerQueues) need(["notify", "automations", "slow"].includes(q), "WORKER_QUEUES", `WORKER_QUEUES: cola desconocida "${q}" (notify, automations, slow)`)
    need(e.TASKS_RETRY_BASE_S <= e.TASKS_RETRY_MAX_S, "TASKS_RETRY_BASE_S", "TASKS_RETRY_BASE_S no puede ser mayor que TASKS_RETRY_MAX_S")
    if (e.SCHEDULER_OIDC_ISSUER) need(e.SCHEDULER_OIDC_PRINCIPALS.length, "SCHEDULER_OIDC_PRINCIPALS", "SCHEDULER_OIDC_ISSUER necesita SCHEDULER_OIDC_PRINCIPALS (quién puede llamar a /v1/jobs/**)")
    if (e.SCHEDULER_OIDC_PRINCIPALS.length || e.SCHEDULER_OIDC_JWKS_URL || e.SCHEDULER_OIDC_AUDIENCE.length) need(e.SCHEDULER_OIDC_ISSUER, "SCHEDULER_OIDC_ISSUER", "Falta SCHEDULER_OIDC_ISSUER (emisor de los tokens)")
    if (e.IDEMPOTENCY_STORE === "supabase" || e.RATE_LIMIT_STORE === "supabase") need(e.SUPABASE_SECRET_KEY, "SUPABASE_SECRET_KEY", "Los almacenes 'supabase' necesitan SUPABASE_SECRET_KEY")

    const url = supabaseUrl ?? ""
    return {
      env: e.MIRAI_ENV,
      mode: e.MODE,
      port: e.PORT,
      host: e.HOST,
      logLevel: e.LOG_LEVEL,
      version: e.APP_VERSION,
      commit: (e.GIT_COMMIT ?? e.K_REVISION ?? "dev").slice(0, 40),
      supabase: { url, publishableKey: publishableKey ?? "", secretKey: e.SUPABASE_SECRET_KEY },
      auth: {
        jwksUrl: e.AUTH_JWKS_URL ?? `${url}/auth/v1/.well-known/jwks.json`,
        issuer: e.AUTH_ISSUER ?? `${url}/auth/v1`,
        audience: e.AUTH_AUDIENCE,
        jwtSecret: e.SUPABASE_JWT_SECRET,
      },
      encryptionKey: e.ENCRYPTION_KEY,
      scheduler: {
        cronSecret: e.CRON_SECRET,
        audience: e.SCHEDULER_AUDIENCE,
        serviceAccounts: e.SCHEDULER_SERVICE_ACCOUNTS,
        oidc: e.SCHEDULER_OIDC_ISSUER ? { issuer: e.SCHEDULER_OIDC_ISSUER, jwksUrl: e.SCHEDULER_OIDC_JWKS_URL, audience: e.SCHEDULER_OIDC_AUDIENCE, principals: e.SCHEDULER_OIDC_PRINCIPALS } : undefined,
      },
      webOrigins: e.WEB_ORIGINS.length ? e.WEB_ORIGINS : remote ? [] : ["http://localhost:3000"],
      db: { adapter: e.DB_ADAPTER, url: e.DATABASE_URL, ...(e.POSTGREST_URL || e.POSTGREST_JWT_SECRET ? { postgrest: { url: e.POSTGREST_URL?.replace(/\/+$/, ""), jwtSecret: e.POSTGREST_JWT_SECRET } } : {}) },
      rateLimit: { store: e.RATE_LIMIT_STORE ?? (e.SUPABASE_SECRET_KEY && remote ? "supabase" : "memory"), defaultPerMin: e.RATE_LIMIT_DEFAULT_PER_MIN },
      idempotency: { store: e.IDEMPOTENCY_STORE, ttlS: 86_400 },
      queue: {
        driver: e.QUEUE_DRIVER,
        project: e.GCP_PROJECT,
        location: e.GCP_LOCATION,
        serviceAccount: e.TASKS_SERVICE_ACCOUNT,
        baseUrl: e.API_BASE_URL,
        queues: queueRefs,
        dedupe: { store: e.QUEUE_DEDUPE, ttlS: e.QUEUE_DEDUPE_TTL_S, redisUrl: e.REDIS_URL },
        sqs: { endpoint: e.SQS_ENDPOINT, region: e.AWS_REGION },
        servicebus: { namespace: e.SERVICEBUS_NAMESPACE, connectionString: e.SERVICEBUS_CONNECTION_STRING },
      },
      tasks: {
        targetUrl: tasksTarget,
        auth: e.TASKS_AUTH,
        audience: e.TASKS_AUDIENCE ?? tasksTarget,
        tokenUrl: e.TASKS_TOKEN_URL,
        clientId: e.TASKS_CLIENT_ID,
        clientSecret: e.TASKS_CLIENT_SECRET,
        scope: e.TASKS_SCOPE,
        timeoutS: e.TASKS_TIMEOUT_S,
        maxAttempts: e.TASKS_MAX_ATTEMPTS,
        retryBaseS: e.TASKS_RETRY_BASE_S,
        retryMaxS: e.TASKS_RETRY_MAX_S,
      },
      worker: { queues: workerQueues as ("notify" | "automations" | "slow")[], concurrency: e.WORKER_CONCURRENCY, shutdownS: e.WORKER_SHUTDOWN_S },
      secretsSource: e.SECRETS_SOURCE,
      gcpProject: e.GCP_PROJECT,
      docs: e.DOCS && e.MIRAI_ENV !== "produccion",
      validateResponses: e.VALIDATE_RESPONSES && e.MIRAI_ENV !== "produccion",
      bodyLimitBytes: 8 * 1024 * 1024,
    }
  })

export type Config = z.output<typeof EnvSchema>

/** Error de configuración: solo nombres de variables y qué les falta (nunca valores). */
export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Configuración inválida de la API:\n${problems.map((p) => `  - ${p}`).join("\n")}`)
  }
}

/** Valida el entorno. Lanza ConfigError con la lista de problemas. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = EnvSchema.safeParse(env)
  if (!r.success) throw new ConfigError(r.error.issues.map((i) => `${i.path.join(".") || "(entorno)"}: ${i.message}`))
  return r.data
}
