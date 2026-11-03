// AuthGuard global (§2.2): exige `Authorization: Bearer <JWT>` salvo en rutas @Public() y carga la persona en el
// contexto de la petición. Reemplaza el getClaims de proxy.ts y de getAppContext.
import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { RequestContextService } from "../context/request-context.service"
import { DomainError } from "../errors/domain-error"
import { IS_PUBLIC } from "./decorators"
import { TokenVerifier } from "./token-verifier"

export function bearer(header: string | string[] | undefined): string | null {
  const h = Array.isArray(header) ? header[0] : header
  const m = /^Bearer\s+(\S+)$/i.exec(String(h ?? "").trim())
  return m ? m[1] : null
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly ctx: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])
    if (isPublic) return true
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>()
    const token = bearer(req.headers.authorization)
    if (!token) throw DomainError.unauthenticated("Inicia sesión para continuar.")
    const user = await this.verifier.verify(token)
    this.ctx.patch({ user })
    return true
  }
}
