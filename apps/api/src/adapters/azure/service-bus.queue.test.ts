// Service Bus con un cliente simulado (la interfaz mínima que el adaptador usa): envío con messageId/retraso/traza,
// deduplicación, consumo con completar, reintento reprogramado con espera creciente, cola de fallidos y apagado.
import { ClsServiceManager } from "nestjs-cls"
import { describe, expect, it } from "vitest"
import { CTX } from "../../core/context/request-context"
import type { TaskEnvelope } from "../../core/queue/envelope"
import { ServiceBusQueue, type SbClient, type SbOutMessage, type SbReceivedMessage, type SbReceiver } from "./service-bus.queue"

const TP = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
const OPTS = { concurrency: 2, timeoutS: 30, retryBaseS: 10, retryMaxS: 900, maxAttempts: 3 }

/** Doble de ServiceBusClient: guarda lo enviado y deja entregar mensajes al suscriptor a mano. */
function fakeClient() {
  const sent: { queue: string; m: SbOutMessage }[] = []
  const settled: { op: string; m: SbReceivedMessage; reason?: string }[] = []
  let handler: Parameters<SbReceiver["subscribe"]>[0] | undefined
  let subOpts: Parameters<SbReceiver["subscribe"]>[1] | undefined
  const state = { closed: false, subClosed: false, receiverQueue: "", failSend: false }
  const client: SbClient = {
    createSender: (queue) => ({
      sendMessages: async (m) => {
        if (state.failSend) throw Object.assign(new Error("caído"), { name: "ServiceBusError" })
        sent.push({ queue, m })
      },
      close: async () => undefined,
    }),
    createReceiver: (queue) => {
      state.receiverQueue = queue
      return {
        subscribe: (h, o) => {
          handler = h
          subOpts = o
          return { close: async () => void (state.subClosed = true) }
        },
        completeMessage: async (m) => void settled.push({ op: "complete", m }),
        abandonMessage: async (m) => void settled.push({ op: "abandon", m }),
        deadLetterMessage: async (m, o) => void settled.push({ op: "deadLetter", m, reason: o.deadLetterReason }),
        close: async () => undefined,
      }
    },
    close: async () => void (state.closed = true),
  }
  return { client, sent, settled, state, deliver: (m: SbReceivedMessage) => handler!.processMessage(m), opts: () => subOpts }
}

const msg = (env: Partial<TaskEnvelope>, extra: Partial<SbReceivedMessage> = {}): SbReceivedMessage => ({ body: { v: 1, queue: "notify", name: "n1", path: "/v1/jobs/x", ...env }, messageId: env.name ?? "n1", deliveryCount: 1, ...extra })

describe("ServiceBusQueue (simulado)", () => {
  it("encola con messageId = nombre, retraso programado, traza en applicationProperties y deduplica", async () => {
    const f = fakeClient()
    const q = new ServiceBusQueue({ client: f.client, queues: { slow: "mirai-lenta" } })
    const cls = ClsServiceManager.getClsService()
    const r = await cls.run(() => {
      cls.set(CTX, { requestId: "r", startedAt: 0, trace: { traceId: "0af7651916cd43dd8448eb211c80319c", spanId: "b7ad6b7169203331", sampled: true } })
      return q.enqueue({ queue: "notify", path: "/v1/jobs/notify/household/h1", name: "notify-h1-2026110210", body: { a: 1 }, delayS: 30 })
    })
    expect(r).toEqual({ name: "notify-h1-2026110210", deduped: false })
    expect(await q.enqueue({ queue: "notify", path: "/x", name: "notify-h1-2026110210" })).toEqual({ name: "notify-h1-2026110210", deduped: true })
    expect(f.sent).toHaveLength(1)
    const { queue, m } = f.sent[0]
    expect(queue).toBe("notify")
    expect(m).toMatchObject({ messageId: "notify-h1-2026110210", contentType: "application/json", applicationProperties: { traceparent: TP, path: "/v1/jobs/notify/household/h1" } })
    expect(m.scheduledEnqueueTimeUtc!.getTime() - Date.now()).toBeGreaterThan(28_000)
    expect(m.body).toMatchObject({ v: 1, queue: "notify", path: "/v1/jobs/notify/household/h1", body: { a: 1 }, traceparent: TP })
    await q.enqueue({ queue: "slow", path: "/y", name: "s1" })
    expect(f.sent[1].queue).toBe("mirai-lenta")
  })

  it("si el envío falla, suelta el nombre (el siguiente intento puede encolarla)", async () => {
    const f = fakeClient()
    const q = new ServiceBusQueue({ client: f.client })
    f.state.failSend = true
    await expect(q.enqueue({ queue: "notify", path: "/x", name: "k1" })).rejects.toThrow(/Service Bus no aceptó la tarea \(ServiceBusError\)/)
    f.state.failSend = false
    expect((await q.enqueue({ queue: "notify", path: "/x", name: "k1" })).deduped).toBe(false)
  })

  it("consume: completa si sale bien; si falla reprograma con espera creciente; agotado → cola de fallidos", async () => {
    const f = fakeClient()
    const q = new ServiceBusQueue({ client: f.client, queues: { notify: "mirai-notify" } })
    const seen: { name: string; attempt: number; traceparent?: string }[] = []
    let fail = false
    const c = await q.consume("notify", async (t, i) => {
      seen.push({ name: t.name, attempt: i.attempt, traceparent: t.traceparent })
      if (fail) throw new Error("El trabajador respondió 503")
    }, OPTS)
    expect(f.state.receiverQueue).toBe("mirai-notify")
    expect(f.opts()).toEqual({ maxConcurrentCalls: 2, autoCompleteMessages: false })

    const ok = msg({ name: "ok1" }, { applicationProperties: { traceparent: TP } })
    await f.deliver(ok)
    expect(f.settled.at(-1)).toMatchObject({ op: "complete", m: ok })
    expect(seen.at(-1)).toEqual({ name: "ok1", attempt: 1, traceparent: TP })

    fail = true
    const bad = msg({ name: "bad1" })
    const t0 = Date.now()
    await f.deliver(bad)
    expect(f.settled.at(-1)).toMatchObject({ op: "complete", m: bad })
    const copy = f.sent.at(-1)!
    expect(copy.queue).toBe("mirai-notify")
    expect(copy.m.messageId).toBe("bad1~r2")
    expect((copy.m.body as TaskEnvelope).attempt).toBe(2)
    const delay = copy.m.scheduledEnqueueTimeUtc!.getTime() - t0
    expect(delay).toBeGreaterThanOrEqual(9_000)
    expect(delay).toBeLessThanOrEqual(12_000)

    // Segundo reintento: 20 s.
    await f.deliver({ ...msg({ name: "bad1", attempt: 2 }), messageId: "bad1~r2" })
    const d2 = f.sent.at(-1)!.m.scheduledEnqueueTimeUtc!.getTime() - Date.now()
    expect(d2).toBeGreaterThan(18_000)
    expect(f.sent.at(-1)!.m.messageId).toBe("bad1~r3")

    // Tercer intento = maxAttempts → cola de fallidos (sin otra copia).
    const before = f.sent.length
    const last = msg({ name: "bad1", attempt: 3 })
    await f.deliver(last)
    expect(f.settled.at(-1)).toMatchObject({ op: "deadLetter", m: last, reason: "intentos-agotados" })
    expect(f.sent.length).toBe(before)

    // Sobre inválido → cola de fallidos.
    const junk = { body: "no es un sobre", messageId: "j1" }
    await f.deliver(junk)
    expect(f.settled.at(-1)).toMatchObject({ op: "deadLetter", m: junk, reason: "sobre-invalido" })

    // Si reprogramar falla: abandon (maxDeliveryCount → DLQ de Service Bus).
    f.state.failSend = true
    const b2 = msg({ name: "bad2" })
    await f.deliver(b2)
    expect(f.settled.at(-1)).toMatchObject({ op: "abandon", m: b2 })
    f.state.failSend = false

    await c.stop(1000)
    expect(f.state.subClosed).toBe(true)
    await q.close()
    expect(f.state.closed).toBe(true)
  })

  it("respeta notBefore: si llega antes de tiempo se reprograma sin ejecutarla", async () => {
    const f = fakeClient()
    const q = new ServiceBusQueue({ client: f.client })
    let runs = 0
    await q.consume("slow", async () => void runs++, OPTS)
    const early = msg({ queue: "slow", name: "e1", notBefore: Date.now() + 60_000 })
    await f.deliver(early)
    expect(runs).toBe(0)
    expect(f.sent.at(-1)!.m).toMatchObject({ messageId: "e1~w1" })
    expect(f.settled.at(-1)).toMatchObject({ op: "complete", m: early })
  })

  it("apagado: espera la tarea en curso antes de cerrar el receptor", async () => {
    const f = fakeClient()
    const q = new ServiceBusQueue({ client: f.client })
    let release!: () => void
    const c = await q.consume("notify", () => new Promise<void>((r) => (release = r)), OPTS)
    const p = f.deliver(msg({ name: "lenta" }))
    let stopped = false
    const s = c.stop(5_000).then(() => (stopped = true))
    await new Promise((r) => setTimeout(r, 50))
    expect(stopped).toBe(false)
    release()
    await p
    await s
    expect(stopped).toBe(true)
    expect(f.settled.at(-1)).toMatchObject({ op: "complete" })
  })
})
