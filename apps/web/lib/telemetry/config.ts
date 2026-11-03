// Plan de OpenTelemetry del servidor de Next (V7-Q) con las variables ESTÁNDAR `OTEL_*`. Puro: no arranca nada.
// Se enciende solo si hay OTEL_EXPORTER_OTLP_ENDPOINT u OTEL_TRACES_EXPORTER (y OTEL_SDK_DISABLED no es true):
//   · trazas: OTEL_TRACES_EXPORTER o, si solo está el endpoint, `otlp`;
//   · métricas y logs: solo si OTEL_METRICS_EXPORTER / OTEL_LOGS_EXPORTER lo piden (el NodeSDK asumiría `otlp`).
// Recurso: service.name=mirai-web (OTEL_SERVICE_NAME manda), service.version=NEXT_PUBLIC_BUILD_ID y
// deployment.environment.name=MIRAI_ENV (o VERCEL_ENV / NODE_ENV mientras siga en Vercel). OTEL_RESOURCE_ATTRIBUTES gana.

type Env = Record<string, string | undefined>
export type WebTelemetryPlan = { enabled: boolean; overrides: Record<string, string> }

const list = (v: string | undefined) => String(v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => s !== "" && s !== "null")
const signal = (v: string | undefined, fallback: string[] = []) => {
  const l = list(v)
  if (l.includes("none")) return "none"
  return (l.length ? [...new Set(l)] : fallback).join(",") || "none"
}

export function webTelemetryPlan(env: Env, instanceId: string): WebTelemetryPlan {
  const disabled = String(env.OTEL_SDK_DISABLED ?? "").trim().toLowerCase() === "true"
  const endpoint = Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim())
  const traces = signal(env.OTEL_TRACES_EXPORTER, endpoint ? ["otlp"] : [])
  const metrics = signal(env.OTEL_METRICS_EXPORTER)
  const logs = signal(env.OTEL_LOGS_EXPORTER)
  const enabled = !disabled && (endpoint || list(env.OTEL_TRACES_EXPORTER).length > 0) && [traces, metrics, logs].some((s) => s !== "none")
  const ours: Record<string, string> = {
    "service.name": "mirai-web",
    "service.namespace": "mirai",
    "service.version": env.NEXT_PUBLIC_BUILD_ID?.trim() || "dev",
    "deployment.environment.name": env.MIRAI_ENV?.trim() || env.VERCEL_ENV?.trim() || env.NODE_ENV?.trim() || "local",
    "service.instance.id": instanceId,
  }
  const mine = Object.entries(ours).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join(",")
  const extra = String(env.OTEL_RESOURCE_ATTRIBUTES ?? "").trim()
  return {
    enabled,
    overrides: {
      OTEL_TRACES_EXPORTER: traces,
      OTEL_METRICS_EXPORTER: metrics,
      OTEL_LOGS_EXPORTER: logs,
      OTEL_RESOURCE_ATTRIBUTES: extra ? `${mine},${extra}` : mine,
    },
  }
}
