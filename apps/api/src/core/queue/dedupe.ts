// Deduplicación por nombre del lado del que encola, para las colas que no la garantizan del todo: SQS estándar (no
// deduplica), SQS FIFO (solo 5 minutos), Service Bus (sí, pero no avisa que descartó) y el empuje HTTP.
//  - memory (por defecto): por instancia de la API. Basta en local o con una sola instancia.
//  - redis: SET NX EX en REDIS_URL, compartido entre instancias (Memorystore / ElastiCache / Azure Cache).
//  - none: sin revisión local (solo la nativa de la cola).
// Los trabajadores de /v1/jobs/** deben seguir siendo idempotentes: las colas de extracción entregan "al menos una vez".
import type { Logger } from "pino"

export abstract class DedupeStore {
  /** true si este proceso "ganó" el nombre (no se había visto en ttlS segundos). */
  abstract claim(key: string, ttlS: number): Promise<boolean>
  /** Suelta el nombre (el envío falló: que el próximo intento pueda encolarla). */
  abstract release(key: string): Promise<void>
  async close(): Promise<void> {}
}

export class MemoryDedupeStore extends DedupeStore {
  private readonly seen = new Map<string, number>()
  private sweeps = 0

  constructor(private readonly now: () => number = Date.now) {
    super()
  }

  async claim(key: string, ttlS: number): Promise<boolean> {
    const t = this.now()
    if (++this.sweeps % 1000 === 0) for (const [k, exp] of this.seen) if (exp <= t) this.seen.delete(k)
    const exp = this.seen.get(key)
    if (exp !== undefined && exp > t) return false
    this.seen.set(key, t + ttlS * 1000)
    return true
  }

  async release(key: string): Promise<void> {
    this.seen.delete(key)
  }
}

export class NoDedupeStore extends DedupeStore {
  async claim(): Promise<boolean> {
    return true
  }
  async release(): Promise<void> {}
}

type RedisLike = { set(k: string, v: string, ex: "EX", s: number, nx: "NX"): Promise<string | null>; del(k: string): Promise<number>; quit(): Promise<unknown> }

export class RedisDedupeStore extends DedupeStore {
  private client?: Promise<RedisLike>

  constructor(
    private readonly url: string,
    private readonly log?: Logger,
    private readonly prefix = "mirai-q:",
  ) {
    super()
  }

  private redis(): Promise<RedisLike> {
    return (this.client ??= import("ioredis").then(({ Redis }) => {
      const r = new Redis(this.url, { maxRetriesPerRequest: 2, connectionName: "mirai-queue-dedupe" })
      // Nunca el URL en el log (puede llevar la clave).
      r.on("error", (e: Error) => this.log?.warn({ redis: "queue-dedupe", error: { name: e.name, message: e.message } }, "Redis con problemas"))
      return r as unknown as RedisLike
    }))
  }

  async claim(key: string, ttlS: number): Promise<boolean> {
    return (await (await this.redis()).set(this.prefix + key, "1", "EX", Math.max(1, Math.round(ttlS)), "NX")) === "OK"
  }

  async release(key: string): Promise<void> {
    await (await this.redis()).del(this.prefix + key)
  }

  async close(): Promise<void> {
    if (this.client) await (await this.client).quit().catch(() => undefined)
  }
}
