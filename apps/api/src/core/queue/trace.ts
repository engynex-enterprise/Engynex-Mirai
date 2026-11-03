// Propagación de la traza a las tareas (web → api → tarea → trabajador). Con OpenTelemetry encendido usa el propagador
// global (W3C traceparent/tracestate); sin él, rearma `traceparent` con la traza que llegó en la petición (RequestContext),
// así los logs del trabajador quedan en la misma traza de Cloud Logging / CloudWatch / Azure Monitor.
import { context, propagation, ROOT_CONTEXT, type Context } from "@opentelemetry/api"
import { ClsServiceManager } from "nestjs-cls"
import { CTX, type MiraiCls } from "../context/request-context"
import { currentTrace } from "../logging/trace"

export type TraceCarrier = { traceparent?: string; tracestate?: string }

function requestTrace() {
  try {
    const cls = ClsServiceManager.getClsService<MiraiCls>()
    return cls.isActive() ? cls.get(CTX)?.trace : undefined
  } catch {
    return undefined
  }
}

/** Encabezados de traza de lo que se está ejecutando ahora (vacío si no hay traza). */
export function traceCarrier(): TraceCarrier {
  const c: Record<string, string> = {}
  propagation.inject(context.active(), c)
  if (c.traceparent) return { traceparent: c.traceparent, ...(c.tracestate ? { tracestate: c.tracestate } : {}) }
  const t = currentTrace(requestTrace())
  if (t?.spanId && /^[\da-f]{32}$/.test(t.traceId) && /^[\da-f]{16}$/.test(t.spanId)) return { traceparent: `00-${t.traceId}-${t.spanId}-${t.sampled ? "01" : "00"}` }
  return {}
}

/** Contexto de OpenTelemetry a partir de los encabezados guardados en la tarea (para el span del trabajador). */
export function contextFrom(c: TraceCarrier): Context {
  return propagation.extract(ROOT_CONTEXT, { ...(c.traceparent ? { traceparent: c.traceparent } : {}), ...(c.tracestate ? { tracestate: c.tracestate } : {}) })
}

/** Encabezados HTTP de traza para despachar la tarea. */
export function traceHeaders(c: TraceCarrier): Record<string, string> {
  return { ...(c.traceparent ? { traceparent: c.traceparent } : {}), ...(c.tracestate ? { tracestate: c.tracestate } : {}) }
}
