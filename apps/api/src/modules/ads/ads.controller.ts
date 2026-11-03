// Controller de anuncios (§2.1): cualquier integrante del libro.
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { adsContract as c } from "@mirai/contracts/modules/ads"
import { MinRole } from "../../core/context/decorators"
import { AdsService } from "./ads.service"

@Controller()
export class AdsController {
  constructor(private readonly svc: AdsService) {}

  @TsRestHandler(c.eligible)
  @MinRole("viewer")
  eligible() {
    return tsRestHandler(c.eligible, async ({ query }) => ({ status: 200, body: await this.svc.eligible(query) }))
  }
}
