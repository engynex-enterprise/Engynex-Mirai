// BookGuard (§2.2), global: en toda ruta con `:bookId` comprueba que la persona sea miembro del hogar del libro (si no,
// 404 sin revelar que el libro existe), guarda libro, rol y plan en el contexto y aplica @MinRole, @Can y @Premium.
// Al ser global, una ruta nueva bajo /v1/books/:bookId queda protegida aunque su autor olvide la guarda.
import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { Uuid } from "@mirai/contracts/common"
import { atLeast, can, deniedMsg, ROLE_INFO, type AccessRole, type Perm } from "@mirai/domain/household/roles"
import { can as planCan, FEATURES, type PremiumFeature } from "@mirai/domain/plans"
import { IS_PUBLIC } from "../auth/decorators"
import { DomainError } from "../errors/domain-error"
import { AppContextService } from "./app-context.service"
import { CAN, MIN_ROLE, PREMIUM } from "./decorators"
import { RequestContextService } from "./request-context.service"

export const NOT_MEMBER_MSG = "No encontramos ese libro."
export const roleMsg = (min: AccessRole) => `Tu rol no permite hacer esto en este hogar (necesitas «${ROLE_INFO[min].label}» o más).`
export const planMsg = (f: PremiumFeature) => `${FEATURES[f].label} no está incluido en tu plan. Conoce los planes en /planes.`

@Injectable()
export class BookGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly contexts: AppContextService,
    private readonly ctx: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true
    const targets = [context.getHandler(), context.getClass()]
    const minRole = this.reflector.getAllAndOverride<AccessRole | undefined>(MIN_ROLE, targets)
    const perm = this.reflector.getAllAndOverride<Perm | undefined>(CAN, targets)
    const feature = this.reflector.getAllAndOverride<PremiumFeature | undefined>(PREMIUM, targets)
    const req = context.switchToHttp().getRequest<{ params?: Record<string, string> }>()
    const bookId = req.params?.bookId

    if (bookId === undefined || this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      // Reglas del libro en una ruta sin libro: error de quien escribió la ruta, no de la persona.
      if (minRole || perm || feature) throw DomainError.internal(new Error(`@MinRole/@Can/@Premium en una ruta sin :bookId o pública (${context.getClass().name}.${context.getHandler().name})`))
      return true
    }
    if (!Uuid.safeParse(bookId).success) throw DomainError.notFound(NOT_MEMBER_MSG)

    const access = await this.contexts.bookAccess(this.ctx.user, bookId)
    if (!access) throw DomainError.notFound(NOT_MEMBER_MSG)
    this.ctx.patch({ bookAccess: access })

    if (minRole && !atLeast(access.access, minRole)) throw DomainError.role(roleMsg(minRole))
    if (perm && !can(access.access, perm)) throw DomainError.role(deniedMsg(perm))
    if (feature && !planCan(access.plan, feature)) throw DomainError.plan(planMsg(feature))
    return true
  }
}
