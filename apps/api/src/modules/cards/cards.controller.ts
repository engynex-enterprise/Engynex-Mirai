import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { cardsContract as c } from "@mirai/contracts/modules/cards"
import { MinRole } from "../../core/context/decorators"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { ok } from "../book-tables/http"
import { CardsService } from "./cards.service"

@Controller()
export class CardsController {
  constructor(private readonly svc: CardsService) {}

  @TsRestHandler(c.purchase)
  @MinRole("editor")
  @Idempotent()
  purchase() {
    return tsRestHandler(c.purchase, async ({ params, body }) => ok(await this.svc.purchase(params.id, body)))
  }

  @TsRestHandler(c.payment)
  @MinRole("editor")
  @Idempotent()
  payment() {
    return tsRestHandler(c.payment, async ({ params, body }) => ok(await this.svc.payment(params.id, body)))
  }
}
