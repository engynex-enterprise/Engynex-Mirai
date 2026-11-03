// Casos de uso de las integraciones del hogar (Ajustes › Inteligencia artificial). El rol (admin) y el libro ya los
// revisó BookGuard; el hogar sale del libro de la ruta.
import { Injectable } from "@nestjs/common"
import type { IntegrationPublic } from "@mirai/contracts/modules/integrations"
import { CLIENT_INTEGRATIONS } from "@mirai/services/integrations/registry"
import { RequestContextService } from "../../core/context/request-context.service"
import { IntegrationsPort } from "./integrations.port"
import { service } from "./service-errors"

const CLIENT_KINDS = CLIENT_INTEGRATIONS.map((i) => i.kind)

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly port: IntegrationsPort,
    private readonly ctx: RequestContextService,
  ) {}

  private get who() {
    const b = this.ctx.book
    return { householdId: b.household.id, userId: this.ctx.user.id, planId: b.plan.id }
  }

  async list(): Promise<{ kinds: string[]; items: IntegrationPublic[] }> {
    const rows = await this.port.listPublic(this.ctx.db, this.who.householdId)
    return { kinds: CLIENT_KINDS, items: rows.filter((r) => CLIENT_KINDS.includes(r.kind)) }
  }

  async save(kind: string, values: Record<string, string | number | boolean>, enabled?: boolean) {
    const { householdId, userId } = this.who
    await service(() => this.port.save({ householdId, userId, kind, values, enabled }))
    return { kind }
  }

  async toggle(kind: string, enabled: boolean) {
    await service(() => this.port.toggle({ ...this.who, kind, enabled }))
    return { kind, enabled }
  }

  async remove(kind: string) {
    await service(() => this.port.remove({ householdId: this.who.householdId, kind }))
    return { kind }
  }
}
