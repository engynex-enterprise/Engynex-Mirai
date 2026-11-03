import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { importContract as c } from "@mirai/contracts/modules/import"
import { Can, MinRole } from "../../core/context/decorators"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { ok } from "../book-tables/http"
import { ImportService } from "./import.service"
import { StatementService } from "./statement.service"

@Controller()
export class ImportController {
  constructor(
    private readonly statements: StatementService,
    private readonly svc: ImportService,
  ) {}

  @TsRestHandler(c.preview)
  @MinRole("editor")
  preview() {
    return tsRestHandler(c.preview, async ({ body }) => ({ status: 200, body: await this.statements.preview(body.csv) }))
  }

  @TsRestHandler(c.commit)
  @MinRole("editor")
  @Idempotent()
  commit() {
    return tsRestHandler(c.commit, async ({ body }) => ok(await this.statements.commit(body)))
  }

  @TsRestHandler(c.exportJson)
  @Can("ajustes")
  exportJson() {
    return tsRestHandler(c.exportJson, async () => ({ status: 200, body: await this.svc.exportJson() }))
  }

  @TsRestHandler(c.backup)
  @Can("ajustes")
  @Idempotent()
  backup() {
    return tsRestHandler(c.backup, async () => ok(await this.svc.backup()))
  }
}
