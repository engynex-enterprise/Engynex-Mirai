// Filtro global (§2.7.2): toda respuesta de error sale como `{ ok:false, msg, code, requestId, details? }` en español.
// INTERNAL nunca muestra el error real (queda en el log con su stack y el requestId para buscarlo).
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Inject } from "@nestjs/common"
import { TsRestRequestValidationError, TsRestResponseValidationError } from "@ts-rest/nest"
import type { Logger } from "pino"
import { API_ERROR_STATUS, type ApiError, type ApiErrorCode } from "@mirai/contracts/common"
import { currentContext, LOGGER } from "../logging/logger"
import { scrub } from "../logging/redact"
import { DomainError, INTERNAL_MSG } from "./domain-error"
import { ErrorReporter } from "./error-reporter"

type Reply = { status(n: number): Reply; header(k: string, v: string): Reply; send(b: unknown): unknown; sent?: boolean }
type Issue = { message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }

/** `{ campo: mensaje }` desde los issues de Standard Schema (lo que trae ts-rest con zod 4). */
export function issuesToDetails(issues: ReadonlyArray<Issue>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of issues) {
    const k = (i.path ?? []).map((p) => String(typeof p === "object" && p !== null ? p.key : p)).join(".") || "_"
    if (!(k in out)) out[k] = i.message
  }
  return out
}

const BY_STATUS: Record<number, [ApiErrorCode, string]> = {
  400: ["VALIDATION", "No pudimos leer los datos que enviaste."],
  401: ["UNAUTHENTICATED", "Inicia sesión para continuar."],
  403: ["ROLE_DENIED", "No tienes permiso para hacer esto."],
  404: ["NOT_FOUND", "Esta ruta no existe."],
  405: ["NOT_FOUND", "Esta ruta no existe."],
  409: ["CONFLICT", "Hay un conflicto con los datos actuales. Recarga e intenta de nuevo."],
  413: ["VALIDATION", "Lo que enviaste es demasiado grande."],
  415: ["VALIDATION", "Ese tipo de contenido no se acepta."],
  429: ["RATE_LIMITED", "Hiciste muchas peticiones seguidas. Espera un momento."],
}

/** Convierte cualquier excepción en [status, ApiError, headers, ¿inesperada?]. Exportado para las pruebas. */
export function toApiError(e: unknown, requestId?: string): { status: number; body: ApiError; headers: Record<string, string>; unexpected: boolean } {
  const withId = (b: Omit<ApiError, "requestId">): ApiError => ({ ...b, ...(requestId ? { requestId } : {}) })
  if (e instanceof DomainError) {
    const body = withId({ ok: false, msg: e.msg, code: e.code, ...(e.details !== undefined ? { details: e.details } : {}) })
    return { status: e.status, body, headers: e.headers ?? {}, unexpected: e.code === "INTERNAL" }
  }
  if (e instanceof TsRestRequestValidationError) {
    const issues = [...(e.pathParams?.issues ?? []), ...(e.query?.issues ?? []), ...(e.headers?.issues ?? []), ...(e.body?.issues ?? [])] as Issue[]
    // Un :bookId o :id que no es UUID se trata como "no existe" (no revela nada).
    return { status: 400, body: withId({ ok: false, code: "VALIDATION", msg: "Revisa los datos del formulario.", details: issuesToDetails(issues) }), headers: {}, unexpected: false }
  }
  if (e instanceof TsRestResponseValidationError) {
    return { status: 500, body: withId({ ok: false, code: "INTERNAL", msg: INTERNAL_MSG }), headers: {}, unexpected: true }
  }
  const status = e instanceof HttpException ? e.getStatus() : Number((e as { statusCode?: unknown })?.statusCode) || 500
  const known = BY_STATUS[status]
  if (known && status < 500) return { status, body: withId({ ok: false, code: known[0], msg: known[1] }), headers: {}, unexpected: false }
  if (status === 502 || status === 503 || status === 504)
    return { status: API_ERROR_STATUS.UPSTREAM, body: withId({ ok: false, code: "UPSTREAM", msg: "Un servicio externo no respondió. Intenta de nuevo en un momento." }), headers: {}, unexpected: true }
  return { status: 500, body: withId({ ok: false, code: "INTERNAL", msg: INTERNAL_MSG }), headers: {}, unexpected: true }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @Inject(LOGGER) private readonly log: Logger,
    private readonly reporter: ErrorReporter,
  ) {}

  catch(e: unknown, host: ArgumentsHost) {
    if (host.getType() !== "http") throw e
    const reply = host.switchToHttp().getResponse<Reply>()
    const c = currentContext()
    const { status, body, headers, unexpected } = toApiError(e, c?.requestId)
    if (unexpected) {
      const cause = e instanceof DomainError && e.cause !== undefined ? e.cause : e
      this.log.error({ error: cause, code: body.code, status }, "Error inesperado")
      this.reporter.report(cause, { requestId: c?.requestId, route: c?.route, userId: c?.user?.id })
    } else if (status >= 400) {
      this.log.info({ code: body.code, status, ...(body.details ? { details: scrub(body.details) } : {}) }, body.msg)
    }
    if (reply.sent) return
    for (const [k, v] of Object.entries(headers)) reply.header(k, v)
    reply.header("cache-control", "no-store")
    reply.status(status).send(body)
  }
}
