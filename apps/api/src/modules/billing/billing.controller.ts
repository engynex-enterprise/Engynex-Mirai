// Controllers de billing (§2.1): validan con el contrato y llaman UN método del servicio.
// - Comandos del plan: con sesión; el servicio revisa que sea el dueño (HouseholdAccess).
// - Webhooks: sin sesión (@Public) y sin el límite general (los protege Cloud Armor); la firma se verifica sobre el
//   cuerpo crudo (req.rawBody, `rawBody: true` en main.ts).
import { Controller, Req } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { billingContract } from "@mirai/contracts/modules/billing"
import { Public } from "../../core/auth/decorators"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { SkipDefaultLimit } from "../../core/rate-limit/rate-limit.guard"
import { BillingService } from "./billing.service"
import { PlansReadService } from "./plans-read.service"

type RawReq = { rawBody?: Buffer; headers: Record<string, string | string[] | undefined> }

@Controller()
export class BillingController {
  constructor(
    private readonly svc: BillingService,
    private readonly reads: PlansReadService,
  ) {}

  @TsRestHandler(billingContract.subscription)
  subscription() {
    return tsRestHandler(billingContract.subscription, async ({ params }) => ({ status: 200, body: await this.reads.subscription(params.householdId) }))
  }

  @TsRestHandler(billingContract.paymentOptions)
  paymentOptions() {
    return tsRestHandler(billingContract.paymentOptions, async () => ({ status: 200, body: this.svc.paymentOptions() }))
  }

  @TsRestHandler(billingContract.previewCoupon)
  previewCoupon() {
    return tsRestHandler(billingContract.previewCoupon, async ({ params, body }) => ({ status: 200, body: { ok: true as const, data: await this.svc.previewCoupon(params.householdId, body) } }))
  }

  @TsRestHandler(billingContract.checkout)
  @Idempotent()
  checkout() {
    return tsRestHandler(billingContract.checkout, async ({ params, body }) => ({ status: 200, body: { ok: true as const, data: await this.svc.checkout(params.householdId, body) } }))
  }

  @TsRestHandler(billingContract.renewal)
  renewal() {
    return tsRestHandler(billingContract.renewal, async ({ params }) => ({ status: 200, body: await this.svc.paysRenewal(params.householdId) }))
  }

  @TsRestHandler(billingContract.cancelRenewal)
  cancelRenewal() {
    return tsRestHandler(billingContract.cancelRenewal, async ({ params }) => ({ status: 200, body: { ok: true as const, data: await this.svc.cancelRenewal(params.householdId) } }))
  }
}

/** GET /v1/plans: sin sesión (portada y /planes). Con el límite general por IP. */
@Controller()
@Public()
export class PlansController {
  constructor(private readonly reads: PlansReadService) {}

  @TsRestHandler(billingContract.plans)
  plans() {
    return tsRestHandler(billingContract.plans, async () => ({ status: 200, body: await this.reads.publicPlans() }))
  }
}

@Controller()
@Public()
@SkipDefaultLimit()
export class WebhooksController {
  constructor(private readonly svc: BillingService) {}

  @TsRestHandler(billingContract.mercadopagoWebhook)
  mercadopago(@Req() req: RawReq) {
    return tsRestHandler(billingContract.mercadopagoWebhook, async ({ query, body }) => ({
      status: 200,
      body: await this.svc.mercadopagoWebhook({ query: query as Record<string, string | undefined>, raw: req.rawBody, body, headers: req.headers }),
    }))
  }

  @TsRestHandler(billingContract.wompiWebhook)
  wompi(@Req() req: RawReq) {
    return tsRestHandler(billingContract.wompiWebhook, async ({ body }) => ({ status: 200, body: await this.svc.wompiWebhook({ raw: req.rawBody, body }) }))
  }
}
