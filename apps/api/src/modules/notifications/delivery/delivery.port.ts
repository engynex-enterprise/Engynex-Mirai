// Puerto de envíos y ajustes de avisos (§2.1). El adaptador usa @mirai/services/notify (el mismo código de la web:
// resúmenes, correo, Telegram, push, WhatsApp con plantillas propias aprobadas, registro y no-duplicados).
import type { NotificationRuleUpsert } from "@mirai/contracts/modules/notifications-delivery"
import type { CobroWaStatus, Popup, Who } from "@mirai/services/notify/actions"
import type { Canal, Rule } from "@mirai/services/notify/digest"
import type { DbScope } from "../../../core/db/scope"

export type PushSub = { endpoint: string; p256dh: string; auth: string; userAgent?: string }

export abstract class DeliveryPort {
  abstract ruleOf(userId: string, bookId: string): Promise<Rule>
  /** Guarda la regla con el alcance de la persona (RLS: solo la suya). `last_sent` no se toca. */
  abstract saveRule(scope: DbScope, userId: string, bookId: string, patch: NotificationRuleUpsert): Promise<Rule>
  abstract channels(householdId: string): Promise<Record<Canal, boolean>>
  abstract test(w: Who, canal: Canal): Promise<string>
  abstract digestNow(w: Who, canal: Canal): Promise<string>
  abstract open(userId: string, bookId: string): Promise<Popup[]>
  abstract telegramLink(householdId: string, userId: string): Promise<string>
  abstract telegramConfirm(householdId: string, userId: string, nombre: string): Promise<string>
  abstract telegramUnlink(userId: string): Promise<void>
  abstract cobroStatus(o: { householdId: string; userId: string; bookId: string }): Promise<CobroWaStatus>
  abstract cobroSend(w: Who, loanId: string): Promise<string>
  abstract pushSubscribe(scope: DbScope, userId: string, s: PushSub): Promise<void>
  abstract pushUnsubscribe(scope: DbScope, endpoint: string): Promise<void>
}
