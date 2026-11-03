// Acceso tipado al contexto de la petición (nestjs-cls). Los servicios lo usan en vez de recibir req.
import { Injectable } from "@nestjs/common"
import { ClsService } from "nestjs-cls"
import type { AuthUser } from "../auth/token-verifier"
import { userScope, type UserScope } from "../db/scope"
import { DomainError } from "../errors/domain-error"
import { CTX, type BookAccess, type MiraiCls, type RequestContext } from "./request-context"

@Injectable()
export class RequestContextService {
  constructor(private readonly cls: ClsService<MiraiCls>) {}

  /** Contexto actual (lanza si se usa fuera de una petición). */
  get(): RequestContext {
    const c = this.cls.isActive() ? this.cls.get(CTX) : undefined
    if (!c) throw DomainError.internal(new Error("RequestContext fuera de una petición"))
    return c
  }

  /** Contexto actual o undefined (logs, tareas en segundo plano). */
  peek(): RequestContext | undefined {
    return this.cls.isActive() ? this.cls.get(CTX) : undefined
  }

  patch(p: Partial<RequestContext>) {
    Object.assign(this.get(), p)
  }

  get requestId() {
    return this.get().requestId
  }

  /** Persona autenticada (AuthGuard). */
  get user(): AuthUser {
    const u = this.get().user
    if (!u) throw DomainError.unauthenticated()
    return u
  }

  /** Alcance de base de datos con el JWT de la persona (aplica RLS). */
  get db(): UserScope {
    return userScope(this.user)
  }

  /** Libro de la ruta, ya revisado por BookGuard. */
  get book(): BookAccess {
    const b = this.get().bookAccess
    if (!b) throw DomainError.internal(new Error("bookAccess sin BookGuard: la ruta no tiene :bookId"))
    return b
  }
}
