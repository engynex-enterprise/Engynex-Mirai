// /v1/books/:bookId/ai/**, reports/:mes/summary, mail/scan e integrations/:kind/{test,models} (§2.6, F2-F). Los roles
// son los de la web (requireRole / requireCan de features/ai, reports, correo e integrations). El plan lo bloquea la IA.
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { aiContract as c } from "@mirai/contracts/modules/ai"
import { Can, MinRole } from "../../core/context/decorators"
import { AiService } from "./ai.service"

const ok = <T>(data: T) => ({ status: 200 as const, body: { ok: true as const, data } })

@Controller()
export class AiController {
  constructor(private readonly svc: AiService) {}

  @TsRestHandler(c.invoice)
  @Can("registrarPropio")
  invoice() {
    return tsRestHandler(c.invoice, async ({ body }) => ok(await this.svc.invoice(body.file)))
  }

  @TsRestHandler(c.receipt)
  @MinRole("editor")
  receipt() {
    return tsRestHandler(c.receipt, async ({ body }) => ok(await this.svc.receipt(body.file)))
  }

  @TsRestHandler(c.loanDoc)
  @MinRole("editor")
  loanDoc() {
    return tsRestHandler(c.loanDoc, async ({ body }) => ok(await this.svc.loanDoc(body.file, body.kind)))
  }

  @TsRestHandler(c.classify)
  @Can("registrarPropio")
  classify() {
    return tsRestHandler(c.classify, async ({ body }) => ok(await this.svc.classify(body.items)))
  }

  @TsRestHandler(c.hormiga)
  @MinRole("editor")
  hormiga() {
    return tsRestHandler(c.hormiga, async ({ body }) => ok(await this.svc.hormiga(body.mes)))
  }

  @TsRestHandler(c.category)
  @MinRole("editor")
  category() {
    return tsRestHandler(c.category, async ({ body }) => ok(await this.svc.category(body)))
  }

  @TsRestHandler(c.entity)
  @MinRole("editor")
  entity() {
    return tsRestHandler(c.entity, async ({ body }) => ok(await this.svc.entity(body.q)))
  }

  @TsRestHandler(c.cobro)
  @Can("registrarPropio")
  cobro() {
    return tsRestHandler(c.cobro, async ({ body }) => ok(await this.svc.cobro(body.msg, body.tono)))
  }

  @TsRestHandler(c.prima)
  @Can("registrarPropio")
  prima() {
    return tsRestHandler(c.prima, async ({ body }) => ok(await this.svc.prima(body)))
  }

  @TsRestHandler(c.parse)
  @Can("registrarPropio")
  parse() {
    return tsRestHandler(c.parse, async ({ body }) => ok(await this.svc.parse(body.text)))
  }

  /** Como en el chat: cualquier rol pregunta (el consejero no escribe en el libro, solo su historial). */
  @TsRestHandler(c.advisor)
  @MinRole("viewer")
  advisor() {
    return tsRestHandler(c.advisor, async ({ body }) => ok(await this.svc.advisor(body.text)))
  }

  @TsRestHandler(c.usage)
  @MinRole("viewer")
  usage() {
    return tsRestHandler(c.usage, async () => ({ status: 200 as const, body: (await this.svc.usage()) as Record<string, unknown> }))
  }

  @TsRestHandler(c.monthSummary)
  @MinRole("editor")
  monthSummary() {
    return tsRestHandler(c.monthSummary, async ({ params }) => ok(await this.svc.monthSummary(params.mes)))
  }

  @TsRestHandler(c.mailScan)
  @MinRole("editor")
  mailScan() {
    return tsRestHandler(c.mailScan, async ({ body }) => ok(await this.svc.mailScan(body.query)))
  }

  @TsRestHandler(c.integrationTest)
  @MinRole("editor")
  integrationTest() {
    return tsRestHandler(c.integrationTest, async ({ params }) => ok(await this.svc.integrationTest(params.kind)))
  }

  @TsRestHandler(c.integrationModels)
  @MinRole("admin")
  integrationModels() {
    return tsRestHandler(c.integrationModels, async ({ params, body }) => ok(await this.svc.integrationModels(params.kind, body.apiKey)))
  }
}
