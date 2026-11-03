// Controller de la campana (§2.1). Rutas de la persona (sin :bookId).
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { bellContract as c } from "@mirai/contracts/modules/notifications-bell"
import { BellService } from "./bell.service"

@Controller()
export class BellController {
  constructor(private readonly svc: BellService) {}

  @TsRestHandler(c.list)
  list() {
    return tsRestHandler(c.list, async ({ query }) => ({ status: 200, body: await this.svc.list(query) }))
  }

  @TsRestHandler(c.read)
  read() {
    return tsRestHandler(c.read, async ({ params }) => ({ status: 200, body: { ok: true as const, data: await this.svc.read(params.id) } }))
  }

  @TsRestHandler(c.readAll)
  readAll() {
    return tsRestHandler(c.readAll, async () => ({ status: 200, body: { ok: true as const, data: await this.svc.readAll() } }))
  }
}
