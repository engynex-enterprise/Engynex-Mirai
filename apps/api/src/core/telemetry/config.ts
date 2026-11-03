// Plan de OpenTelemetry a partir de las variables ESTÁNDAR `OTEL_*` (V7-Q, §3.0 regla 3). Puro: no arranca nada.
//
// Regla de Mirai: cada señal (trazas, métricas, logs) se enciende SOLO si su variable lo pide
//   OTEL_TRACES_EXPORTER=otlp|console   OTEL_METRICS_EXPORTER=otlp|console|prometheus   OTEL_LOGS_EXPORTER=otlp|console
// Sin ninguna (o con OTEL_SDK_DISABLED=true) el SDK ni se carga: cero costo. El NodeSDK, por defecto, asume `otlp` para
// las señales sin variable; por eso el plan pone `none` explícito en las que no se pidieron.
// El destino es estándar (OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_PROTOCOL, OTEL_TRACES_SAMPLER(_ARG)…) y lo lee
// el SDK directamente: normalmente un colector sidecar en http://localhost:4318 (infra/otel/).
//
// Recurso: service.name = mirai-<MODE> (mirai-api, mirai-realtime, mirai-worker), service.version = APP_VERSION,
// deployment.environment.name = MIRAI_ENV, service.namespace = mirai y service.instance.id único por proceso. Van ANTES
// de OTEL_RESOURCE_ATTRIBUTES (el último gana) y OTEL_SERVICE_NAME manda sobre service.name, como dice la especificación.

export type Signal = "traces" | "metrics" | "logs"

export const EXPORTER_VAR: Record<Signal, string> = {
  traces: "OTEL_TRACES_EXPORTER",
  metrics: "OTEL_METRICS_EXPORTER",
  logs: "OTEL_LOGS_EXPORTER",
}

export type TelemetryPlan = {
  /** Hay al menos una señal encendida y el SDK no está desactivado. */
  enabled: boolean
  /** Exportadores pedidos por señal (vacío = apagada). */
  signals: Record<Signal, string[]>
  /** Variables que se fijan en process.env antes de crear el NodeSDK (que las lee de ahí). */
  overrides: Record<string, string>
  /** Atributos del recurso que pone Mirai (los de OTEL_RESOURCE_ATTRIBUTES los pisan). */
  resource: Record<string, string>
}

type Env = Record<string, string | undefined>

/** Lista de exportadores de una señal; `none` la apaga aunque venga con otros. */
export function exportersOf(env: Env, signal: Signal): string[] {
  const list = String(env[EXPORTER_VAR[signal]] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s !== "" && s !== "null")
  return list.includes("none") ? [] : [...new Set(list)]
}

/** OTEL_SDK_DISABLED=true (sin importar mayúsculas) apaga todo. */
export const sdkDisabled = (env: Env) => String(env.OTEL_SDK_DISABLED ?? "").trim().toLowerCase() === "true"

/** Nombre del servicio según MODE (api | realtime | worker…). */
export function serviceNameFor(mode: string | undefined): string {
  const m = String(mode ?? "").trim().toLowerCase()
  return /^[a-z][a-z0-9-]{0,30}$/.test(m) ? `mirai-${m}` : "mirai-api"
}

/** Atributos del recurso de Mirai (sin los del entorno). */
export function miraiResource(env: Env, instanceId: string, defaultService?: string): Record<string, string> {
  return {
    "service.name": defaultService ?? serviceNameFor(env.MODE),
    "service.namespace": "mirai",
    "service.version": env.APP_VERSION?.trim() || "0.0.0",
    "deployment.environment.name": env.MIRAI_ENV?.trim() || "local",
    "service.instance.id": instanceId,
  }
}

/** `k=v,k=v` con los valores codificados como pide OTEL_RESOURCE_ATTRIBUTES; los del entorno van al final y ganan. */
export function resourceAttributesVar(ours: Record<string, string>, fromEnv: string | undefined): string {
  const mine = Object.entries(ours).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join(",")
  const extra = String(fromEnv ?? "").trim()
  return extra ? `${mine},${extra}` : mine
}

export type PlanOptions = { instanceId?: string; defaultService?: string }

export function telemetryPlan(env: Env = process.env, o: PlanOptions = {}): TelemetryPlan {
  const signals = { traces: exportersOf(env, "traces"), metrics: exportersOf(env, "metrics"), logs: exportersOf(env, "logs") }
  const enabled = !sdkDisabled(env) && (signals.traces.length > 0 || signals.metrics.length > 0 || signals.logs.length > 0)
  const resource = miraiResource(env, o.instanceId ?? globalThis.crypto.randomUUID(), o.defaultService)
  const overrides: Record<string, string> = { OTEL_RESOURCE_ATTRIBUTES: resourceAttributesVar(resource, env.OTEL_RESOURCE_ATTRIBUTES) }
  for (const s of Object.keys(EXPORTER_VAR) as Signal[]) overrides[EXPORTER_VAR[s]] = signals[s].join(",") || "none"
  return { enabled, signals, overrides, resource }
}

/** Los logs de pino también salen por el Logs SDK (además de stdout). */
export function logsBridgeEnabled(env: Env = process.env): boolean {
  const p = telemetryPlan(env, { instanceId: "-" })
  return p.enabled && p.signals.logs.length > 0
}
