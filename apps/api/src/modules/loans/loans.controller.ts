import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { loansContract as c } from "@mirai/contracts/modules/loans"
import { MinRole } from "../../core/context/decorators"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { ok } from "../book-tables/http"
import { LoansService } from "./loans.service"

@Controller()
export class LoansController {
  constructor(private readonly svc: LoansService) {}

  @TsRestHandler(c.create)
  @MinRole("editor")
  @Idempotent()
  create() {
    return tsRestHandler(c.create, async ({ body }) => ok(await this.svc.create(body)))
  }

  @TsRestHandler(c.pay)
  @MinRole("editor")
  @Idempotent()
  pay() {
    return tsRestHandler(c.pay, async ({ params, body }) => ok(await this.svc.pay(params.id, body)))
  }
}
