// Almacén de los límites de tasa (§2.7.5). Puerto + dos adaptadores:
// - MemoryRateLimitStore: por instancia (desarrollo, pruebas y el límite general por minuto).
// - SupabaseRateLimitStore: función SQL rate_limit_hit (compartida entre instancias y con apps/web, misma clave
//   `<límite>:<id>`), con respaldo en memoria si la base falla. Ojo: cada llamada es un viaje a la base saturada, así
//   que solo se usa para los límites con nombre (LIMITS), nunca para el general.
import { Inject, Injectable } from "@nestjs/common"
import type { Logger } from "pino"
import { systemScope } from "../db/scope"
import { SupabaseJsFactory } from "../db/supabase-js.factory"
import { LOGGER } from "../logging/logger"
import { hitWindow, type LimitResult, type Window } from "./window"

export abstract class RateLimitStore {
  abstract hit(key: string, max: number, windowS: number): Promise<LimitResult>
}

export class MemoryRateLimitStore extends RateLimitStore {
  private readonly windows = new Map<string, Window>()
  constructor(private readonly now: () => number = Date.now) {
    super()
  }
  async hit(key: string, max: number, windowS: number) {
    return hitWindow(this.windows, key, max, windowS * 1000, this.now())
  }
}

@Injectable()
export class SupabaseRateLimitStore extends RateLimitStore {
  private readonly memory = new MemoryRateLimitStore()
  constructor(
    private readonly sb: SupabaseJsFactory,
    @Inject(LOGGER) private readonly log: Logger,
  ) {
    super()
  }
  async hit(key: string, max: number, windowS: number): Promise<LimitResult> {
    try {
      const { data, error } = await this.sb.for(systemScope("rate-limit")).rpc("rate_limit_hit" as never, { p_key: key, p_max: max, p_window_s: windowS } as never)
      if (error) throw error
      const r = (Array.isArray(data) ? data[0] : data) as { ok: boolean; remaining: number; reset_ms: number } | null
      if (r && typeof r.ok === "boolean") return { ok: r.ok, remaining: Number(r.remaining) || 0, resetMs: Number(r.reset_ms) || 0 }
    } catch (e) {
      this.log.warn({ error: e }, "rate_limit_hit falló; uso el contador en memoria")
    }
    return this.memory.hit(key, max, windowS)
  }
}
