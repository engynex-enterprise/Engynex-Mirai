// Controller de libros (V7-G): valida con el contrato y llama UN método del servicio. Las rutas con :bookId pasan por
// BookGuard (miembro + rol); crear y restaurar revisan el hogar con HouseholdAccess en el servicio.
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { booksContract as c } from "@mirai/contracts/modules/books"
import { MinRole } from "../../core/context/decorators"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { ok } from "../book-tables/http"
import { BooksService } from "./books.service"

@Controller()
export class BooksController {
  constructor(private readonly svc: BooksService) {}

  @TsRestHandler(c.create)
  @Idempotent()
  create() {
    return tsRestHandler(c.create, async ({ body }) => ok(await this.svc.create(body)))
  }

  @TsRestHandler(c.update)
  @MinRole("editor")
  update() {
    return tsRestHandler(c.update, async ({ body }) => ok(await this.svc.update(body)))
  }

  @TsRestHandler(c.remove)
  @MinRole("owner")
  remove() {
    return tsRestHandler(c.remove, async ({ body }) => ok(await this.svc.remove(body.confirm)))
  }

  @TsRestHandler(c.restore)
  restore() {
    return tsRestHandler(c.restore, async ({ params }) => ok(await this.svc.restore(params.id)))
  }

  @TsRestHandler(c.settings)
  @MinRole("viewer")
  settings() {
    return tsRestHandler(c.settings, async () => ({ status: 200, body: await this.svc.settings() }))
  }

  // V7-H2: lecturas (cualquier integrante; la RLS de cada tabla vuelve a revisar).
  @TsRestHandler(c.audit)
  @MinRole("viewer")
  audit() {
    return tsRestHandler(c.audit, async ({ query }) => ({ status: 200, body: await this.svc.audit(query.limit) }))
  }

  @TsRestHandler(c.setupCounts)
  @MinRole("viewer")
  setupCounts() {
    return tsRestHandler(c.setupCounts, async () => ({ status: 200, body: await this.svc.setupCounts() }))
  }

  @TsRestHandler(c.monthSummary)
  @MinRole("viewer")
  monthSummary() {
    return tsRestHandler(c.monthSummary, async ({ params }) => ({ status: 200, body: await this.svc.monthSummary(params.mes) }))
  }

  @TsRestHandler(c.updateSettings)
  @MinRole("editor")
  updateSettings() {
    return tsRestHandler(c.updateSettings, async ({ body }) => ({ status: 200, body: await this.svc.updateSettings(body) }))
  }
}
