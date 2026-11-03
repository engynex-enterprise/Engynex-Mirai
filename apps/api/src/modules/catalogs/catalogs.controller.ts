// Controller (§2.1): valida con el contrato (ts-rest + zod), declara el rol mínimo y llama UN método del servicio.
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { catalogsContract } from "@mirai/contracts/modules/catalogs"
import { MinRole } from "../../core/context/decorators"
import { CatalogsService } from "./catalogs.service"

@Controller()
export class CatalogsController {
  constructor(private readonly svc: CatalogsService) {}

  @TsRestHandler(catalogsContract.listCategories)
  @MinRole("viewer")
  listCategories() {
    return tsRestHandler(catalogsContract.listCategories, async ({ query }) => ({ status: 200, body: await this.svc.listCategories(query) }))
  }
}
