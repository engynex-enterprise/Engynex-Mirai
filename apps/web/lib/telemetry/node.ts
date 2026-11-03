// Arranque del SDK de OpenTelemetry en el servidor de Next (solo runtime nodejs, V7-Q). Lo carga instrumentation.ts
// con import dinámico SOLO si webTelemetryPlan() lo pide: apagado no pesa nada. Next ya crea sus spans (render, route
// handlers, fetch) con @opentelemetry/api; aquí solo se registra el proveedor que los exporta por OTLP al colector
// (infra/otel/). Nada de @vercel/otel ni de ningún proveedor.
import { NodeSDK } from "@opentelemetry/sdk-node"
import { webTelemetryPlan } from "./config"

let sdk: NodeSDK | undefined

export function startWebTelemetry(env: NodeJS.ProcessEnv = process.env): boolean {
  if (sdk) return true
  const plan = webTelemetryPlan(env, crypto.randomUUID())
  if (!plan.enabled) return false
  // El NodeSDK lee process.env: señales no pedidas → `none`; recurso de Mirai antes de OTEL_RESOURCE_ATTRIBUTES.
  Object.assign(env, plan.overrides)
  sdk = new NodeSDK()
  sdk.start()
  // Sin manejador de SIGTERM propio: Next ya maneja la señal (y agregar uno cambiaría cuándo sale el proceso). Lo
  // pendiente se exporta en lotes cada pocos segundos (OTEL_BSP_SCHEDULE_DELAY); al apagar se pierde a lo sumo eso.
  return true
}
