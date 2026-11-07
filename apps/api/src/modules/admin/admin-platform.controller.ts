// /v1/admin/{plans,coupons,integrations,whatsapp}/** (V7-G): solo administradores de la plataforma (@PlatformAdmin en
// la clase). Valida con el contrato y llama UN método del servicio.
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { adminPlatformContract as c } from "@mirai/contracts/modules/admin-platform"
import { PlatformAdmin } from "../../core/context/decorators"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { AdminPlatformService } from "./admin-platform.service"

const ok = <T>(data: T) => ({ status: 200 as const, body: { ok: true as const, data } })
const json = <T>(body: T) => ({ status: 200 as const, body })

@Controller()
@PlatformAdmin()
export class AdminPlatformController {
  constructor(private readonly svc: AdminPlatformService) {}

  @TsRestHandler(c.plans)
  plans() {
    return tsRestHandler(c.plans, async () => json(await this.svc.plans()))
  }

  @TsRestHandler(c.savePlan)
  savePlan() {
    return tsRestHandler(c.savePlan, async ({ params, body }) => ok(await this.svc.savePlan(params.planId, body)))
  }

  @TsRestHandler(c.deletePlan)
  deletePlan() {
    return tsRestHandler(c.deletePlan, async ({ params }) => ok(await this.svc.deletePlan(params.planId)))
  }

  @TsRestHandler(c.coupons)
  coupons() {
    return tsRestHandler(c.coupons, async () => json(await this.svc.coupons()))
  }

  @TsRestHandler(c.saveCoupon)
  saveCoupon() {
    return tsRestHandler(c.saveCoupon, async ({ params, body }) => ok(await this.svc.saveCoupon(params.codigo, body)))
  }

  @TsRestHandler(c.deleteCoupon)
  deleteCoupon() {
    return tsRestHandler(c.deleteCoupon, async ({ params }) => ok(await this.svc.deleteCoupon(params.codigo)))
  }

  @TsRestHandler(c.integrations)
  integrations() {
    return tsRestHandler(c.integrations, async () => json(await this.svc.integrations()))
  }

  @TsRestHandler(c.integration)
  integration() {
    return tsRestHandler(c.integration, async ({ params }) => json(await this.svc.integration(params.kind)))
  }

  @TsRestHandler(c.saveIntegration)
  saveIntegration() {
    return tsRestHandler(c.saveIntegration, async ({ params, body }) => ok(await this.svc.saveIntegration(params.kind, body)))
  }

  @TsRestHandler(c.testIntegration)
  testIntegration() {
    return tsRestHandler(c.testIntegration, async ({ params }) => ok(await this.svc.testIntegration(params.kind)))
  }

  @TsRestHandler(c.sendTest)
  @Idempotent()
  sendTest() {
    return tsRestHandler(c.sendTest, async ({ params, body }) => ok(await this.svc.sendTest(params.kind, body.to)))
  }

  @TsRestHandler(c.waState)
  waState() {
    return tsRestHandler(c.waState, async ({ query }) => json(await this.svc.waState(query.fresh === "1")))
  }

  @TsRestHandler(c.waSaveSettings)
  waSaveSettings() {
    return tsRestHandler(c.waSaveSettings, async ({ body }) => ok(await this.svc.waSaveSettings(body as Parameters<AdminPlatformService["waSaveSettings"]>[0])))
  }

  @TsRestHandler(c.waPreview)
  waPreview() {
    return tsRestHandler(c.waPreview, async ({ body }) => ok(await this.svc.waPreview(body.caso, body.override)))
  }

  @TsRestHandler(c.waSendTest)
  @Idempotent()
  waSendTest() {
    return tsRestHandler(c.waSendTest, async ({ body }) => ok(await this.svc.waSendTest(body)))
  }

  // V7-H3
  @TsRestHandler(c.broadcasts)
  broadcasts() {
    return tsRestHandler(c.broadcasts, async () => json(await this.svc.broadcasts()))
  }

  @TsRestHandler(c.waSaveTemplate)
  @Idempotent()
  waSaveTemplate() {
    return tsRestHandler(c.waSaveTemplate, async ({ body }) => ok(await this.svc.waSaveTemplate(body.draft, body.edit)))
  }

  @TsRestHandler(c.waDeleteTemplate)
  @Idempotent()
  waDeleteTemplate() {
    return tsRestHandler(c.waDeleteTemplate, async ({ params, query }) => ok(await this.svc.waDeleteTemplate(params.name, query.id)))
  }
}
