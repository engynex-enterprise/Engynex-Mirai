// Configuración HTTP de la app (la usan main.ts y las pruebas de integración): Fastify, CORS, cabeceras y log de acceso.
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify"
import type { Logger } from "pino"
import type { Config } from "./core/config/config.schema"
import type { CtxRequest } from "./core/context/cls-setup"
import { currentTrace, traceFields } from "./core/logging/trace"

export function fastifyAdapter(config: Config) {
  return new FastifyAdapter({
    bodyLimit: config.bodyLimitBytes,
    // Detrás del Google Front End de Cloud Run: la IP real va en X-Forwarded-For.
    trustProxy: true,
    routerOptions: { maxParamLength: 300 },
    return503OnClosing: true,
    logger: false,
  })
}

/** ¿El origen está permitido? Acepta `*` como comodín dentro de una entrada (vistas previas de Vercel). */
export function originAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return true // llamadas de servidor a servidor (RSC de Next, Scheduler): CORS no aplica
  return allowed.some((a) => (a.includes("*") ? new RegExp(`^${a.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\/]/g, "\\$&")).join("[a-z0-9-]+")}$`, "i").test(origin) : a === origin))
}

export const CORS_HEADERS = ["authorization", "content-type", "idempotency-key", "traceparent", "tracestate", "x-mirai-client", "x-request-id"]
export const EXPOSED_HEADERS = ["x-request-id", "retry-after", "ratelimit-limit", "ratelimit-remaining", "ratelimit-reset", "idempotent-replayed"]

const QUIET = /^\/(healthz|readyz)\b/

export function configureApp(app: NestFastifyApplication, config: Config, log: Logger) {
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => cb(null, originAllowed(origin, config.webOrigins)),
    credentials: false, // la API usa Bearer, no cookies: sin superficie de CSRF (§2.7.12)
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: CORS_HEADERS,
    exposedHeaders: EXPOSED_HEADERS,
    maxAge: 600,
  })
  app.enableShutdownHooks()

  const fastify = app.getHttpAdapter().getInstance()
  fastify.addHook("onSend", async (req, reply, payload) => {
    const ctx = (req.raw as CtxRequest).miraiCtx
    if (ctx) reply.header("x-request-id", ctx.requestId)
    reply.header("x-content-type-options", "nosniff")
    if (!reply.hasHeader("cache-control")) reply.header("cache-control", "no-store")
    return payload
  })
  fastify.addHook("onResponse", async (req, reply) => {
    const ctx = (req.raw as CtxRequest).miraiCtx
    const url = ctx?.route ?? req.url.split("?")[0]
    const level = QUIET.test(url) && reply.statusCode < 500 ? "debug" : reply.statusCode >= 500 ? "error" : reply.statusCode >= 400 ? "warn" : "info"
    log[level](
      {
        requestId: ctx?.requestId,
        ...(ctx?.user ? { userId: ctx.user.id } : {}),
        ...(ctx?.bookAccess ? { householdId: ctx.bookAccess.household.id, bookId: ctx.bookAccess.book.id } : {}),
        ...traceFields(currentTrace(ctx?.trace), config.gcpProject),
        httpRequest: {
          requestMethod: req.method,
          requestUrl: url,
          status: reply.statusCode,
          latency: `${(reply.elapsedTime / 1000).toFixed(3)}s`,
          userAgent: req.headers["user-agent"],
          remoteIp: ctx?.ip ?? req.ip,
          protocol: `HTTP/${req.raw.httpVersion}`,
        },
      },
      `${req.method} ${url} ${reply.statusCode}`,
    )
  })
}
