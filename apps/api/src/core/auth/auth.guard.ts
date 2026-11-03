// AuthGuard global (§2.2): exige `Authorization: Bearer <JWT>` salvo en rutas @Public() y carga la persona en el
// contexto de la petición. Reemplaza el getClaims de proxy.ts y de getAppContext.
import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { RequestContextService } from "../context/request-context.service"
import { DomainError } from "../errors/domain-error"
import { sessionCookieToken } from "./better-auth.verifier"
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
    const req = context.switchToHttp().getRequest<{ method?: string; headers: Record<string, string | string[] | undefined> }>()
    // v7: sin Bearer, la cookie httpOnly de Better Auth (mismo origen). Con AUTH_PROVIDER=supabase nadie la manda.
    const header = bearer(req.headers.authorization)
    const fromCookie = header ? null : sessionCookieToken(req.headers.cookie)
    const token = header ?? fromCookie
    if (!token) throw DomainError.unauthenticated("Inicia sesión para continuar.")
    // CSRF (§3.1.5): con la cookie, lo que cambia datos exige X-Mirai-Client (un formulario de otro sitio no puede ponerlo).
    if (fromCookie && !["GET", "HEAD", "OPTIONS"].includes(String(req.method ?? "GET").toUpperCase()) && !req.headers["x-mirai-client"])
      throw DomainError.unauthenticated("Abre Mirai desde su dirección oficial e intenta de nuevo.")
    const cookie = Array.isArray(req.headers.cookie) ? req.headers.cookie.join("; ") : req.headers.cookie
    const user = await this.verifier.verify(token, fromCookie ? { fromCookie: true, cookie } : undefined)
    this.ctx.patch({ user })
    return true
  }
}
