// /v1/admin/ai/**: consola › Uso de IA (solo administradores de la plataforma; @PlatformAdmin en la clase). Equivale a
// features/admin/ia-server.ts. Cada cambio queda en admin_audit; nunca devuelve montos ni movimientos de los hogares.
import { Controller, Injectable } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { aiAdminContract as c } from "@mirai/contracts/modules/ai"
import { PlatformAdmin } from "../../core/context/decorators"
import { RequestContextService } from "../../core/context/request-context.service"
import { DomainError } from "../../core/errors/domain-error"
import { AiAdminPort, type AiSettingsPatch, type ModelPrice } from "./ai.port"

const ok = <T>(data: T) => ({ status: 200 as const, body: { ok: true as const, data } })

/** Errores de la base → DomainError (la entrada ya la validó el contrato). */
async function db<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f()
  } catch (e) {
    throw DomainError.fromPg(e)
  }
}

@Injectable()
export class AiAdminService {
  constructor(
    private readonly port: AiAdminPort,
    private readonly ctx: RequestContextService,
  ) {}

  private get actor() {
    return this.ctx.user.id
  }
  usage(dias = 30) {
    return db(() => this.port.usage(dias))
  }
  saveSettings(p: AiSettingsPatch) {
    return db(() => this.port.saveSettings(this.actor, p))
  }
  setPlanCupo(planId: string, cupo: number | null) {
    return db(() => this.port.setPlanCupo(this.actor, planId, cupo))
  }
  setModelPrice(model: string, price: ModelPrice | null) {
    return db(() => this.port.setModelPrice(this.actor, model, price))
  }
  clearCache() {
    return db(() => this.port.clearCache(this.actor))
  }
}

@Controller()
@PlatformAdmin()
export class AiAdminController {
  constructor(private readonly svc: AiAdminService) {}

  @TsRestHandler(c)
  handler() {
    return tsRestHandler(c, {
      usage: async ({ query }) => ({ status: 200 as const, body: (await this.svc.usage(query.dias)) as Record<string, unknown> }),
      saveSettings: async ({ body }) => (await this.svc.saveSettings(body), ok({})),
      setPlanCupo: async ({ params, body }) => (await this.svc.setPlanCupo(params.planId, body.cupo), ok({})),
      setModelPrice: async ({ body }) => (await this.svc.setModelPrice(body.model, body.price), ok({})),
      clearCache: async () => ok({ borradas: await this.svc.clearCache() }),
    })
  }
}
