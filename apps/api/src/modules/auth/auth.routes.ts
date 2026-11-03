// Monta el handler de Better Auth en Fastify bajo /api/auth/* (§3.1.2). Es una ruta de Fastify directa (no de Nest):
// Better Auth hace su propia validación, límites de intentos, revisión de Origin y cookies. Solo con AUTH_PROVIDER=mirai.
// El balanceador del mismo origen (mirai.engynex.com/api/auth/*) o el proxy de la web en local llegan aquí.
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import { HttpAdapterHost } from "@nestjs/core"
import type { Logger } from "pino"
import { AUTH_BASE_PATH } from "@mirai/contracts/modules/auth"
import { LOGGER } from "../../core/logging/logger"
import { MiraiAuthService } from "./mirai-auth.service"

// Tipos mínimos de Fastify (la API no depende de `fastify` directamente: lo trae @nestjs/platform-fastify).
type FastifyRequest = { url: string; method: string; headers: Record<string, string | string[] | undefined>; body?: unknown; rawBody?: Buffer | string }
type FastifyReply = { status(code: number): FastifyReply; header(k: string, v: unknown): FastifyReply; send(b?: unknown): FastifyReply }
type FastifyInstance = { route(o: { method: string[]; url: string; handler: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): unknown }

const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "content-length", "host"])

/** Petición de Fastify → Request web (lo que entiende Better Auth). */
export function toWebRequest(req: FastifyRequest, baseURL: string): Request {
  const url = new URL(req.url, baseURL)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined || HOP.has(k)) continue
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x))
    else headers.set(k, String(v))
  }
  const method = req.method.toUpperCase()
  let body: string | Buffer | undefined
  if (method !== "GET" && method !== "HEAD") {
    const raw = req.rawBody
    body = raw ?? (req.body === undefined || req.body === null ? undefined : typeof req.body === "string" || Buffer.isBuffer(req.body) ? (req.body as string | Buffer) : JSON.stringify(req.body))
  }
  return new Request(url, { method, headers, body: body as BodyInit | undefined })
}

/** Response web → respuesta de Fastify (varias Set-Cookie, sin encabezados de salto). */
export async function sendWebResponse(res: Response, reply: FastifyReply) {
  reply.status(res.status)
  res.headers.forEach((v, k) => {
    if (k === "set-cookie" || HOP.has(k)) return
    reply.header(k, v)
  })
  const cookies = res.headers.getSetCookie()
  if (cookies.length) reply.header("set-cookie", cookies)
  if (!res.headers.has("cache-control")) reply.header("cache-control", "no-store")
  const buf = Buffer.from(await res.arrayBuffer())
  return reply.send(buf.length ? buf : undefined)
}

@Injectable()
export class AuthRoutes implements OnModuleInit {
  constructor(
    private readonly host: HttpAdapterHost,
    private readonly auth: MiraiAuthService,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  onModuleInit() {
    if (!this.auth.enabled) return
    const fastify = this.host.httpAdapter?.getInstance<FastifyInstance>()
    if (!fastify) return
    const handler = async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        return await sendWebResponse(await this.auth.instance.handler(toWebRequest(req, this.auth.values.baseURL)), reply)
      } catch (e) {
        this.log.error({ err: { message: (e as Error).message, stack_trace: (e as Error).stack } }, "Error en /api/auth")
        return reply.status(500).send({ ok: false, code: "INTERNAL", msg: "Algo salió mal al iniciar sesión. Intenta de nuevo en un momento." })
      }
    }
    fastify.route({ method: ["GET", "POST"], url: `${AUTH_BASE_PATH}/*`, handler })
    this.log.info({ base: AUTH_BASE_PATH }, "Auth propio (Better Auth) montado")
  }
}
