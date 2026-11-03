// Errores de la API (§2.7.2). Los servicios lanzan DomainError con un mensaje en español para la persona; el filtro
// global lo convierte en `{ ok:false, msg, code, requestId, details? }` con el código HTTP de API_ERROR_STATUS.
import { API_ERROR_STATUS, type ApiErrorCode } from "@mirai/contracts/common"

export const INTERNAL_MSG = "Algo salió mal de nuestro lado. Intenta de nuevo en un momento."

export class DomainError extends Error {
  readonly status: number
  constructor(
    readonly code: ApiErrorCode,
    /** Texto para la persona (español, tuteo). Nunca el error interno. */
    readonly msg: string,
    readonly details?: unknown,
    options?: { cause?: unknown; headers?: Record<string, string> },
  ) {
    super(msg, options?.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = "DomainError"
    this.status = API_ERROR_STATUS[code]
    this.headers = options?.headers
  }
  readonly headers?: Record<string, string>

  static unauthenticated(msg = "Tu sesión venció. Vuelve a iniciar sesión.") {
    return new DomainError("UNAUTHENTICATED", msg, undefined, { headers: { "www-authenticate": 'Bearer realm="mirai"' } })
  }
  static role(msg = "Tu rol no permite hacer esto en este hogar.") {
    return new DomainError("ROLE_DENIED", msg)
  }
  static plan(msg: string) {
    return new DomainError("PLAN_REQUIRED", msg)
  }
  static notFound(msg = "No encontramos lo que buscas.", details?: unknown) {
    return new DomainError("NOT_FOUND", msg, details)
  }
  static validation(msg = "Revisa los datos que enviaste.", details?: unknown) {
    return new DomainError("VALIDATION", msg, details)
  }
  static conflict(msg: string, details?: unknown) {
    return new DomainError("CONFLICT", msg, details)
  }
  static rateLimited(msg: string, retryAfterS: number) {
    return new DomainError("RATE_LIMITED", msg, undefined, { headers: { "retry-after": String(Math.max(1, Math.ceil(retryAfterS))) } })
  }
  static upstream(msg = "Un servicio externo no respondió. Intenta de nuevo en un momento.", cause?: unknown) {
    return new DomainError("UPSTREAM", msg, undefined, { cause })
  }
  static internal(cause?: unknown) {
    return new DomainError("INTERNAL", INTERNAL_MSG, undefined, { cause })
  }

  /**
   * Traduce un error de PostgREST / Postgres (supabase-js o pg) a DomainError (§6.2: `DomainError.fromPg`).
   * 42501 (RLS) → ROLE_DENIED · P0001 (raise exception de una función, ya en español) → VALIDATION con ese texto ·
   * 23505 → CONFLICT · 23503 → CONFLICT · PGRST116 → NOT_FOUND · 22P02/22007/23502/23514 → VALIDATION ·
   * 57014 / fallas de red → UPSTREAM · JWT vencido → UNAUTHENTICATED · lo demás → INTERNAL (sin revelar el detalle).
   */
  static fromPg(e: unknown): DomainError {
    if (e instanceof DomainError) return e
    const err = (e ?? {}) as { code?: string; message?: string; name?: string }
    const code = String(err.code ?? "")
    const message = String(err.message ?? "")
    switch (code) {
      case "42501":
        return new DomainError("ROLE_DENIED", "Tu rol no permite hacer esto en este hogar.", undefined, { cause: e })
      case "P0001":
        return new DomainError("VALIDATION", message || "No se pudo completar la operación.", undefined, { cause: e })
      case "23505":
        return new DomainError("CONFLICT", "Ya existe un registro igual.", undefined, { cause: e })
      case "23503":
        return new DomainError("CONFLICT", "Este registro depende de otro que no existe o que está en uso.", undefined, { cause: e })
      case "PGRST116":
        return new DomainError("NOT_FOUND", "No encontramos ese registro.", undefined, { cause: e })
      case "22P02":
      case "22007":
      case "23502":
      case "23514":
        return new DomainError("VALIDATION", "Algún dato tiene un formato inválido.", undefined, { cause: e })
      case "57014":
        return new DomainError("UPSTREAM", "La base de datos tardó demasiado. Intenta de nuevo en un momento.", undefined, { cause: e })
      case "PGRST301":
      case "PGRST303":
        return DomainError.unauthenticated()
    }
    if (/jwt expired/i.test(message)) return DomainError.unauthenticated()
    if (err.name === "AbortError" || /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(message))
      return new DomainError("UPSTREAM", "No pudimos conectarnos con la base de datos. Intenta de nuevo en un momento.", undefined, { cause: e })
    return DomainError.internal(e)
  }
}
