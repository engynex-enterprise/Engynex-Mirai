import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { accountContract as c } from "@mirai/contracts/modules/account"
import { AccountService } from "./account.service"

const ok = <T>(data: T) => ({ status: 200 as const, body: { ok: true as const, data } })

/** /v1/account/**: siempre de la persona del token (no hay rutas con id de otra cuenta). */
@Controller()
export class AccountController {
  constructor(private readonly svc: AccountService) {}

  @TsRestHandler(c.get)
  get() {
    return tsRestHandler(c.get, async ({ query }) => ({ status: 200, body: await this.svc.load(query.householdId) }))
  }

  @TsRestHandler(c.requestEmailChange)
  requestEmailChange() {
    return tsRestHandler(c.requestEmailChange, async ({ body }) => ok(await this.svc.requestEmailChange(body.email)))
  }

  @TsRestHandler(c.resendEmailChange)
  resendEmailChange() {
    return tsRestHandler(c.resendEmailChange, async () => ok(await this.svc.resendEmailChange()))
  }

  @TsRestHandler(c.cancelEmailChange)
  cancelEmailChange() {
    return tsRestHandler(c.cancelEmailChange, async () => ok(await this.svc.cancelEmailChange()))
  }

  @TsRestHandler(c.removePassword)
  removePassword() {
    return tsRestHandler(c.removePassword, async () => ok(await this.svc.removeMethod({ kind: "password" })))
  }

  @TsRestHandler(c.removeGoogle)
  removeGoogle() {
    return tsRestHandler(c.removeGoogle, async ({ params }) => ok(await this.svc.removeMethod({ kind: "google", identityId: params.identityId })))
  }

  @TsRestHandler(c.sessions)
  sessions() {
    return tsRestHandler(c.sessions, async () => ({ status: 200, body: await this.svc.sessions() }))
  }

  @TsRestHandler(c.revokeSession)
  revokeSession() {
    return tsRestHandler(c.revokeSession, async ({ params }) => ok(await this.svc.revokeSession(params.sessionId)))
  }

  @TsRestHandler(c.signOutEverywhere)
  signOutEverywhere() {
    return tsRestHandler(c.signOutEverywhere, async () => ok(await this.svc.signOutEverywhere()))
  }

  @TsRestHandler(c.remove)
  remove() {
    return tsRestHandler(c.remove, async ({ body }) => ok(await this.svc.remove(body.confirm)))
  }
}
