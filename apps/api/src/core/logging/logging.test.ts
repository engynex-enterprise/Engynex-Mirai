import { describe, expect, it } from "vitest"
import { createLogger } from "./logger"
import { safeUrl, scrub } from "./redact"
import { parseTraceHeaders, traceFields } from "./trace"

describe("trazas", () => {
  it("lee traceparent (W3C) y X-Cloud-Trace-Context", () => {
    expect(parseTraceHeaders({ traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" })).toEqual({ traceId: "4bf92f3577b34da6a3ce929d0e0e4736", spanId: "00f067aa0ba902b7", sampled: true })
    expect(parseTraceHeaders({ "x-cloud-trace-context": "105445aa7843bc8bf206b12000100000/1;o=1" })).toEqual({ traceId: "105445aa7843bc8bf206b12000100000", spanId: "0000000000000001", sampled: true })
    expect(parseTraceHeaders({ traceparent: "00-00000000000000000000000000000000-00f067aa0ba902b7-01" })).toBeUndefined()
    expect(parseTraceHeaders({})).toBeUndefined()
  })
  it("campos especiales de Cloud Logging", () => {
    expect(traceFields({ traceId: "abc", spanId: "def", sampled: false }, "mirai")).toEqual({ "logging.googleapis.com/trace": "projects/mirai/traces/abc", "logging.googleapis.com/spanId": "def", "logging.googleapis.com/trace_sampled": false })
    expect(traceFields(undefined, "mirai")).toEqual({})
  })
})

describe("qué no se registra", () => {
  it("scrub oculta secretos y montos", () => {
    expect(scrub({ authorization: "Bearer x", nested: { access_token: "t", valor: 85000, nombre: "Mercado", api_key: "k" }, lista: [{ saldo: 1 }] })).toEqual({ authorization: "[oculto]", nested: { access_token: "[oculto]", valor: "[oculto]", nombre: "Mercado", api_key: "[oculto]" }, lista: [{ saldo: "[oculto]" }] })
  })
  it("safeUrl quita la query y los tokens de la ruta", () => {
    expect(safeUrl("/v1/books/b/categories?grupo=x&token=y")).toBe("/v1/books/b/categories")
    expect(safeUrl("/v1/accountant/tok-secreto/notes")).toBe("/v1/accountant/:token/notes")
    expect(safeUrl("/v1/invitations/abc123/accept")).toBe("/v1/invitations/:token/accept")
  })
  it("formato de Cloud Logging: severity, message, time y serviceContext", () => {
    const lines: Record<string, unknown>[] = []
    const log = createLogger({ level: "info", service: "mirai-api", version: "1.0.0", destination: { write: (s: string) => void lines.push(JSON.parse(s)) } })
    log.warn({ req: { headers: { authorization: "Bearer secreto" } } }, "hola")
    log.error({ error: new Error("falló") }, "mal")
    expect(lines[0]).toMatchObject({ severity: "WARNING", message: "hola", serviceContext: { service: "mirai-api", version: "1.0.0" } })
    expect(typeof lines[0].time).toBe("string")
    expect(JSON.stringify(lines[0])).not.toContain("secreto")
    expect(lines[1]).toMatchObject({ severity: "ERROR", error: { name: "Error", message: "falló", stack_trace: expect.stringContaining("Error: falló") } })
  })
})
