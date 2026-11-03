import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { budgetContract as c } from "@mirai/contracts/modules/budget"
import { MinRole } from "../../core/context/decorators"
import { ok } from "../book-tables/http"
import { BudgetService } from "./budget.service"

@Controller()
export class BudgetController {
  constructor(private readonly svc: BudgetService) {}

  @TsRestHandler(c.tope)
  @MinRole("editor")
  tope() {
    return tsRestHandler(c.tope, async ({ params, body }) => ok(await this.svc.tope(params.id, body.tope)))
  }

  @TsRestHandler(c.topes)
  @MinRole("editor")
  topes() {
    return tsRestHandler(c.topes, async ({ body }) => ok(await this.svc.topes(body.topes)))
  }
}
