import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { accountantPortalContract as c } from "@mirai/contracts/modules/tax"
import { AccountantToken, Portal, type PortalAccess } from "./accountant-token.guard"
import { AccountantService } from "./accountant.service"

/** /v1/accountant/:token/**: sin sesión; AccountantTokenGuard revisa el token, el límite y el plan. */
@Controller()
@AccountantToken()
export class AccountantController {
  constructor(private readonly svc: AccountantService) {}

  @TsRestHandler(c.open)
  open(@Portal() a: PortalAccess) {
    return tsRestHandler(c.open, async () => ({ status: 200, body: await this.svc.open(a) }))
  }

  @TsRestHandler(c.notes)
  notes(@Portal() a: PortalAccess) {
    return tsRestHandler(c.notes, async () => ({ status: 200, body: await this.svc.notes(a) }))
  }

  @TsRestHandler(c.addNote)
  addNote(@Portal() a: PortalAccess) {
    return tsRestHandler(c.addNote, async ({ body }) => ({ status: 200, body: { ok: true as const, data: await this.svc.addNote(a, body.texto) } }))
  }

  @TsRestHandler(c.fileUrl)
  fileUrl(@Portal() a: PortalAccess) {
    return tsRestHandler(c.fileUrl, async ({ query }) => ({ status: 200, body: await this.svc.fileUrl(a, query.path) }))
  }
}
