// traceparent W3C de la traza ACTIVA de OpenTelemetry (servidor de Next, V7-Q). Con el SDK encendido
// (instrumentation.ts) las llamadas SSR a la API quedan como hijas del span de Next (render, route handler…), así la
// traza va web → api → base de datos de punta a punta. Sin SDK (o en el navegador) no hay span activo y se usa el
// traceparent aleatorio de siempre. Solo @opentelemetry/api (sin proveedor ni nube).
import { context, isSpanContextValid, propagation, trace, type Context } from "@opentelemetry/api"
import { newTraceparent } from "@/lib/api/fetcher"

/**
 * 1) El propagador global (W3C tracecontext por defecto en el NodeSDK) sobre el contexto activo;
 * 2) si el propagador no dio traceparent (p. ej. solo hay el de Sentry), se arma con el span activo;
 * 3) si no hay span activo, `fallback()` (uno aleatorio).
 */
export function activeTraceparent(fallback: () => string = newTraceparent, ctx: Context = context.active()): string {
  const carrier: Record<string, string> = {}
  propagation.inject(ctx, carrier)
  if (carrier.traceparent) return carrier.traceparent
  const sc = trace.getSpanContext(ctx)
  if (sc && isSpanContextValid(sc)) return `00-${sc.traceId}-${sc.spanId}-${(sc.traceFlags & 1) === 1 ? "01" : "00"}`
  return fallback()
}
