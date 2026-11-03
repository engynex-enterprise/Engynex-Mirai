import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { meContract } from "@mirai/contracts/modules/me"
import { MeService } from "./me.service"

@Controller()
export class MeController {
  constructor(private readonly svc: MeService) {}

  @TsRestHandler(meContract.get)
  get() {
    return tsRestHandler(meContract.get, async ({ query }) => ({ status: 200, body: await this.svc.get(query.bookId) }))
  }
}
