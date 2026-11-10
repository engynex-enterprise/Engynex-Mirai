// Resultados `{ ok: false, msg }` de @mirai/ai (lo que la web muestra tal cual) → DomainError con el MISMO texto (§2.7.2).
// El código sale de la causa: plan (402), créditos o límite (429), configuración o datos (400), no existe (404), ya no
// está pendiente (409), rol (403) y, si no, el proveedor o la lectura falló (502).
import { AiUnavailable } from "@mirai/ai/run"
import { DomainError } from "../../core/errors/domain-error"

const PLAN = /no est[aá] incluid[ao] en tu plan|parte de \*\*Mirai Premium/i
const LIMIT = /cr[eé]ditos de IA|l[ií]mite de|muchas consultas/i
const ROLE = /tu rol/i
const CONFIG = /apagada|desactivada|Activa un proveedor|Primero (guarda|vincula)|Pega la clave|Mes inv[aá]lido|Elige una foto|pesa m[aá]s|Usa una foto|Usa fotos|puede pesar|pasan de 6 MB|hasta 5 archivos|No lleg[oó] el audio|audio no soportado|audio es muy largo|Conecta tu cuenta|venci[oó]\. Vuelve|vac[ií]a|necesita|no son v[aá]lidos|no tiene lista|administra Mirai/i
const MISSING = /No encontramos/i
const DONE = /ya se cancel[oó]|ya no est[aá] pendiente/i

export function aiError(msg: string, cause?: unknown): DomainError {
  const text = msg.replace(/\*\*/g, "")
  if (PLAN.test(msg)) return DomainError.plan(text)
  if (LIMIT.test(msg)) return DomainError.rateLimited(text, 3600)
  if (ROLE.test(msg)) return DomainError.role(text)
  if (MISSING.test(msg)) return DomainError.notFound(text)
  if (DONE.test(msg)) return DomainError.conflict(text)
  if (CONFIG.test(msg)) return DomainError.validation(text)
  return DomainError.upstream(text, cause)
}

/** `{ ok: true, …datos }` → datos; `{ ok: false, msg }` → aiError(msg). */
export function unwrap<T extends { ok: boolean; msg?: string }>(r: T): Omit<Extract<T, { ok: true }>, "ok"> {
  if (!r.ok) throw aiError(r.msg ?? "No pudimos completar la acción con la IA. Intenta de nuevo.")
  const { ok: _ok, ...rest } = r as T & { ok: true }
  return rest as Omit<Extract<T, { ok: true }>, "ok">
}

/** Corre `f` y traduce AiUnavailable (plan, IA apagada, créditos, límite) y los errores con mensaje de una lectura. */
export async function ai<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f()
  } catch (e) {
    if (e instanceof DomainError) throw e
    if (e instanceof AiUnavailable) throw aiError(e.message, e)
    throw DomainError.fromPg(e)
  }
}
