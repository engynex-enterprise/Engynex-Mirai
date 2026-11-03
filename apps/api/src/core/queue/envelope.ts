// Sobre de una tarea en las colas de extracción (SQS, Service Bus) y en el empuje HTTP: lo que el trabajador necesita
// para despacharla igual que Cloud Tasks (ruta, cuerpo, traza) más `notBefore` (retraso que el consumidor respeta aunque
// la cola no lo soporte, p. ej. SQS FIFO) y `attempt` (reintentos reprogramados en Service Bus).
import { createHash, randomUUID } from "node:crypto"
import { z } from "zod"
import { QUEUE_NAMES, type QueueName, type Task } from "./queue.port"
import { traceCarrier } from "./trace"

export const TaskEnvelopeSchema = z.object({
  v: z.literal(1),
  queue: z.enum(QUEUE_NAMES as [QueueName, ...QueueName[]]),
  name: z.string().min(1).max(500),
  path: z.string().startsWith("/"),
  body: z.unknown().optional(),
  /** Epoch en ms: no ejecutarla antes. */
  notBefore: z.number().int().nonnegative().optional(),
  /** Intento actual (1 = primero). */
  attempt: z.number().int().min(1).optional(),
  traceparent: z.string().max(100).optional(),
  tracestate: z.string().max(512).optional(),
})

export type TaskEnvelope = z.infer<typeof TaskEnvelopeSchema>

/** Arma el sobre con la traza activa (web → api → tarea). */
export function toEnvelope(t: Task, now = Date.now()): TaskEnvelope {
  const c = traceCarrier()
  return {
    v: 1,
    queue: t.queue,
    name: t.name ?? randomUUID(),
    path: t.path,
    ...(t.body === undefined ? {} : { body: t.body }),
    ...(t.delayS ? { notBefore: now + Math.round(t.delayS * 1000) } : {}),
    ...(c.traceparent ? { traceparent: c.traceparent } : {}),
    ...(c.tracestate ? { tracestate: c.tracestate } : {}),
  }
}

/** Lee el sobre (JSON o ya decodificado). Devuelve undefined si no es válido. */
export function parseEnvelope(raw: unknown): TaskEnvelope | undefined {
  let v = raw
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw)
    } catch {
      return undefined
    }
  } else if (Buffer.isBuffer(raw)) {
    return parseEnvelope(raw.toString("utf8"))
  }
  const r = TaskEnvelopeSchema.safeParse(v)
  return r.success ? r.data : undefined
}

/** Identificador corto y estable (SQS y Service Bus aceptan hasta 128 caracteres; los nombres pueden tener 500). */
export function shortId(name: string, max = 128): string {
  return name.length <= max ? name : `h-${createHash("sha256").update(name).digest("hex")}`
}

/** Espera creciente entre reintentos: base·2^(intento-1), con tope y hasta 10 % de variación (evita avalanchas). */
export function backoffS(attempt: number, baseS: number, maxS: number, jitter = Math.random()): number {
  const raw = Math.min(maxS, baseS * 2 ** Math.max(0, attempt - 1))
  return Math.max(1, Math.min(maxS, Math.round(raw * (1 + 0.1 * jitter))))
}
