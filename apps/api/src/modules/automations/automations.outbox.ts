// Outbox de automatizaciones (§2.7.8, F2-E-4). Los triggers de la base siguen encolando en automation_events (patrón
// outbox transaccional); después de cada escritura de la API que puede disparar uno, EventsService avisa y aquí se
// encola POST /v1/jobs/automations/book/:b en la cola `automations`, con 1 s de espera y nombre único por libro y
// segundo (auto-<libro>-<segundo>): varias escrituras seguidas = una sola tarea. Reemplaza el runner del navegador
// (features/automations/runner.tsx); el *drain* cada 5 minutos recoge lo que se escriba fuera de la API.
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import type { Logger } from "pino"
import type { LiveChange } from "@mirai/contracts/live"
import { EventsService } from "../../core/events/events.service"
import { LOGGER } from "../../core/logging/logger"
import { QueuePort } from "../../core/queue/queue.port"
import { ServicesEnv } from "../integrations/services-env"

/** Tablas con trigger `automation_enqueue` (supabase/migrations: automatizaciones y planes_automat). */
export const AUTOMATION_SOURCE_TABLES: readonly string[] = ["expenses", "extra_incomes", "fixed_expense_payments", "card_purchases", "loan_payments", "subscriptions", "calendar_events"]

/** ¿Este cambio pudo encolar un evento? (los triggers son `after insert`; suscripciones también al cambiar `proximo`). */
export const triggersAutomations = (c: LiveChange) =>
  !!c.bookId && AUTOMATION_SOURCE_TABLES.includes(c.table) && (c.op === "INSERT" || (c.table === "subscriptions" && c.op === "UPDATE"))

export const outboxTaskName = (bookId: string, now = Date.now()) => `auto-${bookId}-${Math.floor(now / 1000)}`

@Injectable()
export class AutomationsOutbox implements OnModuleInit, OnModuleDestroy {
  private off?: () => void

  constructor(
    private readonly events: EventsService,
    private readonly queue: QueuePort,
    private readonly env: ServicesEnv,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  onModuleInit() {
    if (!this.env.values.automationsOutbox) return
    this.off = this.events.subscribe((c) => this.onChange(c))
  }
  onModuleDestroy() {
    this.off?.()
  }

  async onChange(c: LiveChange, now = Date.now()) {
    if (!triggersAutomations(c)) return
    try {
      await this.queue.enqueue({ queue: "automations", path: `/v1/jobs/automations/book/${c.bookId}`, name: outboxTaskName(c.bookId!, now), delayS: 1, body: {} })
    } catch (e) {
      // Sin la tarea, el drain de 5 minutos lo recoge: nunca se pierde un evento (sigue en automation_events).
      this.log.warn({ error: e, bookId: c.bookId }, "outbox de automatizaciones: no se pudo encolar")
    }
  }
}
