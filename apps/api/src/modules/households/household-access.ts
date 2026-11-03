// Acceso a un hogar de la ruta `/v1/households/:householdId/**` (F2-I). BookGuard solo cubre `:bookId`, así que los
// servicios del hogar (households, billing) llaman a `of()` / `require()`: miembro del hogar (si no, 404 sin revelar
// que existe), rol fino, plan y la persona. Usa el mismo contexto cacheado que /v1/me (AppContextService).
import { Injectable } from "@nestjs/common"
import type { CtxProfile, RawAppContext } from "@mirai/domain/app-context"
import { atLeast, can, deniedMsg, toAccess, type AccessRole, type Perm } from "@mirai/domain/household/roles"
import { toPlanInfo, type PlanInfo } from "@mirai/domain/plans"
import { AppContextRepo } from "../../core/context/app-context.repo"
import { AppContextService } from "../../core/context/app-context.service"
import { roleMsg } from "../../core/context/book.guard"
import { RequestContextService } from "../../core/context/request-context.service"
import { userScope } from "../../core/db/scope"
import { DomainError } from "../../core/errors/domain-error"

export const NO_HOUSEHOLD_MSG = "No encontramos ese hogar."

/** La persona que llama, con los datos de su perfil que usan los textos (invitaciones, correos). */
export type Actor = { id: string; email: string; nombre: string; apodo: string }

export type HouseholdCtx = {
  household: { id: string; nombre: string }
  access: AccessRole
  plan: PlanInfo
  user: Actor
  raw: RawAppContext
}

export const actorOf = (profile: CtxProfile | null, id: string, claimsEmail?: string | null): Actor => ({
  id,
  email: profile?.email ?? claimsEmail ?? "",
  nombre: profile?.nombre || profile?.email || claimsEmail || "",
  apodo: profile?.apodo ?? "",
})

@Injectable()
export class HouseholdAccess {
  constructor(
    private readonly contexts: AppContextService,
    private readonly repo: AppContextRepo,
    private readonly ctx: RequestContextService,
  ) {}

  /** La persona (sin hogar: cuenta, bienvenida). */
  async actor(): Promise<{ user: Actor; raw: RawAppContext }> {
    const u = this.ctx.user
    const raw = await this.contexts.raw(u)
    return { user: actorOf(raw.profile, u.id, u.email), raw }
  }

  /** El hogar si la persona es miembro; 404 si no. */
  async of(householdId: string): Promise<HouseholdCtx> {
    const u = this.ctx.user
    const raw = await this.contexts.raw(u)
    const h = raw.households.find((x) => x.id === householdId)
    if (!h) throw DomainError.notFound(NO_HOUSEHOLD_MSG)
    const plan = toPlanInfo(h.plan !== undefined ? h.plan : await this.repo.planOf(userScope(u), h.id))
    return { household: { id: h.id, nombre: h.nombre }, access: toAccess(h.access_role, h.role), plan, user: actorOf(raw.profile, u.id, u.email), raw }
  }

  /** Miembro y con el permiso de la matriz de roles (403 "Tu rol no permite…"). */
  async can(householdId: string, perm: Perm): Promise<HouseholdCtx> {
    const h = await this.of(householdId)
    if (!can(h.access, perm)) throw DomainError.role(deniedMsg(perm))
    return h
  }

  /** Miembro con al menos ese rol. */
  async atLeast(householdId: string, min: AccessRole, msg?: string): Promise<HouseholdCtx> {
    const h = await this.of(householdId)
    if (!atLeast(h.access, min)) throw DomainError.role(msg ?? roleMsg(min))
    return h
  }

  /** Después de cambiar hogares o roles: el próximo /v1/me lee la base otra vez. */
  invalidate(userId = this.ctx.user.id) {
    this.contexts.invalidate(userId)
  }
}
