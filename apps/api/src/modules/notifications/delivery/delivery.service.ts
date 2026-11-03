// Casos de uso de Ajustes › Alertas (F2-E-2). BookGuard ya revisó el libro y el rol; el límite de pruebas lo aplica
// @RateLimit en el controller. Los envíos que fallan responden 502 con el mensaje legible del proveedor (ya quedó
// en notification_log), las condiciones que faltan 400/404/409 con el texto de la web.
import { Injectable } from "@nestjs/common"
import type { NotificationRuleUpsert } from "@mirai/contracts/modules/notifications-delivery"
import type { Who } from "@mirai/services/notify/actions"
import type { Canal } from "@mirai/services/notify/digest"
import { AppContextService } from "../../../core/context/app-context.service"
import { RequestContextService } from "../../../core/context/request-context.service"
import { service } from "../../integrations/service-errors"
import { DeliveryPort } from "./delivery.port"

@Injectable()
export class DeliveryService {
  constructor(
    private readonly port: DeliveryPort,
    private readonly ctx: RequestContextService,
    private readonly contexts: AppContextService,
  ) {}

  private get ids() {
    return { userId: this.ctx.user.id, householdId: this.ctx.book.household.id, bookId: this.ctx.book.book.id }
  }

  /** Persona y libro con el nombre y el correo de su perfil (como getAppContext en la web). */
  private async who(): Promise<Who> {
    const me = await this.contexts.me(this.ctx.user, this.ctx.book.book.id)
    return { ...this.ids, email: me.user.email, nombre: me.user.nombre }
  }

  myRule() {
    return service(() => this.port.ruleOf(this.ids.userId, this.ids.bookId))
  }
  saveRule(patch: NotificationRuleUpsert) {
    return service(() => this.port.saveRule(this.ctx.db, this.ids.userId, this.ids.bookId, patch))
  }
  channels() {
    return service(() => this.port.channels(this.ids.householdId))
  }
  async test(canal: Canal) {
    const w = await this.who()
    return { msg: await service(() => this.port.test(w, canal), "UPSTREAM") }
  }
  async digestNow(canal: Canal) {
    const w = await this.who()
    return { msg: await service(() => this.port.digestNow(w, canal), "UPSTREAM") }
  }
  open() {
    return service(() => this.port.open(this.ids.userId, this.ids.bookId))
  }
  async telegramLink() {
    return { url: await service(() => this.port.telegramLink(this.ids.householdId, this.ids.userId), "UPSTREAM") }
  }
  async telegramConfirm() {
    const w = await this.who()
    return { msg: await service(() => this.port.telegramConfirm(w.householdId, w.userId, w.nombre), "UPSTREAM") }
  }
  async telegramUnlink() {
    await service(() => this.port.telegramUnlink(this.ids.userId))
    return {}
  }
  cobroStatus() {
    return service(() => this.port.cobroStatus(this.ids))
  }
  async cobroSend(loanId: string) {
    const w = await this.who()
    return { msg: await service(() => this.port.cobroSend(w, loanId), "UPSTREAM") }
  }
  async pushSubscribe(s: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string }) {
    await service(() => this.port.pushSubscribe(this.ctx.db, this.ctx.user.id, { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, userAgent: s.userAgent }))
    return {}
  }
  async pushUnsubscribe(endpoint: string) {
    await service(() => this.port.pushUnsubscribe(this.ctx.db, endpoint))
    return {}
  }
}
