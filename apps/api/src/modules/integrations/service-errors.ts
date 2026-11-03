// Errores de @mirai/services → DomainError (§2.7.2). ServiceError trae un mensaje para la persona; un error de un
// proveedor (Resend, Meta, Telegram, Google) también es legible (la web lo muestra igual) y sale como 502 UPSTREAM;
// lo demás es INTERNAL (sin revelar el detalle).
import { ServiceError } from "@mirai/services/runtime"
import { DomainError } from "../../core/errors/domain-error"

export function fromService(e: unknown, other: "UPSTREAM" | "INTERNAL" = "INTERNAL"): DomainError {
  if (e instanceof DomainError) return e
  if (e instanceof ServiceError) return new DomainError(e.code, e.message, undefined, { cause: e })
  if (other === "UPSTREAM" && e instanceof Error && e.message) return DomainError.upstream(e.message.slice(0, 500), e)
  return DomainError.fromPg(e)
}

/** Corre `f` y traduce sus errores. */
export async function service<T>(f: () => Promise<T>, other: "UPSTREAM" | "INTERNAL" = "INTERNAL"): Promise<T> {
  try {
    return await f()
  } catch (e) {
    throw fromService(e, other)
  }
}
