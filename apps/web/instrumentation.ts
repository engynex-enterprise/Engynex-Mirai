// Instrumentación del servidor de Next.
// · OpenTelemetry (V7-Q): solo runtime nodejs y solo con OTEL_EXPORTER_OTLP_ENDPOINT u OTEL_TRACES_EXPORTER
//   (lib/telemetry/config.ts). El SDK se carga con import dinámico: apagado no pesa. service.name=mirai-web; las
//   llamadas SSR a la API llevan el traceparent de la traza activa (lib/telemetry/traceparent.ts).
// · Sentry: solo si existe NEXT_PUBLIC_SENTRY_DSN (Ajustes › Integraciones › Sentry). Si OpenTelemetry está encendido,
//   Sentry se inicia con `enableOpenTelemetrySetup: false` (en @sentry/nextjs 11 reemplaza al viejo
//   `skipOpenTelemetrySetup`): así NO registra su propio proveedor global de trazas y no pelea con el nuestro; sigue
//   capturando errores (onRequestError) y sus propias trazas nativas. Sin OpenTelemetry, Sentry queda como antes.
import * as Sentry from "@sentry/nextjs"
import { webTelemetryPlan } from "./lib/telemetry/config"

export async function register() {
  let otel = false
  if (process.env.NEXT_RUNTIME === "nodejs" && webTelemetryPlan(process.env, "-").enabled) {
    const { startWebTelemetry } = await import("./lib/telemetry/node")
    otel = startWebTelemetry()
  }
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    ...(otel ? { enableOpenTelemetrySetup: false } : {}),
  })
}

export const onRequestError = Sentry.captureRequestError
