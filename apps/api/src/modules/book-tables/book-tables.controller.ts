// Controller (§2.1): valida con el contrato (ts-rest + zod), declara el rol mínimo y llama UN método del servicio.
// Leer el libro: cualquier integrante ("Solo mira" en adelante). La RLS filtra igual que hoy.
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { bookTablesContract } from "@mirai/contracts/modules/book-tables"
import { MinRole } from "../../core/context/decorators"
import { BookTablesService } from "./book-tables.service"

@Controller()
export class BookTablesController {
  constructor(private readonly svc: BookTablesService) {}

  @TsRestHandler(bookTablesContract.list)
  @MinRole("viewer")
  list() {
    return tsRestHandler(bookTablesContract.list, async ({ params, query }) => ({ status: 200, body: await this.svc.list(params.table, query) }))
  }

  @TsRestHandler(bookTablesContract.snapshot)
  @MinRole("viewer")
  snapshot() {
    return tsRestHandler(bookTablesContract.snapshot, async ({ query }) => ({ status: 200, body: await this.svc.snapshot(query.parts) }))
  }
}
