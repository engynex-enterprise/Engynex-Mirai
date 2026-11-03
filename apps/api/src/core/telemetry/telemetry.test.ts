// V7-Q: plan de OpenTelemetry desde el entorno, puente de logs pino → OTLP, campos de traza neutros y métricas.
import { context, logs, metrics, ROOT_CONTEXT, SeverityNumber, trace, type Context, type ContextManager, type LogRecord } from "@opentelemetry/api"
import { afterEach, describe, expect, it } from "vitest"
import { createLogger, defaultDestination } from "../logging/logger"
import { flattenAttributes, logContext, otlpLogStream, toLogRecord } from "../logging/otlp-logs"
import { w3cTraceFields } from "../logging/trace"
import { exportersOf, logsBridgeEnabled, resourceAttributesVar, serviceNameFor, telemetryPlan } from "./config"
import { shutdownTelemetry, startTelemetry, telemetryEnabled } from "../../otel"
import { countEnqueue, countFiles, recordFileBytes, recordJob, resetMetricsCache } from "./metrics"

const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736"
const SPAN = "00f067aa0ba902b7"

/** Administrador de contexto mínimo (pila síncrona) para tener un "span activo" sin el SDK. */
class StackContextManager implements ContextManager {
  private stack: Context[] = []
  active() { return this.stack[this.stack.length - 1] ?? ROOT_CONTEXT }
  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(ctx: Context, fn: F, thisArg?: ThisParameterType<F>, ...args: A): ReturnType<F> {
    this.stack.push(ctx)
    try { return fn.call(thisArg, ...args) } finally { this.stack.pop() }
  }
  bind<T>(_ctx: Context, target: T) { return target }
  enable() { return this }
  disable() { this.stack = []; return this }
}

const withSpan = <T>(fn: () => T, sampled = true) =>
  context.with(trace.setSpanContext(ROOT_CONTEXT, { traceId: TRACE, spanId: SPAN, traceFlags: sampled ? 1 : 0 }), fn)

afterEach(() => {
  context.disable()
  logs.disable()
  metrics.disable()
  resetMetricsCache()
})

describe("plan de OpenTelemetry (variables OTEL_* estándar)", () => {
  it("apagado por defecto: sin exportadores no hay SDK", () => {
    const p = telemetryPlan({}, { instanceId: "i" })
    expect(p.enabled).toBe(false)
    expect(p.overrides).toMatchObject({ OTEL_TRACES_EXPORTER: "none", OTEL_METRICS_EXPORTER: "none", OTEL_LOGS_EXPORTER: "none" })
  })
  it("cada señal se enciende sola; las no pedidas quedan en none (el SDK asumiría otlp)", () => {
    const p = telemetryPlan({ OTEL_TRACES_EXPORTER: "otlp", OTEL_METRICS_EXPORTER: " OTLP , console" }, { instanceId: "i" })
    expect(p.enabled).toBe(true)
    expect(p.signals).toEqual({ traces: ["otlp"], metrics: ["otlp", "console"], logs: [] })
    expect(p.overrides).toMatchObject({ OTEL_TRACES_EXPORTER: "otlp", OTEL_METRICS_EXPORTER: "otlp,console", OTEL_LOGS_EXPORTER: "none" })
  })
  it("none gana y OTEL_SDK_DISABLED=true apaga todo", () => {
    expect(exportersOf({ OTEL_TRACES_EXPORTER: "otlp,none" }, "traces")).toEqual([])
    expect(telemetryPlan({ OTEL_TRACES_EXPORTER: "otlp", OTEL_SDK_DISABLED: "TRUE" }).enabled).toBe(false)
  })
  it("recurso: service.name por MODE, versión, ambiente e instancia", () => {
    expect(serviceNameFor(undefined)).toBe("mirai-api")
    expect(serviceNameFor("realtime")).toBe("mirai-realtime")
    expect(serviceNameFor("worker")).toBe("mirai-worker")
    expect(serviceNameFor("x y")).toBe("mirai-api")
    const p = telemetryPlan({ MODE: "worker", APP_VERSION: "6.1.0", MIRAI_ENV: "pruebas", OTEL_TRACES_EXPORTER: "otlp" }, { instanceId: "abc" })
    expect(p.resource).toEqual({ "service.name": "mirai-worker", "service.namespace": "mirai", "service.version": "6.1.0", "deployment.environment.name": "pruebas", "service.instance.id": "abc" })
    expect(p.overrides.OTEL_RESOURCE_ATTRIBUTES).toBe("service.name=mirai-worker,service.namespace=mirai,service.version=6.1.0,deployment.environment.name=pruebas,service.instance.id=abc")
  })
  it("OTEL_RESOURCE_ATTRIBUTES va al final (gana) y los valores se codifican", () => {
    expect(resourceAttributesVar({ "service.version": "1,0=x" }, "cloud.region=us-central1")).toBe("service.version=1%2C0%3Dx,cloud.region=us-central1")
    expect(resourceAttributesVar({ a: "b" }, "  ")).toBe("a=b")
  })
  it("otel.ts no arranca nada sin exportadores ni toca el entorno", async () => {
    const env: NodeJS.ProcessEnv = { OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318" }
    expect(telemetryEnabled(env)).toBe(false)
    expect(startTelemetry(env)).toBe(false)
    expect(env).toEqual({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318" })
    await expect(shutdownTelemetry()).resolves.toBeUndefined()
  })
  it("el puente de logs solo con OTEL_LOGS_EXPORTER", () => {
    expect(logsBridgeEnabled({ OTEL_TRACES_EXPORTER: "otlp" })).toBe(false)
    expect(logsBridgeEnabled({ OTEL_LOGS_EXPORTER: "otlp" })).toBe(true)
    expect(logsBridgeEnabled({ OTEL_LOGS_EXPORTER: "otlp", OTEL_SDK_DISABLED: "true" })).toBe(false)
    expect(defaultDestination({ level: "info", service: "mirai-api" }, {})).toBeUndefined()
    expect(defaultDestination({ level: "info", service: "mirai-api" }, { OTEL_LOGS_EXPORTER: "otlp" })).toBeDefined()
  })
})

describe("campos de traza neutros en los logs", () => {
  it("w3cTraceFields", () => {
    expect(w3cTraceFields({ traceId: TRACE, spanId: SPAN, sampled: true })).toEqual({ trace_id: TRACE, span_id: SPAN, trace_flags: "01" })
    expect(w3cTraceFields({ traceId: TRACE, sampled: false })).toEqual({ trace_id: TRACE, trace_flags: "00" })
    expect(w3cTraceFields(undefined)).toEqual({})
  })
  it("con un span activo la línea lleva trace_id/span_id/trace_flags y los de Cloud Logging", () => {
    context.setGlobalContextManager(new StackContextManager())
    const lines: Record<string, unknown>[] = []
    const log = createLogger({ level: "info", service: "mirai-api", version: "1", project: "p", destination: { write: (s: string) => void lines.push(JSON.parse(s)) } })
    withSpan(() => log.info("con traza"))
    log.info("sin traza")
    expect(lines[0]).toMatchObject({ message: "con traza", trace_id: TRACE, span_id: SPAN, trace_flags: "01", "logging.googleapis.com/trace": `projects/p/traces/${TRACE}`, "logging.googleapis.com/spanId": SPAN })
    expect(lines[1]).not.toHaveProperty("trace_id")
  })
})

describe("puente pino → OpenTelemetry Logs", () => {
  const line = {
    severity: "ERROR", time: "2026-11-02T10:00:00.000Z", message: "falló", serviceContext: { service: "mirai-api" },
    requestId: "r1", httpRequest: { status: 500, latency: "0.1s" }, tags: ["a"], error: { name: "Error", message: "x", stack_trace: "Error: x" },
    trace_id: TRACE, span_id: SPAN, trace_flags: "01", "logging.googleapis.com/trace": TRACE,
  }
  it("toLogRecord: severidad, cuerpo, hora, atributos planos y exception.*", () => {
    const r = toLogRecord(line, ROOT_CONTEXT)
    expect(r).toMatchObject({ severityText: "ERROR", severityNumber: SeverityNumber.ERROR, body: "falló" })
    expect((r.timestamp as Date).toISOString()).toBe("2026-11-02T10:00:00.000Z")
    expect(r.attributes).toEqual({
      requestId: "r1", "httpRequest.status": 500, "httpRequest.latency": "0.1s", tags: "[\"a\"]",
      "error.name": "Error", "error.message": "x", "error.stack_trace": "Error: x",
      "exception.type": "Error", "exception.message": "x", "exception.stacktrace": "Error: x",
    })
  })
  it("contexto: el span activo, o el de trace_id/span_id de la línea, o ninguno", () => {
    const fromLine = logContext(line, ROOT_CONTEXT)
    expect(trace.getSpanContext(fromLine!)).toMatchObject({ traceId: TRACE, spanId: SPAN, traceFlags: 1, isRemote: true })
    expect(logContext({ message: "x" }, ROOT_CONTEXT)).toBeUndefined()
    const active = trace.setSpanContext(ROOT_CONTEXT, { traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: 1 })
    expect(logContext(line, active)).toBe(active)
  })
  it("flattenAttributes ignora vacíos y limita la profundidad", () => {
    expect(flattenAttributes({ a: null, b: { c: { d: { e: { f: 1 } } } } })).toEqual({ "b.c.d.e": "{\"f\":1}" })
  })
  it("el stream emite por el LoggerProvider global y no se cae con basura", () => {
    const got: LogRecord[] = []
    logs.setGlobalLoggerProvider({ getLogger: () => ({ emit: (r: LogRecord) => void got.push(r), enabled: () => true }) } as never)
    const s = otlpLogStream("mirai-api")
    s.write(JSON.stringify({ severity: "INFO", message: "hola" }) + "\n{no json\n")
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ body: "hola", severityNumber: SeverityNumber.INFO })
  })
})

describe("métricas de negocio (nombres que usa infra/otel/dashboards)", () => {
  it("crea mirai.queue.* y mirai.files.* con sus atributos", () => {
    const seen: { kind: string; name: string; unit?: string; value: number; attrs: unknown }[] = []
    const inst = (kind: string, name: string, unit?: string) => {
      const rec = (value: number, attrs: unknown) => void seen.push({ kind, name, unit, value, attrs })
      return { add: rec, record: rec }
    }
    metrics.setGlobalMeterProvider({
      getMeter: () => ({ createCounter: (n: string, o?: { unit?: string }) => inst("counter", n, o?.unit), createHistogram: (n: string, o?: { unit?: string }) => inst("histogram", n, o?.unit) }),
    } as never)
    resetMetricsCache()
    countEnqueue({ driver: "pg", queue: "notify", deduped: false })
    recordJob({ driver: "pg", queue: "notify", ok: true }, 12)
    countFiles({ op: "sign-upload", bucket: "avatars", driver: "gcs" })
    recordFileBytes({ bucket: "avatars", driver: "gcs" }, 2048)
    expect(seen).toEqual([
      { kind: "counter", name: "mirai.queue.enqueued", unit: undefined, value: 1, attrs: { driver: "pg", queue: "notify", deduped: false } },
      { kind: "histogram", name: "mirai.queue.job.duration", unit: "ms", value: 12, attrs: { driver: "pg", queue: "notify", ok: true } },
      { kind: "counter", name: "mirai.files.ops", unit: undefined, value: 1, attrs: { ok: true, op: "sign-upload", bucket: "avatars", driver: "gcs" } },
      { kind: "histogram", name: "mirai.files.bytes", unit: "By", value: 2048, attrs: { bucket: "avatars", driver: "gcs" } },
    ])
  })
})
