// V7-Q: traceparent de la traza activa (SSR → API) y plan de OpenTelemetry del servidor de Next.
import { context, propagation, ROOT_CONTEXT, trace, type Context, type ContextManager, type TextMapPropagator } from "@opentelemetry/api"
import { afterEach, describe, expect, it } from "vitest"
import { createRawFetch } from "@/lib/api/fetcher"
import { webTelemetryPlan } from "./config"
import { activeTraceparent } from "./traceparent"

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

const spanCtx = (sampled = true) => trace.setSpanContext(ROOT_CONTEXT, { traceId: TRACE, spanId: SPAN, traceFlags: sampled ? 1 : 0 })

afterEach(() => {
  context.disable()
  propagation.disable()
})

describe("activeTraceparent", () => {
  it("sin span activo: el de respaldo", () => {
    expect(activeTraceparent(() => "respaldo")).toBe("respaldo")
  })
  it("con span activo (sin propagador): lo arma con el span", () => {
    expect(activeTraceparent(() => "x", spanCtx())).toBe(`00-${TRACE}-${SPAN}-01`)
    expect(activeTraceparent(() => "x", spanCtx(false))).toBe(`00-${TRACE}-${SPAN}-00`)
  })
  it("usa el propagador global (propagation.inject) si da traceparent", () => {
    const fake: TextMapPropagator = {
      inject: (_ctx, carrier, setter) => setter.set(carrier, "traceparent", "00-11111111111111111111111111111111-2222222222222222-01"),
      extract: (ctx) => ctx,
      fields: () => ["traceparent"],
    }
    propagation.setGlobalPropagator(fake)
    expect(activeTraceparent(() => "x", spanCtx())).toBe("00-11111111111111111111111111111111-2222222222222222-01")
  })
  it("el fetcher SSR manda el traceparent del span ACTIVO (la API queda como hija del span de Next)", async () => {
    context.setGlobalContextManager(new StackContextManager())
    const calls: Record<string, string>[] = []
    const f = async (_u: string | URL | Request, init?: RequestInit) => {
      calls.push(init?.headers as Record<string, string>)
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
    }
    const raw = createRawFetch({ token: { get: async () => null }, fetch: f as typeof fetch, traceparent: () => activeTraceparent() })
    await context.with(spanCtx(), () => raw({ url: "u", method: "GET" }))
    await raw({ url: "u", method: "GET" })
    expect(calls[0].traceparent).toBe(`00-${TRACE}-${SPAN}-01`)
    expect(calls[1].traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
    expect(calls[1].traceparent).not.toContain(TRACE)
  })
})

describe("webTelemetryPlan", () => {
  it("apagado sin endpoint ni OTEL_TRACES_EXPORTER, o con OTEL_SDK_DISABLED", () => {
    expect(webTelemetryPlan({}, "i").enabled).toBe(false)
    expect(webTelemetryPlan({ OTEL_METRICS_EXPORTER: "otlp" }, "i").enabled).toBe(false)
    expect(webTelemetryPlan({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318", OTEL_SDK_DISABLED: "true" }, "i").enabled).toBe(false)
    expect(webTelemetryPlan({ OTEL_TRACES_EXPORTER: "none" }, "i").enabled).toBe(false)
  })
  it("solo el endpoint: trazas otlp; métricas y logs en none", () => {
    const p = webTelemetryPlan({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318", NEXT_PUBLIC_BUILD_ID: "abc123", MIRAI_ENV: "pruebas" }, "i1")
    expect(p.enabled).toBe(true)
    expect(p.overrides).toEqual({
      OTEL_TRACES_EXPORTER: "otlp",
      OTEL_METRICS_EXPORTER: "none",
      OTEL_LOGS_EXPORTER: "none",
      OTEL_RESOURCE_ATTRIBUTES: "service.name=mirai-web,service.namespace=mirai,service.version=abc123,deployment.environment.name=pruebas,service.instance.id=i1",
    })
  })
  it("respeta OTEL_TRACES_EXPORTER/OTEL_METRICS_EXPORTER y deja ganar a OTEL_RESOURCE_ATTRIBUTES", () => {
    const p = webTelemetryPlan({ OTEL_TRACES_EXPORTER: "console", OTEL_METRICS_EXPORTER: "otlp", OTEL_RESOURCE_ATTRIBUTES: "service.name=otro", NODE_ENV: "production" }, "i")
    expect(p.enabled).toBe(true)
    expect(p.overrides.OTEL_TRACES_EXPORTER).toBe("console")
    expect(p.overrides.OTEL_METRICS_EXPORTER).toBe("otlp")
    expect(p.overrides.OTEL_RESOURCE_ATTRIBUTES).toMatch(/deployment\.environment\.name=production,.*,service\.name=otro$/)
  })
})
