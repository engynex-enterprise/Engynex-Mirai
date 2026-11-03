// Adaptador de DeliveryPort sobre @mirai/services (SystemScope, como supabaseAdmin() en la web) y, para lo que la web
// escribe desde el navegador (regla de avisos y suscripciones push), el cliente con el JWT de la persona (misma RLS).
import { Injectable } from "@nestjs/common"
import type { NotificationRuleUpsert } from "@mirai/contracts/modules/notifications-delivery"
import * as actions from "@mirai/services/notify/actions"
import type { Canal, Rule } from "@mirai/services/notify/digest"
import type { DbScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { DomainError } from "../../../core/errors/domain-error"
import { DeliveryPort, type PushSub } from "./delivery.port"

@Injectable()
export class ServicesDelivery extends DeliveryPort {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  ruleOf(userId: string, bookId: string) {
    return actions.ruleOf(userId, bookId)
  }

  async saveRule(scope: DbScope, userId: string, bookId: string, patch: NotificationRuleUpsert): Promise<Rule> {
    const prev = await actions.ruleOf(userId, bookId)
    const row = { ...prev, ...patch, email_to: patch.email_to === "" ? null : (patch.email_to ?? prev.email_to), user_id: userId, book_id: bookId, last_sent: prev.last_sent ?? {}, updated_at: new Date().toISOString() }
    const { data, error } = await this.sb.for(scope).from("notification_rules").upsert(row as never, { onConflict: "user_id,book_id" }).select("*").single()
    if (error) throw DomainError.fromPg(error)
    return data as unknown as Rule
  }

  channels(householdId: string) {
    return actions.channelsFor(householdId)
  }
  test(w: actions.Who, canal: Canal) {
    return actions.testNowFor(w, canal)
  }
  digestNow(w: actions.Who, canal: Canal) {
    return actions.digestNowFor(w, canal)
  }
  open(userId: string, bookId: string) {
    return actions.openAppNotifsFor({ userId, bookId })
  }
  telegramLink(householdId: string, userId: string) {
    return actions.telegramLinkFor({ householdId, userId })
  }
  telegramConfirm(householdId: string, userId: string, nombre: string) {
    return actions.telegramConfirmFor({ householdId, userId, nombre })
  }
  telegramUnlink(userId: string) {
    return actions.telegramUnlinkFor(userId)
  }
  cobroStatus(o: { householdId: string; userId: string; bookId: string }) {
    return actions.cobroWaStatusFor(o)
  }
  cobroSend(w: actions.Who, loanId: string) {
    return actions.sendCobroWhatsAppFor(w, loanId)
  }

  async pushSubscribe(scope: DbScope, userId: string, s: PushSub) {
    const { error } = await this.sb.for(scope).from("push_subscriptions").upsert({ user_id: userId, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, user_agent: s.userAgent?.slice(0, 200) ?? null }, { onConflict: "endpoint" })
    if (error) throw DomainError.fromPg(error)
  }
  async pushUnsubscribe(scope: DbScope, endpoint: string) {
    const { error } = await this.sb.for(scope).from("push_subscriptions").delete().eq("endpoint", endpoint)
    if (error) throw DomainError.fromPg(error)
  }
}
