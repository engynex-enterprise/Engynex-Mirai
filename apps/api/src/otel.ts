// OpenTelemetry portable (§2.7.4, V7-Q). Se importa PRIMERO en main.ts para instrumentar http y fetch (undici) antes de
// que Nest los cargue. Solo variables estándar `OTEL_*` (plan en core/telemetry/config.ts); apagado por defecto:
//   OTEL_TRACES_EXPORTER=otlp  OTEL_METRICS_EXPORTER=otlp  OTEL_LOGS_EXPORTER=otlp|none
//   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318  OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf (o grpc → :4317)
//   OTEL_TRACES_SAMPLER=parentbased_traceidratio  OTEL_TRACES_SAMPLER_ARG=0.1 (muestreo en producción)
//   OTEL_RESOURCE_ATTRIBUTES=k=v,…  OTEL_SERVICE_NAME=…  OTEL_SDK_DISABLED=true
// El destino es un colector OpenTelemetry sidecar (infra/otel/) que cada nube conecta a su backend (Cloud Trace /
// Monitoring, X-Ray / CloudWatch, Azure Monitor). Se propaga `traceparent` (W3C) desde el front; los logs llevan el
// mismo trace_id (logging/trace.ts) y, con OTEL_LOGS_EXPORTER=otlp, también salen por OTLP (logging/otlp-logs.ts).
// Métricas: http.server.request.duration (instrumentación http) + las de negocio (core/telemetry/metrics.ts).
import type { NodeSDK } from "@opentelemetry/sdk-node"
import { telemetryPlan, type TelemetryPlan } from "./core/telemetry/config"

let sdk: NodeSDK | undefined
let active: TelemetryPlan | undefined

/** Hay alguna señal pedida (y OTEL_SDK_DISABLED no es true). */
export function telemetryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return telemetryPlan(env, { instanceId: "-" }).enabled
}

/** El plan con el que arrancó el SDK (undefined si está apagado). */
export const activeTelemetry = () => active

/** Arranca el SDK si el entorno lo pide. Idempotente. Devuelve si quedó encendido. */
export function startTelemetry(env: NodeJS.ProcessEnv = process.env): boolean {
  if (sdk) return true
  const plan = telemetryPlan(env)
  if (!plan.enabled) return false
  // El NodeSDK lee process.env: señales no pedidas → `none`; recurso de Mirai antes del de OTEL_RESOURCE_ATTRIBUTES.
  Object.assign(env, plan.overrides)
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { NodeSDK } = require("@opentelemetry/sdk-node") as typeof import("@opentelemetry/sdk-node")
  const { HttpInstrumentation } = require("@opentelemetry/instrumentation-http") as typeof import("@opentelemetry/instrumentation-http")
  const { UndiciInstrumentation } = require("@opentelemetry/instrumentation-undici") as typeof import("@opentelemetry/instrumentation-undici")
  /* eslint-enable @typescript-eslint/no-require-imports */
  sdk = new NodeSDK({
    instrumentations: [
      new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => /^\/(healthz|readyz)\b/.test(req.url ?? "") }),
      new UndiciInstrumentation(),
    ],
  })
  sdk.start()
  active = plan
  return true
}

startTelemetry()

/**
 * Vacía y apaga trazas, métricas y logs (lo llama el ciclo de vida de Nest). Con tope de tiempo: Cloud Run da 10 s
 * después del SIGTERM y un colector caído no debe trabar el apagado.
 */
export async function shutdownTelemetry(timeoutMs = 5000): Promise<void> {
  const s = sdk
  sdk = undefined
  active = undefined
  if (!s) return
  let timer: NodeJS.Timeout | undefined
  await Promise.race([
    s.shutdown().catch(() => undefined),
    new Promise<void>((r) => {
      timer = setTimeout(r, timeoutMs)
      timer.unref?.()
    }),
  ])
  if (timer) clearTimeout(timer)
}
