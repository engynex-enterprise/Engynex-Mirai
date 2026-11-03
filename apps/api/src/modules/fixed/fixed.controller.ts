import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { fixedContract as c } from "@mirai/contracts/modules/fixed"
import { MinRole } from "../../core/context/decorators"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { ok } from "../book-tables/http"
import { FixedService } from "./fixed.service"

@Controller()
export class FixedController {
  constructor(private readonly svc: FixedService) {}

  @TsRestHandler(c.pay)
  @MinRole("editor")
  @Idempotent()
  pay() {
    return tsRestHandler(c.pay, async ({ params, body }) => ok(await this.svc.pay(params.id, body)))
  }

  @TsRestHandler(c.unpay)
  @MinRole("editor")
  @Idempotent()
  unpay() {
    return tsRestHandler(c.unpay, async ({ params }) => ok(await this.svc.unpay(params.id)))
  }

  @TsRestHandler(c.charge)
  @MinRole("editor")
  @Idempotent()
  charge() {
    return tsRestHandler(c.charge, async ({ params, body }) => ok(await this.svc.charge(params.id, body)))
  }
}
