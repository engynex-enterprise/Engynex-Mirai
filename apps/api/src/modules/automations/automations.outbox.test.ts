import { describe, expect, it } from "vitest"
import pino from "pino"
import { EventsService } from "../../core/events/events.service"
import { InlineQueue } from "../../core/queue/inline.queue"
import { QueuePort } from "../../core/queue/queue.port"
import type { ServicesEnv } from "../integrations/services-env"
import { AutomationsOutbox, outboxTaskName, triggersAutomations } from "./automations.outbox"

const B = "00000000-0000-4000-8000-000000000101"
const log = pino({ level: "silent" })
const env = (automationsOutbox = true) => ({ values: { automationsOutbox } }) as unknown as ServicesEnv
const setup = (on = true, queue: QueuePort = new InlineQueue()) => {
  const events = new EventsService(log)
  const outbox = new AutomationsOutbox(events, queue, env(on), log)
  outbox.onModuleInit()
  return { events, outbox, queue }
}
const tick = () => new Promise((r) => setImmediate(r))

describe("outbox de automatizaciones (EventsService → cola automations)", () => {
  it("solo las tablas con trigger automation_enqueue y solo al insertar (suscripciones también al actualizar)", () => {
    expect(triggersAutomations({ table: "expenses", bookId: B, op: "INSERT" })).toBe(true)
    expect(triggersAutomations({ table: "expenses", bookId: B, op: "UPDATE" })).toBe(false)
    expect(triggersAutomations({ table: "subscriptions", bookId: B, op: "UPDATE" })).toBe(true)
    expect(triggersAutomations({ table: "categories", bookId: B, op: "INSERT" })).toBe(false)
    expect(triggersAutomations({ table: "expenses", op: "INSERT" })).toBe(false)
  })

  it("encola automations/book/:b con 1 s de espera y un nombre por libro y segundo (varias escrituras = una tarea)", async () => {
    const { events, queue } = setup()
    events.changed(B, ["expenses", "fixed_expense_payments"], "x", "INSERT")
    events.changed(B, ["categories"], "y", "INSERT")
    await tick()
    const tasks = (queue as InlineQueue).tasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ queue: "automations", path: `/v1/jobs/automations/book/${B}`, delayS: 1 })
    expect(tasks[0].name).toMatch(new RegExp(`^auto-${B}-\\d{10}$`))
    expect(outboxTaskName(B, 1_762_099_200_999)).toBe(`auto-${B}-1762099200`)
  })

  it("apagado con AUTOMATIONS_OUTBOX=0 no se suscribe", async () => {
    const { events, queue } = setup(false)
    events.changed(B, ["expenses"], "x", "INSERT")
    await tick()
    expect((queue as InlineQueue).tasks).toHaveLength(0)
  })

  it("si la cola falla no rompe la escritura (el drain lo recoge)", async () => {
    class Caida extends QueuePort {
      async enqueue(): Promise<never> {
        throw new Error("Cloud Tasks respondió 503")
      }
    }
    const { outbox } = setup(true, new Caida())
    await expect(outbox.onChange({ table: "expenses", bookId: B, op: "INSERT" })).resolves.toBeUndefined()
  })
})
