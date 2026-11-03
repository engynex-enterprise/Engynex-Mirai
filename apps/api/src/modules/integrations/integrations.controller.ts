// /v1/books/:bookId/integrations/**: integraciones del hogar del libro. Ver: viewer (sin secretos); cambiar: admin
// (igual que requireRole("admin") de apps/web/features/integrations/actions.ts).
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { integrationsContract } from "@mirai/contracts/modules/integrations"
import { MinRole } from "../../core/context/decorators"
import { IntegrationsService } from "./integrations.service"

@Controller()
export class IntegrationsController {
  constructor(private readonly svc: IntegrationsService) {}

  @TsRestHandler(integrationsContract.list)
  @MinRole("viewer")
  list() {
    return tsRestHandler(integrationsContract.list, async () => ({ status: 200, body: await this.svc.list() }))
  }

  @TsRestHandler(integrationsContract.save)
  @MinRole("admin")
  save() {
    return tsRestHandler(integrationsContract.save, async ({ params, body }) => ({ status: 200, body: { ok: true as const, data: await this.svc.save(params.kind, body.values, body.enabled) } }))
  }

  @TsRestHandler(integrationsContract.toggle)
  @MinRole("admin")
  toggle() {
    return tsRestHandler(integrationsContract.toggle, async ({ params, body }) => ({ status: 200, body: { ok: true as const, data: await this.svc.toggle(params.kind, body.enabled) } }))
  }

  @TsRestHandler(integrationsContract.remove)
  @MinRole("admin")
  remove() {
    return tsRestHandler(integrationsContract.remove, async ({ params }) => ({ status: 200, body: { ok: true as const, data: await this.svc.remove(params.kind) } }))
  }
}
