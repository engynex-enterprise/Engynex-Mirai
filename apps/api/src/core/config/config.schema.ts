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
    MODE: z.enum(["api", "realtime"]).default("api"),
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

    DB_ADAPTER: z.enum(["supabase", "pg"]).default("supabase"),
    /** Secret Manager (fase 4, Cloud SQL). */
    DATABASE_URL: opt,

    RATE_LIMIT_STORE: z.enum(["memory", "supabase"]).optional(),
    /** Peticiones por minuto por persona (o IP) en cada instancia, en memoria (no toca la base). */
    RATE_LIMIT_DEFAULT_PER_MIN: z.coerce.number().int().min(1).default(300),
    /** `supabase` necesita la migración 20261103003800_api_idempotency.sql aplicada. */
    IDEMPOTENCY_STORE: z.enum(["memory", "supabase"]).default("memory"),

    QUEUE_DRIVER: z.enum(["inline", "cloudtasks"]).default("inline"),
    GCP_PROJECT: opt,
    GCP_LOCATION: z.string().default("us-west1"),
    TASKS_SERVICE_ACCOUNT: opt,
    /** URL pública de esta API (Cloud Tasks la llama de vuelta). */
    API_BASE_URL: url.optional(),

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
    need(supabaseUrl, "SUPABASE_URL", "Falta SUPABASE_URL")
    need(publishableKey, "SUPABASE_PUBLISHABLE_KEY", "Falta SUPABASE_PUBLISHABLE_KEY")
    if (remote) {
      need(e.SUPABASE_SECRET_KEY, "SUPABASE_SECRET_KEY", "Falta SUPABASE_SECRET_KEY (Secret Manager)")
      need(e.ENCRYPTION_KEY, "ENCRYPTION_KEY", "Falta ENCRYPTION_KEY (Secret Manager)")
      need(e.WEB_ORIGINS.length, "WEB_ORIGINS", "Falta WEB_ORIGINS (orígenes del front para CORS)")
      // El gateway (MODE=realtime) no monta /v1/jobs/**: no necesita credenciales del cron.
      if (e.MODE === "api")
        need(e.CRON_SECRET || (e.SCHEDULER_AUDIENCE && e.SCHEDULER_SERVICE_ACCOUNTS.length), "SCHEDULER_AUDIENCE", "Configura SCHEDULER_AUDIENCE + SCHEDULER_SERVICE_ACCOUNTS (OIDC) o CRON_SECRET")
    }
    if (e.DB_ADAPTER === "pg") need(e.DATABASE_URL, "DATABASE_URL", "DB_ADAPTER=pg necesita DATABASE_URL")
    if (e.QUEUE_DRIVER === "cloudtasks") {
      need(e.GCP_PROJECT, "GCP_PROJECT", "QUEUE_DRIVER=cloudtasks necesita GCP_PROJECT")
      need(e.API_BASE_URL, "API_BASE_URL", "QUEUE_DRIVER=cloudtasks necesita API_BASE_URL")
      need(e.TASKS_SERVICE_ACCOUNT, "TASKS_SERVICE_ACCOUNT", "QUEUE_DRIVER=cloudtasks necesita TASKS_SERVICE_ACCOUNT")
    }
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
      scheduler: { cronSecret: e.CRON_SECRET, audience: e.SCHEDULER_AUDIENCE, serviceAccounts: e.SCHEDULER_SERVICE_ACCOUNTS },
      webOrigins: e.WEB_ORIGINS.length ? e.WEB_ORIGINS : remote ? [] : ["http://localhost:3000"],
      db: { adapter: e.DB_ADAPTER, url: e.DATABASE_URL },
      rateLimit: { store: e.RATE_LIMIT_STORE ?? (e.SUPABASE_SECRET_KEY && remote ? "supabase" : "memory"), defaultPerMin: e.RATE_LIMIT_DEFAULT_PER_MIN },
      idempotency: { store: e.IDEMPOTENCY_STORE, ttlS: 86_400 },
      queue: { driver: e.QUEUE_DRIVER, project: e.GCP_PROJECT, location: e.GCP_LOCATION, serviceAccount: e.TASKS_SERVICE_ACCOUNT, baseUrl: e.API_BASE_URL },
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
