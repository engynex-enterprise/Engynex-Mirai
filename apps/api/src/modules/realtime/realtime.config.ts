// Variables del gateway de tiempo real (F2-G). Van aparte del esquema del núcleo (core/config) para que el frente no
// toque archivos compartidos; mismas reglas: zod, falla al arrancar y el error nombra variables, nunca valores.
import { z } from "zod"
import type { Config } from "../../core/config/config.schema"
import { ConfigError } from "../../core/config/config.schema"

const bool = (def: boolean) =>
  z
    .enum(["1", "0", "true", "false", "si", "no", ""])
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : v === "1" || v === "true" || v === "si"))
const int = (def: number, min: number, max: number) => z.coerce.number().int().min(min).max(max).default(def)

export const RealtimeEnvSchema = z.object({
  /** Memorystore (Secret Manager si lleva clave): redis://… o rediss://…. Sin ella, una sola instancia en memoria. */
  REDIS_URL: z.string().regex(/^rediss?:\/\//, "Debe empezar por redis:// o rediss://").optional(),
  REALTIME_PATH: z.string().startsWith("/").default("/socket.io"),
  /** Cada cuánto se revisa que el token siga vigente y que la persona siga en el hogar (s). */
  REALTIME_TOKEN_CHECK_S: int(600, 1, 3600),
  /** La presencia se olvida si no llega un latido en este tiempo (s). */
  REALTIME_PRESENCE_TTL_S: int(60, 5, 600),
  /** Recuperación de la conexión (socket.io connectionStateRecovery): cuánto se guardan los eventos perdidos (s). */
  REALTIME_RECOVERY_S: int(120, 0, 900),
  /** Libros abiertos a la vez por conexión. */
  REALTIME_MAX_BOOKS: int(5, 1, 50),
  /** Comandos del cliente por conexión cada 10 s (join, presencia…). */
  REALTIME_EVENTS_PER_10S: int(40, 5, 1000),
  /** Escuchar `LISTEN mirai_live` (fase 4, Cloud SQL o Supabase local con el trigger instalado). */
  REALTIME_PG_LISTEN: bool(false),
  /** Conexión DIRECTA de sesión (no un pooler en modo transacción). Si falta, DATABASE_URL. */
  REALTIME_DATABASE_URL: z.string().trim().min(1).optional(),
  /** MODE=api: publicar los cambios de EventsService en Redis (redis-emitter) para el gateway. Requiere REDIS_URL. */
  REALTIME_API_EMIT: bool(true),
})

export type RealtimeConfigShape = {
  redisUrl?: string
  path: string
  tokenCheckMs: number
  presenceTtlMs: number
  recoveryMs: number
  maxBooks: number
  eventsPer10s: number
  pgListen: boolean
  pgUrl?: string
  apiEmit: boolean
  webOrigins: string[]
}

/** Valida el entorno del gateway. Lanza ConfigError con nombres de variables (nunca valores). */
export function loadRealtimeConfig(env: NodeJS.ProcessEnv, app: Pick<Config, "webOrigins" | "db">): RealtimeConfigShape {
  const r = RealtimeEnvSchema.safeParse(env)
  if (!r.success) throw new ConfigError(r.error.issues.map((i) => `${i.path.join(".") || "(entorno)"}: ${i.message}`))
  const e = r.data
  const pgUrl = e.REALTIME_DATABASE_URL ?? app.db.url
  if (e.REALTIME_PG_LISTEN && !pgUrl) throw new ConfigError(["REALTIME_DATABASE_URL: REALTIME_PG_LISTEN=1 necesita REALTIME_DATABASE_URL o DATABASE_URL"])
  return {
    redisUrl: e.REDIS_URL,
    path: e.REALTIME_PATH,
    tokenCheckMs: e.REALTIME_TOKEN_CHECK_S * 1000,
    presenceTtlMs: e.REALTIME_PRESENCE_TTL_S * 1000,
    recoveryMs: e.REALTIME_RECOVERY_S * 1000,
    maxBooks: e.REALTIME_MAX_BOOKS,
    eventsPer10s: e.REALTIME_EVENTS_PER_10S,
    pgListen: e.REALTIME_PG_LISTEN,
    pgUrl,
    apiEmit: e.REALTIME_API_EMIT,
    webOrigins: app.webOrigins,
  }
}

/** Token inyectable (como AppConfig). */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface RealtimeConfig extends RealtimeConfigShape {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class RealtimeConfig {}
