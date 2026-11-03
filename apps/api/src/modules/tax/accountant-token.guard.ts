// AccountantTokenGuard (§2.2, pendiente de F2-B, F2-I-4): las rutas /v1/accountant/:token/** no tienen sesión; el
// token del enlace es la credencial. Revisa, en este orden: formato del token (si no, 404), el límite
// `portalContador` por token (429), que el acceso exista, no esté revocado ni vencido (404 sin decir cuál) y el plan
// del hogar dueño del libro (si ya no incluye «impuestos», el portal muestra "bloqueado"). Deja el acceso en la
// petición para el servicio (@PortalAccess()). Equivale a shareByToken + liveShare + rateLimit de
// apps/web/features/contador/actions.ts.
import { applyDecorators, type CanActivate, createParamDecorator, type ExecutionContext, Injectable, UseGuards } from "@nestjs/common"
import { createHash } from "node:crypto"
import { can, toPlanInfo } from "@mirai/domain/plans"
import { Public } from "../../core/auth/decorators"
import { systemScope } from "../../core/db/scope"
import { DomainError } from "../../core/errors/domain-error"
import { Limiter } from "../households/limiter"
import { AccountantRepo } from "./accountant.repository"

export const PORTAL_GONE = "El acceso ya no está disponible."
export const TOKEN_RE = /^[\w-]{20,64}$/
export const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex")
export const PORTAL_SCOPE = systemScope("portal del contador (token)")

/** Acceso válido del portal. `planOk`: el plan del cliente aún incluye el acceso del contador. */
export type PortalAccess = {
  share: { id: string; book_id: string; label: string; perms: string; expires_at: string | null; owner: string }
  createdBy: string | null
  views: number
  planOk: boolean
}
type PortalReq = { params?: Record<string, string>; accountantPortal?: PortalAccess }

@Injectable()
export class AccountantTokenGuard implements CanActivate {
  constructor(
    private readonly repo: AccountantRepo,
    private readonly limiter: Limiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PortalReq>()
    const token = String(req.params?.token ?? "")
    if (!TOKEN_RE.test(token)) throw DomainError.notFound(PORTAL_GONE)
    await this.limiter.hit("portalContador", token.slice(0, 64), "Abriste el portal muchas veces seguidas")
    const s = await this.repo.shareByHash(PORTAL_SCOPE, tokenHash(token))
    if (!s || s.revoked_at || (s.expires_at && new Date(s.expires_at) < new Date())) throw DomainError.notFound(PORTAL_GONE)
    const [owner, bp] = await Promise.all([s.created_by ? this.repo.ownerName(PORTAL_SCOPE, s.created_by) : null, this.repo.bookPlan(PORTAL_SCOPE, s.book_id)])
    req.accountantPortal = {
      share: { id: s.id, book_id: s.book_id, label: s.label, perms: s.perms, expires_at: s.expires_at, owner: owner || "Tu cliente" },
      createdBy: s.created_by,
      views: s.views ?? 0,
      planOk: !!bp && can(toPlanInfo(bp.plan), "impuestos"),
    }
    return true
  }
}

/** Rutas del portal: sin sesión (@Public) y con el token revisado. */
export const AccountantToken = () => applyDecorators(Public(), UseGuards(AccountantTokenGuard))

/** El acceso que dejó AccountantTokenGuard. */
export const Portal = createParamDecorator((_: unknown, ctx: ExecutionContext): PortalAccess => {
  const a = ctx.switchToHttp().getRequest<PortalReq>().accountantPortal
  if (!a) throw DomainError.internal(new Error("@Portal() sin AccountantTokenGuard"))
  return a
})
