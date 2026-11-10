// Dobles de los puertos de F2-E (avisos, integraciones, Google, automatizaciones y trabajos). Sin base ni envíos.
import type { IntegrationPublic } from "@mirai/contracts/modules/integrations"
import type { NotificationRuleUpsert } from "@mirai/contracts/modules/notifications-delivery"
import type { CalSync } from "@mirai/services/google/calendar"
import type { CobroWaStatus, Popup, Who } from "@mirai/services/notify/actions"
import type { Heartbeat } from "@mirai/services/notify/cron"
import { defaultRule, type Canal, type Rule } from "@mirai/services/notify/digest"
import { ServiceError } from "@mirai/services/runtime"
import type { DbScope } from "../../src/core/db/scope"
import { AutomationsRunner } from "../../src/modules/automations/automations.port"
import { GooglePort } from "../../src/modules/google/google.port"
import { IntegrationsPort } from "../../src/modules/integrations/integrations.port"
import { NotifyJobs } from "../../src/modules/jobs/jobs.port"
import { DeliveryPort, type PushSub } from "../../src/modules/notifications/delivery/delivery.port"

export class FakeNotifyJobs extends NotifyJobs {
  ready = true
  households_ = ["00000000-0000-4000-8000-000000000100", "00000000-0000-4000-8000-000000000200"]
  calls: string[] = []
  async heartbeat(o: { now: Date; dry: boolean }): Promise<Heartbeat> {
    this.calls.push(`heartbeat:${o.dry}`)
    return { horario: true, cronHorario: true, visto: null }
  }
  async households() {
    return this.households_
  }
  async household(id: string, o: { now: Date; horario: boolean; dry: boolean }) {
    this.calls.push(`household:${id}`)
    return { [`aaaaaaaa:${id.slice(0, 8)}`]: [o.dry ? "email: simulado" : "email: ok"] }
  }
  async planEmails() {
    return 0
  }
  async familia() {
    return 0
  }
  async refs() {
    return ["trm: ok"]
  }
  async calendarUsers() {
    return []
  }
  async calendarUser() {
    return []
  }
  async netWorth() {
    return 0
  }
}

export class FakeAutomations extends AutomationsRunner {
  books: string[] = []
  async processBook(b: string) {
    this.books.push(b)
    return []
  }
  async hourly() {
    return { libros: 0 }
  }
  async pendingBooks() {
    return []
  }
}

export class FakeDelivery extends DeliveryPort {
  sent: { canal: Canal; w: Who }[] = []
  rules = new Map<string, Rule>()
  push: PushSub[] = []
  /** Lo que hace fallar el siguiente envío. */
  fail: Error | null = null
  async ruleOf(u: string, b: string) {
    return this.rules.get(`${u}:${b}`) ?? defaultRule(u, b)
  }
  async saveRule(_s: DbScope, u: string, b: string, p: NotificationRuleUpsert) {
    const r = { ...(await this.ruleOf(u, b)), ...p, email_to: p.email_to === "" ? null : (p.email_to ?? null) } as Rule
    this.rules.set(`${u}:${b}`, r)
    return r
  }
  async channels() {
    return { email: true, telegram: false, whatsapp: false, push: false }
  }
  async test(w: Who, canal: Canal) {
    if (this.fail) throw this.fail
    this.sent.push({ canal, w })
    return `Enviado a ${w.email}.`
  }
  async digestNow(w: Who, canal: Canal) {
    return this.test(w, canal)
  }
  async open(): Promise<Popup[]> {
    return [{ id: "p:f1", t: "Arriendo", b: "vence mañana", go: "fijos", lvl: "warn" }]
  }
  async telegramLink(): Promise<string> {
    throw new ServiceError("Mirai aún no tiene activo Telegram. Lo activa el administrador de Mirai.")
  }
  async telegramConfirm() {
    return "Telegram vinculado."
  }
  async telegramUnlink() {}
  async cobroStatus(): Promise<CobroWaStatus> {
    return { disponible: false, verificado: false, motivo: "Mirai todavía no tiene lista la plantilla de WhatsApp para recordar cobros." }
  }
  async cobroSend(): Promise<string> {
    throw new ServiceError("Hoy ya le enviaste este recordatorio desde Mirai.", "CONFLICT")
  }
  async pushSubscribe(_s: DbScope, _u: string, s: PushSub) {
    this.push.push(s)
  }
  async pushUnsubscribe(_s: DbScope, endpoint: string) {
    this.push = this.push.filter((p) => p.endpoint !== endpoint)
  }
}

export class FakeIntegrations extends IntegrationsPort {
  saved: { kind: string; householdId: string; values: Record<string, unknown> }[] = []
  async listPublic(_s: DbScope, householdId: string): Promise<IntegrationPublic[]> {
    return [
      { kind: "ai_gemini", enabled: true, config: { model: "gemini-flash-latest" }, meta: { apiKey: "••••1234" }, updated_at: `${householdId.slice(0, 0)}2026-11-02T10:00:00Z` },
      { kind: "email_resend", enabled: true, config: {}, meta: {}, updated_at: null },
    ]
  }
  async save(o: { householdId: string; kind: string; values: Record<string, unknown> }) {
    if (o.kind === "telegram") throw new ServiceError("Esta integración la administra Mirai. Los avisos se eligen en Ajustes › Alertas.", "ROLE_DENIED")
    this.saved.push(o)
  }
  async toggle(o: { kind: string; enabled: boolean }) {
    if (!o.enabled) throw new ServiceError("Mirai administra esta integración para todos: no se puede apagar.", "CONFLICT")
  }
  async remove() {}
}

export class FakeGoogle extends GooglePort {
  connected: { userId: string; code: string; redirectUri: string }[] = []
  configured() {
    return true
  }
  clientId() {
    return "cliente.apps.googleusercontent.com"
  }
  async available() {
    return true
  }
  async connect(userId: string, code: string, redirectUri: string) {
    if (code === "malo") throw new Error("invalid_grant")
    this.connected.push({ userId, code, redirectUri })
  }
  conn: { email: string | null; scopes: string[] } | null = { email: "ana@gmail.com", scopes: ["https://www.googleapis.com/auth/gmail.readonly"] }
  async connection() {
    return this.conn
  }
  async disconnect() {}
  async syncCalendar(): Promise<CalSync> {
    return { creados: 2, actualizados: 0, borrados: 0, total: 2 }
  }
  async calendarStatus() {
    return { conectado: true, eventos: 2 }
  }
}
