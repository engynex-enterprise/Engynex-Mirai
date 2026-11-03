// Presencia por libro (F2-G-3): quién está conectado y en qué pantalla. Una entrada por conexión (pestaña) con
// vencimiento; la lista se deduplica por persona (como el `presence key` = id de Supabase Realtime).
// - MemoryPresenceStore: una sola instancia (local, pruebas, o Cloud Run con max-instances=1).
// - RedisPresenceStore: varias instancias (HSET presence:book:{id} <socket> <json>, con TTL y latido).
import type { PresenceUser } from "@mirai/contracts/modules/realtime"

export abstract class PresenceStore {
  /** Guarda (o renueva) la entrada de una conexión. */
  abstract set(bookId: string, socketId: string, user: PresenceUser, ttlMs: number): Promise<void>
  abstract remove(bookId: string, socketId: string): Promise<void>
  /** Personas presentes (sin vencidas, una por persona: la más reciente). */
  abstract list(bookId: string): Promise<PresenceUser[]>
}

type Entry = { user: PresenceUser; exp: number }

/** Una por persona, la entrada más reciente; orden estable por nombre. */
export function dedupe(entries: Entry[], now: number): PresenceUser[] {
  const byUser = new Map<string, Entry>()
  for (const e of entries) {
    if (e.exp <= now) continue
    const prev = byUser.get(e.user.id)
    // La más reciente; si llegaron en el mismo milisegundo, la última guardada (vence después).
    if (!prev || prev.user.at < e.user.at || (prev.user.at === e.user.at && prev.exp <= e.exp)) byUser.set(e.user.id, e)
  }
  return [...byUser.values()].map((e) => e.user).sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.id.localeCompare(b.id))
}

export class MemoryPresenceStore extends PresenceStore {
  private readonly books = new Map<string, Map<string, Entry>>()
  constructor(private readonly now: () => number = Date.now) {
    super()
  }
  async set(bookId: string, socketId: string, user: PresenceUser, ttlMs: number) {
    let m = this.books.get(bookId)
    if (!m) this.books.set(bookId, (m = new Map()))
    m.set(socketId, { user, exp: this.now() + ttlMs })
  }
  async remove(bookId: string, socketId: string) {
    const m = this.books.get(bookId)
    m?.delete(socketId)
    if (m && !m.size) this.books.delete(bookId)
  }
  async list(bookId: string) {
    const m = this.books.get(bookId)
    if (!m) return []
    const now = this.now()
    for (const [k, e] of m) if (e.exp <= now) m.delete(k)
    return dedupe([...m.values()], now)
  }
}

/** Lo que usa de ioredis (estructural: las pruebas pasan un doble). */
export type RedisLike = {
  hset(key: string, field: string, value: string): Promise<unknown>
  hdel(key: string, ...fields: string[]): Promise<unknown>
  hgetall(key: string): Promise<Record<string, string>>
  pexpire(key: string, ms: number): Promise<unknown>
}

export const presenceKey = (bookId: string) => `presence:book:${bookId}`

export class RedisPresenceStore extends PresenceStore {
  constructor(
    private readonly redis: RedisLike,
    private readonly now: () => number = Date.now,
  ) {
    super()
  }
  async set(bookId: string, socketId: string, user: PresenceUser, ttlMs: number) {
    const key = presenceKey(bookId)
    await this.redis.hset(key, socketId, JSON.stringify({ user, exp: this.now() + ttlMs } satisfies Entry))
    // La llave entera se borra sola si nadie late (instancia caída sin limpiar).
    await this.redis.pexpire(key, ttlMs * 2)
  }
  async remove(bookId: string, socketId: string) {
    await this.redis.hdel(presenceKey(bookId), socketId)
  }
  async list(bookId: string) {
    const key = presenceKey(bookId)
    const all = await this.redis.hgetall(key)
    const now = this.now()
    const entries: Entry[] = []
    const dead: string[] = []
    for (const [field, raw] of Object.entries(all ?? {})) {
      try {
        const e = JSON.parse(raw) as Entry
        if (e.exp > now) entries.push(e)
        else dead.push(field)
      } catch {
        dead.push(field)
      }
    }
    if (dead.length) await this.redis.hdel(key, ...dead)
    return dedupe(entries, now)
  }
}
