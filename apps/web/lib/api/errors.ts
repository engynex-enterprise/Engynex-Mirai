// Errores de la API de Mirai en el front (v6 F2-H-1). La API siempre responde `{ ok:false, msg, code, requestId? }`
// (packages/contracts/src/common.ts › ApiError) con un `msg` en español para la persona. Si la respuesta no trae ese
// cuerpo (un proxy, un 502 de Cloud Run, sin internet), se usa un mensaje claro según el código HTTP.
// Puro (navegador y servidor): se prueba en errors.test.ts.
import type { ApiErrorCode } from "@mirai/contracts/common"

const BY_STATUS: Record<number, { code: ApiErrorCode; msg: string }> = {
  400: { code: "VALIDATION", msg: "Revisa los datos: hay algo que no pudimos guardar así." },
  401: { code: "UNAUTHENTICATED", msg: "Tu sesión se cerró. Vuelve a entrar." },
  402: { code: "PLAN_REQUIRED", msg: "Esta función no está incluida en tu plan. Conoce los planes en /planes." },
  403: { code: "ROLE_DENIED", msg: "Tu rol no permite hacer esto en este hogar." },
  404: { code: "NOT_FOUND", msg: "No encontramos lo que buscas. Puede que ya no exista." },
  409: { code: "CONFLICT", msg: "Esto cambió mientras lo editabas o ya se está procesando. Intenta de nuevo en un momento." },
  413: { code: "VALIDATION", msg: "El archivo es muy grande." },
  429: { code: "RATE_LIMITED", msg: "Hiciste muchas solicitudes seguidas. Espera un momento y vuelve a intentar." },
  500: { code: "INTERNAL", msg: "Algo salió mal de nuestro lado. Intenta de nuevo en un momento." },
  502: { code: "UPSTREAM", msg: "Un servicio externo no respondió. Intenta de nuevo en un momento." },
  503: { code: "UPSTREAM", msg: "Mirai está ocupado en este momento. Intenta de nuevo en unos segundos." },
  504: { code: "UPSTREAM", msg: "Mirai tardó demasiado en responder. Intenta de nuevo." },
}

export const NETWORK_MSG = "No pudimos conectarnos con Mirai. Revisa tu conexión a internet."

/** Error de la API con el mensaje para la persona (`message`), el código, el estado HTTP y el id de la petición. */
export class ApiError extends Error {
  readonly code: ApiErrorCode | "NETWORK"
  readonly status: number
  readonly requestId?: string
  readonly details?: unknown
  /** Segundos que pide esperar la API (429 con Retry-After). */
  readonly retryAfter?: number

  constructor(o: { msg: string; code: ApiErrorCode | "NETWORK"; status: number; requestId?: string; details?: unknown; retryAfter?: number }) {
    super(o.msg)
    this.name = "ApiError"
    this.code = o.code
    this.status = o.status
    this.requestId = o.requestId
    this.details = o.details
    this.retryAfter = o.retryAfter
  }

  /** Sin respuesta del servidor (sin internet, DNS, CORS, la API apagada). */
  static network(): ApiError {
    return new ApiError({ msg: NETWORK_MSG, code: "NETWORK", status: 0 })
  }

  /** Desde una respuesta HTTP que no salió bien (con o sin cuerpo `{ ok:false, msg }`). */
  static from(status: number, body: unknown, headers?: Headers | null): ApiError {
    const fallback = BY_STATUS[status] ?? (status >= 500 ? BY_STATUS[500] : BY_STATUS[400])
    const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
    const msg = typeof b.msg === "string" && b.msg.trim() ? b.msg : fallback.msg
    const code = typeof b.code === "string" && b.code in CODES ? (b.code as ApiErrorCode) : fallback.code
    const ra = Number(headers?.get("retry-after"))
    return new ApiError({
      msg,
      code,
      status,
      requestId: typeof b.requestId === "string" ? b.requestId : undefined,
      details: b.details,
      retryAfter: Number.isFinite(ra) && ra > 0 ? ra : undefined,
    })
  }
}

const CODES: Record<ApiErrorCode, true> = {
  UNAUTHENTICATED: true, ROLE_DENIED: true, PLAN_REQUIRED: true, VALIDATION: true, RATE_LIMITED: true,
  NOT_FOUND: true, CONFLICT: true, UPSTREAM: true, INTERNAL: true,
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError

/** Mensaje para la persona de cualquier error (los de la API ya vienen en español). */
export const errorMsg = (e: unknown, fallback = BY_STATUS[500].msg) => (e instanceof Error && e.message ? e.message : fallback)

/** `{ ok:false, msg }` como lo devuelven las Server Actions (para las funciones de features/<x>/api.ts). */
export const failure = (e: unknown) => ({ ok: false as const, msg: errorMsg(e) })
