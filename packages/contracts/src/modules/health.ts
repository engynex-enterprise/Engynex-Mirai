// Módulo `health & meta` (docs/arquitectura/v6-separacion-front-back.md §2.6 y §2.7.9). Dueño: F2-B.
// /healthz (vida: solo responde), /readyz (base, JWKS y ENCRYPTION_KEY) y /v1/version. /docs (OpenAPI) solo en pruebas.
import { initContract } from "@ts-rest/core"
import { z } from "zod"

export const meta = { id: "health", owner: "F2-B" } as const

export const Check = z.object({ ok: z.boolean(), ms: z.number().optional(), msg: z.string().optional() })
export const Readiness = z.object({ ok: z.boolean(), checks: z.record(z.string(), Check) })
export type Readiness = z.infer<typeof Readiness>
export const Version = z.object({ name: z.literal("mirai-api"), version: z.string(), commit: z.string(), env: z.string(), mode: z.enum(["api", "realtime"]), startedAt: z.string() })

const c = initContract()
export const healthContract = c.router({
  healthz: { method: "GET", path: "/healthz", responses: { 200: z.object({ ok: z.literal(true) }) }, summary: "Vida (Cloud Run startup/liveness)" },
  readyz: { method: "GET", path: "/readyz", responses: { 200: Readiness, 503: Readiness }, summary: "Listo para recibir tráfico" },
  version: { method: "GET", path: "/v1/version", responses: { 200: Version }, summary: "Versión desplegada" },
})
