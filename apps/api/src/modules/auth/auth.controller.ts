import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { authContract as c } from "@mirai/contracts/modules/auth"
import { Public } from "../../core/auth/decorators"
import { PlatformAdmin } from "../../core/context/decorators"
import { AuthService } from "./auth.service"

const ok = <T>(data: T) => ({ status: 200 as const, body: { ok: true as const, data } })

/** /v1/auth/**, /v1/me/consents y las sesiones de la consola (lo de auth que no monta Better Auth). */
@Controller()
export class AuthController {
  constructor(private readonly svc: AuthService) {}

  @Public()
  @TsRestHandler(c.config)
  config() {
    return tsRestHandler(c.config, async () => ({ status: 200, body: await this.svc.config() }))
  }

  @TsRestHandler(c.consents)
  consents() {
    return tsRestHandler(c.consents, async () => ({ status: 200, body: await this.svc.consents() }))
  }

  @TsRestHandler(c.acceptConsent)
  acceptConsent() {
    return tsRestHandler(c.acceptConsent, async ({ body }) => ok(await this.svc.acceptConsent(body.version)))
  }

  @TsRestHandler(c.setPassword)
  setPassword() {
    return tsRestHandler(c.setPassword, async ({ body }) => ok(await this.svc.setPassword(body.newPassword)))
  }

  @TsRestHandler(c.mfa)
  mfa() {
    return tsRestHandler(c.mfa, async () => ({ status: 200, body: await this.svc.mfa() }))
  }
}

/** Sesiones de una persona en la consola (solo administradores de la plataforma). */
@Controller()
@PlatformAdmin()
export class AuthAdminController {
  constructor(private readonly svc: AuthService) {}

  @TsRestHandler(c.adminSessions)
  sessions() {
    return tsRestHandler(c.adminSessions, async ({ params }) => ({ status: 200, body: await this.svc.adminSessions(params.userId) }))
  }

  @TsRestHandler(c.adminRevokeSessions)
  revoke() {
    return tsRestHandler(c.adminRevokeSessions, async ({ params }) => ok(await this.svc.adminRevokeSessions(params.userId)))
  }
}
