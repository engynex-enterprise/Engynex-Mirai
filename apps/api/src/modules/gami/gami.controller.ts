// Controller de logros y referidos (§2.1).
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { gamiContract as c } from "@mirai/contracts/modules/gami"
import { MinRole } from "../../core/context/decorators"
import { ok } from "../book-tables/http"
import { GamiService } from "./gami.service"

@Controller()
export class GamiController {
  constructor(private readonly svc: GamiService) {}

  @TsRestHandler(c.get)
  @MinRole("viewer")
  get() {
    return tsRestHandler(c.get, async ({ query }) => ({ status: 200, body: await this.svc.get(query.hoy) }))
  }

  @TsRestHandler(c.visit)
  @MinRole("viewer")
  visit() {
    return tsRestHandler(c.visit, async ({ query }) => ok(await this.svc.visit(query.hoy)))
  }

  @TsRestHandler(c.check)
  @MinRole("viewer")
  check() {
    return tsRestHandler(c.check, async ({ query }) => ok(await this.svc.check(query.hoy)))
  }

  @TsRestHandler(c.logros)
  @MinRole("viewer")
  logros() {
    return tsRestHandler(c.logros, async ({ body }) => ok(await this.svc.logros(body)))
  }

  @TsRestHandler(c.referrals)
  referrals() {
    return tsRestHandler(c.referrals, async () => ({ status: 200, body: await this.svc.referidos() }))
  }
}
