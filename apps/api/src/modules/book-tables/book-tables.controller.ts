// Controller (§2.1): valida con el contrato (ts-rest + zod), declara el rol mínimo y llama UN método del servicio.
// Leer el libro: cualquier integrante ("Solo mira" en adelante). La RLS filtra igual que hoy.
// Escribir (F2-D): desde "Registra sus gastos"; el rol fino por tabla, el plan y las filas propias los revisa
// BookWritesService con BOOK_TABLE_POLICY.
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { bookTablesContract } from "@mirai/contracts/modules/book-tables"
import { MinRole } from "../../core/context/decorators"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { BookTablesService } from "./book-tables.service"
import { BookWritesService } from "./book-writes.service"

@Controller()
export class BookTablesController {
  constructor(
    private readonly svc: BookTablesService,
    private readonly writes: BookWritesService,
  ) {}

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

  @TsRestHandler(bookTablesContract.upsert)
  @MinRole("registra")
  @Idempotent()
  upsert() {
    return tsRestHandler(bookTablesContract.upsert, async ({ params, body }) => ({ status: 200, body: await this.writes.upsert(params.table, params.id, body) }))
  }

  @TsRestHandler(bookTablesContract.remove)
  @MinRole("registra")
  @Idempotent()
  remove() {
    return tsRestHandler(bookTablesContract.remove, async ({ params }) => ({ status: 200, body: { ok: true as const, data: await this.writes.remove(params.table, params.id) } }))
  }

  @TsRestHandler(bookTablesContract.restore)
  @MinRole("registra")
  @Idempotent()
  restore() {
    return tsRestHandler(bookTablesContract.restore, async ({ params }) => ({ status: 200, body: { ok: true as const, data: await this.writes.restore(params.table, params.id) } }))
  }
}
