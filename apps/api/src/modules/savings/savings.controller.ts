import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { savingsContract as c } from "@mirai/contracts/modules/savings"
import { MinRole } from "../../core/context/decorators"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { ok } from "../book-tables/http"
import { SavingsService } from "./savings.service"

@Controller()
export class SavingsController {
  constructor(private readonly svc: SavingsService) {}

  @TsRestHandler(c.contribute)
  @MinRole("editor")
  @Idempotent()
  contribute() {
    return tsRestHandler(c.contribute, async ({ params, body }) => ok(await this.svc.contribute(params.id, body)))
  }

  @TsRestHandler(c.fundSave)
  @MinRole("editor")
  @Idempotent()
  fundSave() {
    return tsRestHandler(c.fundSave, async ({ body }) => ok(await this.svc.fundSave(body)))
  }

  @TsRestHandler(c.fundUse)
  @MinRole("editor")
  @Idempotent()
  fundUse() {
    return tsRestHandler(c.fundUse, async ({ body }) => ok(await this.svc.fundUse(body)))
  }

  @TsRestHandler(c.fund)
  @MinRole("editor")
  fund() {
    return tsRestHandler(c.fund, async ({ body }) => ok(await this.svc.fund(body)))
  }
}
