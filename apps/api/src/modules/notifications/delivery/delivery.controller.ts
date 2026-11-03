// Ajustes › Alertas, Telegram, push y recordatorio de cobro (F2-E-2). Mismos roles que apps/web/features/notify/actions.ts:
// todo con "viewer" salvo el cobro por WhatsApp ("editor"). Pruebas y resumen ahora: límite pruebaAviso; cobro: cobroWa.
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { notifyDeliveryContract as c } from "@mirai/contracts/modules/notifications-delivery"
import { MinRole } from "../../../core/context/decorators"
import { RateLimit } from "../../../core/rate-limit/rate-limit.guard"
import { DeliveryService } from "./delivery.service"

const ok = <T>(data: T) => ({ status: 200 as const, body: { ok: true as const, data } })

@Controller()
export class DeliveryController {
  constructor(private readonly svc: DeliveryService) {}

  @TsRestHandler(c.getMyRule)
  @MinRole("viewer")
  getMyRule() {
    return tsRestHandler(c.getMyRule, async () => ({ status: 200, body: (await this.svc.myRule()) as never }))
  }

  @TsRestHandler(c.putMyRule)
  @MinRole("viewer")
  putMyRule() {
    return tsRestHandler(c.putMyRule, async ({ body }) => ({ status: 200, body: (await this.svc.saveRule(body)) as never }))
  }

  @TsRestHandler(c.channels)
  @MinRole("viewer")
  channels() {
    return tsRestHandler(c.channels, async () => ({ status: 200, body: await this.svc.channels() }))
  }

  @TsRestHandler(c.test)
  @MinRole("viewer")
  @RateLimit("pruebaAviso", "user", "Enviaste muchas pruebas seguidas")
  test() {
    return tsRestHandler(c.test, async ({ body }) => ok(await this.svc.test(body.canal)))
  }

  @TsRestHandler(c.digestNow)
  @MinRole("viewer")
  @RateLimit("pruebaAviso", "user", "Enviaste muchas pruebas seguidas")
  digestNow() {
    return tsRestHandler(c.digestNow, async ({ body }) => ok(await this.svc.digestNow(body.canal)))
  }

  @TsRestHandler(c.open)
  @MinRole("viewer")
  open() {
    return tsRestHandler(c.open, async () => ({ status: 200, body: await this.svc.open() }))
  }

  @TsRestHandler(c.telegramLink)
  @MinRole("viewer")
  telegramLink() {
    return tsRestHandler(c.telegramLink, async () => ok(await this.svc.telegramLink()))
  }

  @TsRestHandler(c.telegramConfirm)
  @MinRole("viewer")
  telegramConfirm() {
    return tsRestHandler(c.telegramConfirm, async () => ok(await this.svc.telegramConfirm()))
  }

  @TsRestHandler(c.telegramUnlink)
  @MinRole("viewer")
  telegramUnlink() {
    return tsRestHandler(c.telegramUnlink, async () => ok(await this.svc.telegramUnlink()))
  }

  @TsRestHandler(c.cobroWaStatus)
  @MinRole("editor")
  cobroWaStatus() {
    return tsRestHandler(c.cobroWaStatus, async () => ({ status: 200, body: await this.svc.cobroStatus() }))
  }

  @TsRestHandler(c.cobroWaSend)
  @MinRole("editor")
  @RateLimit("cobroWa", "user", "Enviaste muchos recordatorios hoy")
  cobroWaSend() {
    return tsRestHandler(c.cobroWaSend, async ({ body }) => ok(await this.svc.cobroSend(body.loanId)))
  }

  @TsRestHandler(c.pushSubscribe)
  pushSubscribe() {
    return tsRestHandler(c.pushSubscribe, async ({ body }) => ok(await this.svc.pushSubscribe(body)))
  }

  @TsRestHandler(c.pushUnsubscribe)
  pushUnsubscribe() {
    return tsRestHandler(c.pushUnsubscribe, async ({ body }) => ok(await this.svc.pushUnsubscribe(body.endpoint)))
  }
}
