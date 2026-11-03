// SchedulerGuard (§2.2, §2.7.7): protege /v1/jobs/**. Acepta:
//  1. Token OIDC de Google (Cloud Scheduler / Cloud Tasks) con audiencia = SCHEDULER_AUDIENCE y emitido para una de
//     las cuentas de SCHEDULER_SERVICE_ACCOUNTS (correo verificado).
//  2. Durante la transición, `Authorization: Bearer CRON_SECRET` (lo que hoy mandan Vercel y pg_cron), comparado en
//     tiempo constante.
import { applyDecorators, type CanActivate, type ExecutionContext, Injectable, UseGuards } from "@nestjs/common"
import { createHash, timingSafeEqual } from "node:crypto"
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose"
import { AppConfig } from "../config/app-config"
import { RequestContextService } from "../context/request-context.service"
import { DomainError } from "../errors/domain-error"
import { bearer } from "./auth.guard"
import { Public } from "./decorators"

/** Compara dos secretos sin revelar cuántos caracteres coinciden (igual que bearerOk de apps/web). */
export function secretEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const ha = createHash("sha256").update(a).digest(), hb = createHash("sha256").update(b).digest()
  return timingSafeEqual(ha, hb)
}

/** Verificador del token OIDC de Google (puerto para poder probarlo con un JWKS local). */
export abstract class OidcVerifier {
  /** Devuelve el correo de la cuenta de servicio o lanza. */
  abstract verify(token: string, audience: string): Promise<string>
}

export class JoseOidcVerifier extends OidcVerifier {
  constructor(private readonly jwks: JWTVerifyGetKey) {
    super()
  }
  async verify(token: string, audience: string): Promise<string> {
    const { payload } = await jwtVerify(token, this.jwks, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience, algorithms: ["RS256"], clockTolerance: 30 })
    if (payload.email_verified !== true || typeof payload.email !== "string") throw new Error("Token sin correo verificado")
    return payload.email
  }
}

@Injectable()
export class GoogleOidcVerifier extends JoseOidcVerifier {
  constructor() {
    super(createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { cacheMaxAge: 60 * 60_000, timeoutDuration: 3_000 }))
  }
}

@Injectable()
export class SchedulerGuard implements CanActivate {
  constructor(
    private readonly config: AppConfig,
    private readonly oidc: OidcVerifier,
    private readonly ctx: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>()
    const token = bearer(req.headers.authorization)
    const { cronSecret, audience, serviceAccounts } = this.config.scheduler
    if (!token) throw DomainError.unauthenticated("Falta el token del programador de tareas.")
    if (cronSecret && secretEquals(token, cronSecret)) {
      this.ctx.patch({ caller: "secret" })
      return true
    }
    if (audience && serviceAccounts.length && token.split(".").length === 3) {
      try {
        const email = await this.oidc.verify(token, audience)
        if (serviceAccounts.includes(email)) {
          this.ctx.patch({ caller: `oidc:${email}` })
          return true
        }
      } catch {
        /* cae al 401 de abajo */
      }
    }
    throw DomainError.unauthenticated("Token del programador de tareas inválido.")
  }
}

/** Ruta de trabajo programado: sin sesión de persona, pero con OIDC de Scheduler/Tasks o CRON_SECRET. */
export const Scheduler = () => applyDecorators(Public(), UseGuards(SchedulerGuard))
