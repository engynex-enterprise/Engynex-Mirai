import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { assetsContract as c } from "@mirai/contracts/modules/assets"
import { MinRole } from "../../core/context/decorators"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { ok } from "../book-tables/http"
import { AssetsService } from "./assets.service"

@Controller()
export class AssetsController {
  constructor(private readonly svc: AssetsService) {}

  @TsRestHandler(c.reconcile)
  @MinRole("editor")
  @Idempotent()
  reconcile() {
    return tsRestHandler(c.reconcile, async ({ params, body }) => ok(await this.svc.reconcile(params.id, body.saldo)))
  }

  @TsRestHandler(c.unreconcile)
  @MinRole("editor")
  unreconcile() {
    return tsRestHandler(c.unreconcile, async ({ params }) => ok(await this.svc.unreconcile(params.id)))
  }

  @TsRestHandler(c.snapshot)
  @MinRole("editor")
  snapshot() {
    return tsRestHandler(c.snapshot, async ({ params, body }) => ok(await this.svc.snapshot(params.mes, body)))
  }
}
