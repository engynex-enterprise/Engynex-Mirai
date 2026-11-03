// Arma el RequestContext al empezar cada petición (middleware de nestjs-cls, que en Fastify corre en onRequest).
import { randomUUID } from "node:crypto"
import type { IncomingMessage } from "node:http"
import type { ClsService, ClsStore } from "nestjs-cls"
import { parseTraceHeaders } from "../logging/trace"
import { safeUrl } from "../logging/redact"
import { CTX, type MiraiCls, type RequestContext } from "./request-context"

const REQ_ID = /^[\w.:-]{6,128}$/

export type CtxRequest = IncomingMessage & { miraiCtx?: RequestContext; originalUrl?: string }

/** Primera IP de X-Forwarded-For (Cloud Run / Google Front End) o la del socket. */
export function clientIp(req: IncomingMessage): string | undefined {
  const xff = req.headers["x-forwarded-for"]
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim()
  return first || req.socket?.remoteAddress || undefined
}

export function requestIdOf(req: IncomingMessage): string {
  const h = req.headers["x-request-id"]
  const v = Array.isArray(h) ? h[0] : h
  return v && REQ_ID.test(v) ? v : randomUUID()
}

export function setupContext(cls: ClsService<ClsStore>, req: CtxRequest) {
  const ctx: RequestContext = {
    requestId: requestIdOf(req),
    trace: parseTraceHeaders(req.headers),
    ip: clientIp(req),
    method: req.method,
    // middie (middleware de Nest en Fastify) recorta req.url al prefijo montado: originalUrl trae la ruta completa.
    route: safeUrl(req.originalUrl ?? req.url),
    startedAt: Date.now(),
  }
  ;(cls as ClsService<MiraiCls>).set(CTX, ctx)
  // También en la petición: el log de acceso (onResponse de Fastify) lo lee de aquí.
  req.miraiCtx = ctx
}
