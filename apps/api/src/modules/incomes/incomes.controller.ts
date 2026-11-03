import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { incomesContract as c } from "@mirai/contracts/modules/incomes"
import { MinRole } from "../../core/context/decorators"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { ok } from "../book-tables/http"
import { IncomesService } from "./incomes.service"

@Controller()
export class IncomesController {
  constructor(private readonly svc: IncomesService) {}

  @TsRestHandler(c.plan)
  @MinRole("viewer")
  plan() {
    return tsRestHandler(c.plan, async ({ body }) => ok(await this.svc.plan(body)))
  }

  @TsRestHandler(c.save)
  @MinRole("registra")
  @Idempotent()
  save() {
    return tsRestHandler(c.save, async ({ body }) => ok(await this.svc.save(body)))
  }
}
