// Almacén de idempotencia (§2.7.6). Puerto + adaptadores:
// - MemoryIdempotencyStore: por instancia (desarrollo, pruebas y mientras la migración no esté aplicada).
// - SupabaseIdempotencyStore: tabla api_idempotency (migración aditiva 20261103003800_api_idempotency.sql, SIN aplicar
//   en la base compartida todavía), compartida entre instancias. IDEMPOTENCY_STORE=supabase la activa.
import { Injectable } from "@nestjs/common"
import { systemScope } from "../db/scope"
import { SupabaseJsFactory } from "../db/supabase-js.factory"
import { DomainError } from "../errors/domain-error"

export type StoredResponse = { status: number; body: unknown }
export type BeginResult =
  | { state: "new" }
  | { state: "inflight" }
  | { state: "done"; fingerprint: string; response: StoredResponse }
  | { state: "mismatch" }

export abstract class IdempotencyStore {
  /** Reserva la llave. Si ya existe: en curso, terminada (con su respuesta) o con otro cuerpo (mismatch). */
  abstract begin(key: string, a: { fingerprint: string; userId: string | null; route: string; ttlS: number }): Promise<BeginResult>
  abstract complete(key: string, response: StoredResponse): Promise<void>
  /** Libera la llave si la operación falló (para poder reintentar con la misma). */
  abstract release(key: string): Promise<void>
}

type MemEntry = { fingerprint: string; expires: number; response?: StoredResponse }

export class MemoryIdempotencyStore extends IdempotencyStore {
  private readonly m = new Map<string, MemEntry>()
  constructor(private readonly now: () => number = Date.now) {
    super()
  }
  async begin(key: string, a: { fingerprint: string; ttlS: number }): Promise<BeginResult> {
    const t = this.now()
    const e = this.m.get(key)
    if (e && e.expires > t) {
      if (e.fingerprint !== a.fingerprint) return { state: "mismatch" }
      return e.response ? { state: "done", fingerprint: e.fingerprint, response: e.response } : { state: "inflight" }
    }
    this.m.set(key, { fingerprint: a.fingerprint, expires: t + a.ttlS * 1000 })
    if (this.m.size > 10_000) for (const [k, v] of this.m) if (v.expires <= t) this.m.delete(k)
    return { state: "new" }
  }
  async complete(key: string, response: StoredResponse) {
    const e = this.m.get(key)
    if (e) e.response = response
  }
  async release(key: string) {
    this.m.delete(key)
  }
}

type IdemRow = { fingerprint: string; status: number | null; response: unknown; expires_at: string }

@Injectable()
export class SupabaseIdempotencyStore extends IdempotencyStore {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }
  // La tabla aún no está en database.types.ts (se regenera al aplicar la migración): consultas sin tipar.
  private t() {
    return (this.sb.for(systemScope("idempotency")) as unknown as { from(t: string): any }).from("api_idempotency") // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  async begin(key: string, a: { fingerprint: string; userId: string | null; route: string; ttlS: number }): Promise<BeginResult> {
    const expires = new Date(Date.now() + a.ttlS * 1000).toISOString()
    const ins = await this.t().insert({ key, user_id: a.userId, route: a.route, fingerprint: a.fingerprint, expires_at: expires }, { count: "exact" })
    if (!ins.error) return { state: "new" }
    if (ins.error.code !== "23505") throw DomainError.fromPg(ins.error)
    const { data, error } = await this.t().select("fingerprint,status,response,expires_at").eq("key", key).maybeSingle()
    if (error) throw DomainError.fromPg(error)
    const row = data as IdemRow | null
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
      // Venció: se reemplaza (borrar + insertar para no pisar una reserva ajena recién hecha).
      await this.t().delete().eq("key", key).lte("expires_at", new Date().toISOString())
      return this.begin(key, a)
    }
    if (row.fingerprint !== a.fingerprint) return { state: "mismatch" }
    return row.status === null ? { state: "inflight" } : { state: "done", fingerprint: row.fingerprint, response: { status: row.status, body: row.response } }
  }
  async complete(key: string, r: StoredResponse) {
    const { error } = await this.t().update({ status: r.status, response: r.body ?? null }).eq("key", key)
    if (error) throw DomainError.fromPg(error)
  }
  async release(key: string) {
    await this.t().delete().eq("key", key).is("status", null)
  }
}
