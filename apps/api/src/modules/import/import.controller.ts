import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { importContract as c } from "@mirai/contracts/modules/import"
import { Can, MinRole } from "../../core/context/decorators"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { ok } from "../book-tables/http"
import { DataService } from "./data.service"
import { ImportService } from "./import.service"
import { StatementService } from "./statement.service"

@Controller()
export class ImportController {
  constructor(
    private readonly statements: StatementService,
    private readonly svc: ImportService,
    private readonly data: DataService,
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

  // ── V7-G: respaldos guardados, restaurar, formatear e importar ──

  @TsRestHandler(c.backups)
  @Can("ajustes")
  backups() {
    return tsRestHandler(c.backups, async () => ({ status: 200, body: await this.data.list() }))
  }

  @TsRestHandler(c.backupUrl)
  @Can("ajustes")
  backupUrl() {
    return tsRestHandler(c.backupUrl, async ({ params }) => ({ status: 200, body: await this.data.url(params.backupId) }))
  }

  @TsRestHandler(c.restoreBackup)
  @MinRole("admin")
  @Idempotent()
  restoreBackup() {
    return tsRestHandler(c.restoreBackup, async ({ params }) => ok(await this.data.restoreBackup(params.backupId)))
  }

  @TsRestHandler(c.deleteBackup)
  @MinRole("admin")
  deleteBackup() {
    return tsRestHandler(c.deleteBackup, async ({ params }) => ok(await this.data.deleteBackup(params.backupId)))
  }

  @TsRestHandler(c.restoreJson)
  @MinRole("admin")
  @Idempotent()
  restoreJson() {
    return tsRestHandler(c.restoreJson, async ({ body }) => ok(await this.data.restoreJson(body.json)))
  }

  @TsRestHandler(c.importV4)
  @MinRole("editor")
  @Idempotent()
  importV4() {
    return tsRestHandler(c.importV4, async ({ body }) => ok(await this.data.importV4(body.json)))
  }

  @TsRestHandler(c.sample)
  @MinRole("editor")
  @Idempotent()
  sample() {
    return tsRestHandler(c.sample, async () => ok(await this.data.sample()))
  }

  @TsRestHandler(c.format)
  @MinRole("admin")
  @Idempotent()
  format() {
    return tsRestHandler(c.format, async ({ body }) => ok(await this.data.format(body.blocks, body.confirm)))
  }
}
