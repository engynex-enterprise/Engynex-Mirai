// Contexto de la petición (§2.2): se guarda en AsyncLocalStorage (nestjs-cls) para que el log, las trazas, las guardas
// y los repositorios lo lean sin pasarlo a mano. Equivale a lo que getAppContext (apps/web/lib/dal.ts) arma por petición.
import type { ClsStore } from "nestjs-cls"
import type { AccessRole } from "@mirai/domain/household/roles"
import type { PlanInfo } from "@mirai/domain/plans"
import type { AppHousehold } from "@mirai/domain/app-context"
import type { AuthUser } from "../auth/token-verifier"

export type TraceInfo = { traceId: string; spanId?: string; sampled?: boolean }

/** Libro de la ruta `/v1/books/:bookId/**` ya revisado por BookGuard (la persona es miembro). */
export type BookAccess = {
  book: { id: string; nombre: string; tipo: string; icon: string; household_id: string }
  household: AppHousehold
  access: AccessRole
  plan: PlanInfo
}

export type RequestContext = {
  requestId: string
  trace?: TraceInfo
  ip?: string
  method?: string
  route?: string
  startedAt: number
  user?: AuthUser
  bookAccess?: BookAccess
  /** Quién llamó a /v1/jobs/** (SchedulerGuard). */
  caller?: string
  idempotencyKey?: string
}

export const CTX = Symbol("mirai.ctx")
export interface MiraiCls extends ClsStore {
  [CTX]: RequestContext
}
