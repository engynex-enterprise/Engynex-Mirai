// Puente pino → OpenTelemetry Logs (V7-Q). Con OTEL_LOGS_EXPORTER=otlp cada línea JSON de pino, además de ir a stdout,
// se emite como LogRecord por el LoggerProvider global que registró el NodeSDK (src/otel.ts) → colector → backend.
// Sin SDK el proveedor global es no-op: emitir no cuesta nada. No necesita @opentelemetry/instrumentation-pino ni
// @opentelemetry/api-logs: `logs` viene en @opentelemetry/api ≥ 1.10.
// La línea ya pasó por el `redact` y los serializadores de pino: nunca lleva secretos ni montos.
import { context as otelContext, isSpanContextValid, logs, ROOT_CONTEXT, SeverityNumber, trace, TraceFlags, type Attributes, type AttributeValue, type Context, type LogRecord } from "@opentelemetry/api"

const SEVERITY_NUMBER: Record<string, SeverityNumber> = {
  DEBUG: SeverityNumber.DEBUG,
  INFO: SeverityNumber.INFO,
  NOTICE: SeverityNumber.INFO2,
  WARNING: SeverityNumber.WARN,
  ERROR: SeverityNumber.ERROR,
  CRITICAL: SeverityNumber.FATAL,
  ALERT: SeverityNumber.FATAL2,
  EMERGENCY: SeverityNumber.FATAL3,
}

/** Campos que ya viajan en el LogRecord (cuerpo, severidad, hora, traza) o en el recurso (serviceContext). */
const SKIP = new Set(["message", "severity", "time", "serviceContext", "trace_id", "span_id", "trace_flags"])
const CLOUD_PREFIX = "logging.googleapis.com/"

/** Aplana objetos a claves con puntos (hasta 4 niveles); listas y lo más hondo van como JSON. */
export function flattenAttributes(v: Record<string, unknown>, prefix = "", depth = 0, out: Attributes = {}): Attributes {
  for (const [k, x] of Object.entries(v)) {
    if (!prefix && (SKIP.has(k) || k.startsWith(CLOUD_PREFIX))) continue
    const key = prefix ? `${prefix}.${k}` : k
    if (x === null || x === undefined) continue
    if (typeof x === "string" || typeof x === "number" || typeof x === "boolean") out[key] = x as AttributeValue
    else if (typeof x === "object" && !Array.isArray(x) && depth < 3) flattenAttributes(x as Record<string, unknown>, key, depth + 1, out)
    else out[key] = JSON.stringify(x)
  }
  return out
}

/** Contexto para el LogRecord: el activo si tiene un span válido; si no, el de los campos trace_id/span_id de la línea. */
export function logContext(line: Record<string, unknown>, active: Context = otelContext.active()): Context | undefined {
  const sc = trace.getSpanContext(active)
  if (sc && isSpanContextValid(sc)) return active
  const traceId = typeof line.trace_id === "string" ? line.trace_id : undefined
  const spanId = typeof line.span_id === "string" ? line.span_id : undefined
  if (!traceId || !spanId) return undefined
  const remote = { traceId, spanId, traceFlags: line.trace_flags === "01" ? TraceFlags.SAMPLED : TraceFlags.NONE, isRemote: true }
  return isSpanContextValid(remote) ? trace.setSpanContext(ROOT_CONTEXT, remote) : undefined
}

/** El error serializado por logger.ts con los nombres de la convención semántica (exception.*). */
function exceptionAttributes(e: unknown): Attributes {
  if (!e || typeof e !== "object") return {}
  const x = e as { name?: unknown; message?: unknown; stack_trace?: unknown }
  const out: Attributes = {}
  if (typeof x.name === "string") out["exception.type"] = x.name
  if (typeof x.message === "string") out["exception.message"] = x.message
  if (typeof x.stack_trace === "string") out["exception.stacktrace"] = x.stack_trace
  return out
}

/** Convierte una línea JSON de pino (formato de logger.ts) en un LogRecord de OpenTelemetry. */
export function toLogRecord(line: Record<string, unknown>, active?: Context): LogRecord {
  const severity = typeof line.severity === "string" ? line.severity : "DEFAULT"
  const time = typeof line.time === "string" ? new Date(line.time) : new Date()
  const ctx = logContext(line, active)
  return {
    timestamp: Number.isNaN(time.getTime()) ? new Date() : time,
    severityText: severity,
    severityNumber: SEVERITY_NUMBER[severity] ?? SeverityNumber.UNSPECIFIED,
    body: typeof line.message === "string" ? line.message : "",
    attributes: { ...flattenAttributes(line), ...exceptionAttributes(line.error) },
    ...(ctx ? { context: ctx } : {}),
  }
}

/**
 * Destino de pino (para `pino.multistream`) que emite cada línea por el Logs API. pino escribe sincrónicamente dentro
 * de la llamada al log, así que el contexto activo es el de la petición y el LogRecord queda pegado a su span.
 */
export function otlpLogStream(scope = "mirai-api") {
  const logger = logs.getLogger(scope)
  return {
    write(chunk: string) {
      for (const raw of String(chunk).split("\n")) {
        if (!raw.trim()) continue
        try {
          logger.emit(toLogRecord(JSON.parse(raw) as Record<string, unknown>))
        } catch {
          /* una línea ilegible no debe tumbar el log a stdout */
        }
      }
    },
  }
}
