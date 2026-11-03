// Identificador de traza para correlacionar logs (Cloud Logging) y trazas (Cloud Trace / OTel).
// Lee `traceparent` (W3C, lo manda el front y Cloud Run) o `X-Cloud-Trace-Context` (formato de Google).
import { trace as otelTrace, isSpanContextValid } from "@opentelemetry/api"
import type { TraceInfo } from "../context/request-context"

const TRACEPARENT = /^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})$/
const CLOUD = /^([\da-f]{32})(?:\/(\d+))?(?:;o=([01]))?$/

export function parseTraceHeaders(headers: Record<string, string | string[] | undefined>): TraceInfo | undefined {
  const tp = String(headers["traceparent"] ?? "").trim().toLowerCase()
  const m = TRACEPARENT.exec(tp)
  if (m && !/^0+$/.test(m[1])) return { traceId: m[1], spanId: m[2], sampled: (parseInt(m[3], 16) & 1) === 1 }
  const xc = String(headers["x-cloud-trace-context"] ?? "").trim().toLowerCase()
  const c = CLOUD.exec(xc)
  if (c) return { traceId: c[1], spanId: c[2] ? BigInt(c[2]).toString(16).padStart(16, "0") : undefined, sampled: c[3] === "1" }
  return undefined
}

/** La traza activa de OpenTelemetry (si está encendido) o la que llegó en los encabezados. */
export function currentTrace(fallback?: TraceInfo): TraceInfo | undefined {
  const sc = otelTrace.getActiveSpan()?.spanContext()
  if (sc && isSpanContextValid(sc)) return { traceId: sc.traceId, spanId: sc.spanId, sampled: (sc.traceFlags & 1) === 1 }
  return fallback
}

/** Campos especiales de Cloud Logging para agrupar los logs por traza. */
export function traceFields(t: TraceInfo | undefined, project: string | undefined): Record<string, unknown> {
  if (!t) return {}
  return {
    "logging.googleapis.com/trace": project ? `projects/${project}/traces/${t.traceId}` : t.traceId,
    ...(t.spanId ? { "logging.googleapis.com/spanId": t.spanId } : {}),
    ...(t.sampled !== undefined ? { "logging.googleapis.com/trace_sampled": t.sampled } : {}),
  }
}

/** Campos neutros (W3C, sin proveedor) para correlacionar en cualquier backend: trace_id, span_id y trace_flags. */
export function w3cTraceFields(t: TraceInfo | undefined): Record<string, string> {
  if (!t) return {}
  return {
    trace_id: t.traceId,
    ...(t.spanId ? { span_id: t.spanId } : {}),
    ...(t.sampled !== undefined ? { trace_flags: t.sampled ? "01" : "00" } : {}),
  }
}
