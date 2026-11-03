// OpenTelemetry básico (§2.7.4). Se importa PRIMERO en main.ts para instrumentar http y fetch (undici, que usa
// supabase-js) antes de que Nest los cargue. Apagado salvo que se configure un exportador con las variables estándar:
//   OTEL_TRACES_EXPORTER=otlp  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318  (colector de OTel como sidecar en
//   Cloud Run → Cloud Trace)   ·   OTEL_TRACES_EXPORTER=console (local)
//   OTEL_TRACES_SAMPLER=parentbased_traceidratio OTEL_TRACES_SAMPLER_ARG=0.1 (muestreo en producción)
// Se propaga `traceparent` (W3C) desde el front; los logs llevan el mismo traceId (logging/trace.ts).
import type { NodeSDK } from "@opentelemetry/sdk-node"

let sdk: NodeSDK | undefined

export function telemetryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.OTEL_SDK_DISABLED === "true") return false
  const exp = (env.OTEL_TRACES_EXPORTER ?? "").trim()
  return exp !== "" && exp !== "none"
}

if (telemetryEnabled()) {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { NodeSDK } = require("@opentelemetry/sdk-node") as typeof import("@opentelemetry/sdk-node")
  const { HttpInstrumentation } = require("@opentelemetry/instrumentation-http") as typeof import("@opentelemetry/instrumentation-http")
  const { UndiciInstrumentation } = require("@opentelemetry/instrumentation-undici") as typeof import("@opentelemetry/instrumentation-undici")
  /* eslint-enable @typescript-eslint/no-require-imports */
  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "mirai-api",
    instrumentations: [
      new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => /^\/(healthz|readyz)\b/.test(req.url ?? "") }),
      new UndiciInstrumentation(),
    ],
  })
  sdk.start()
}

/** Envía las trazas pendientes al apagar (lo llama el ciclo de vida de Nest). */
export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown().catch(() => undefined)
  sdk = undefined
}
