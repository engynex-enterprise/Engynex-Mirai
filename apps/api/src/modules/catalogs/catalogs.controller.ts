// Controller (§2.1): valida con el contrato (ts-rest + zod), declara el rol mínimo y llama UN método del servicio.
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { catalogsContract } from "@mirai/contracts/modules/catalogs"
import { MinRole } from "../../core/context/decorators"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { ok } from "../book-tables/http"
import { CatalogsService } from "./catalogs.service"
import { RegistrosService } from "./registros.service"

@Controller()
export class CatalogsController {
  constructor(
    private readonly svc: CatalogsService,
    private readonly registros: RegistrosService,
  ) {}

  @TsRestHandler(catalogsContract.listCategories)
  @MinRole("viewer")
  listCategories() {
    return tsRestHandler(catalogsContract.listCategories, async ({ query }) => ({ status: 200, body: await this.svc.listCategories(query) }))
  }

  @TsRestHandler(catalogsContract.resolve)
  @MinRole("registra")
  @Idempotent()
  resolve() {
    return tsRestHandler(catalogsContract.resolve, async ({ body }) => ok(await this.registros.resolve(body.registro, body.crear)))
  }
}
