// Logger JSON con el formato de Cloud Logging (§2.7.3): `severity`, `message`, `time`, `httpRequest`,
// `logging.googleapis.com/trace` y los ids de la petición (requestId, userId, householdId, bookId). Nunca montos.
import type { LoggerService } from "@nestjs/common"
import { ClsServiceManager } from "nestjs-cls"
import pino, { type Logger } from "pino"
import { CTX, type RequestContext } from "../context/request-context"
import { logsBridgeEnabled } from "../telemetry/config"
import { otlpLogStream } from "./otlp-logs"
import { currentTrace, traceFields, w3cTraceFields } from "./trace"
import { PINO_REDACT, scrub } from "./redact"

const SEVERITY: Record<string, string> = { trace: "DEBUG", debug: "DEBUG", info: "INFO", warn: "WARNING", error: "ERROR", fatal: "CRITICAL" }

/** Contexto de la petición actual si lo hay (fuera de una petición, undefined). */
export function currentContext(): RequestContext | undefined {
  try {
    const cls = ClsServiceManager.getClsService()
    return cls.isActive() ? (cls.get(CTX) as RequestContext | undefined) : undefined
  } catch {
    return undefined
  }
}

export type LoggerOptions = { level: string; service: string; version: string; project?: string; destination?: pino.DestinationStream }

/**
 * Destino por defecto: stdout (JSON, portable). Con OTEL_LOGS_EXPORTER=otlp, además, el Logs SDK de OpenTelemetry
 * (otlp-logs.ts). Con un `destination` explícito (pruebas) se usa ese y nada más.
 */
export function defaultDestination(o: Pick<LoggerOptions, "level" | "service">, env: NodeJS.ProcessEnv = process.env): pino.DestinationStream | undefined {
  if (!logsBridgeEnabled(env)) return undefined
  const level = o.level as pino.Level
  return pino.multistream([
    { level, stream: pino.destination({ dest: 1, sync: true }) },
    { level, stream: otlpLogStream(o.service) },
  ])
}

export function createLogger(o: LoggerOptions): Logger {
  return pino(
    {
      level: o.level,
      messageKey: "message",
      errorKey: "error",
      base: { serviceContext: { service: o.service, version: o.version } },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: PINO_REDACT, censor: "[oculto]" },
      formatters: {
        level: (label) => ({ severity: SEVERITY[label] ?? "DEFAULT" }),
      },
      serializers: {
        error: (e: unknown) => {
          if (!(e instanceof Error)) return scrub(e)
          // `stack_trace` hace que Error Reporting agrupe el error.
          return { name: e.name, message: e.message, stack_trace: e.stack, code: (e as { code?: unknown }).code }
        },
      },
      mixin() {
        const c = currentContext()
        // Traza activa de OTel (petición, tarea del trabajador…) o la que llegó en los encabezados de la petición.
        const t = currentTrace(c?.trace)
        return {
          ...(c
            ? {
                requestId: c.requestId,
                ...(c.user ? { userId: c.user.id } : {}),
                ...(c.bookAccess ? { householdId: c.bookAccess.household.id, bookId: c.bookAccess.book.id } : {}),
              }
            : {}),
          ...traceFields(t, o.project),
          ...w3cTraceFields(t),
        }
      },
    },
    o.destination ?? defaultDestination(o),
  )
}

/** Contextos de Nest que al arrancar escriben una línea por módulo o ruta: van en debug para no llenar el log. */
const NOISY = new Set(["InstanceLoader", "RoutesResolver", "RouterExplorer", "NestFactory"])

/** Adaptador para que los logs internos de Nest salgan en el mismo formato. */
export class NestPinoLogger implements LoggerService {
  constructor(private readonly pino: Logger) {}
  private write(level: "info" | "warn" | "error" | "debug" | "trace" | "fatal", message: unknown, rest: unknown[]) {
    const context = typeof rest[rest.length - 1] === "string" ? (rest.pop() as string) : undefined
    if (level === "info" && context && NOISY.has(context)) level = "debug"
    const err = rest.find((x) => x instanceof Error) ?? (typeof rest[0] === "string" && level === "error" ? { stack: rest[0] } : undefined)
    if (message instanceof Error) this.pino[level]({ context, error: message }, message.message)
    else if (typeof message === "object" && message !== null) this.pino[level]({ context, ...scrub(message) as object })
    else this.pino[level]({ context, ...(err ? { error: err } : {}) }, String(message))
  }
  log(message: unknown, ...rest: unknown[]) { this.write("info", message, rest) }
  error(message: unknown, ...rest: unknown[]) { this.write("error", message, rest) }
  warn(message: unknown, ...rest: unknown[]) { this.write("warn", message, rest) }
  debug(message: unknown, ...rest: unknown[]) { this.write("debug", message, rest) }
  verbose(message: unknown, ...rest: unknown[]) { this.write("trace", message, rest) }
  fatal(message: unknown, ...rest: unknown[]) { this.write("fatal", message, rest) }
}

/** Token de inyección del logger de pino: `@Inject(LOGGER) private readonly log: Logger` (con `import type { Logger }`). */
export const LOGGER = Symbol("mirai.logger")
