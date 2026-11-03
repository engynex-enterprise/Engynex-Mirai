// Límites con nombre (LIMITS) que dependen de los datos y no solo de la ruta: p. ej. las invitaciones a correos de
// prueba no cuentan, o el portal del contador cuenta por token. Mismo almacén y mensaje que @RateLimit (§2.7.5);
// equivale a limitError / rateLimit de apps/web/lib/security/rate-limit.ts.
import { Injectable } from "@nestjs/common"
import { CLS_REQ, ClsService } from "nestjs-cls"
import { LIMITS, type LimitName } from "@mirai/contracts/limits"
import { DomainError } from "../../core/errors/domain-error"
import { RateLimitStore } from "../../core/rate-limit/rate-limit.store"
import { limitMsg } from "../../core/rate-limit/window"

@Injectable()
export class Limiter {
  constructor(private readonly store: RateLimitStore) {}

  /** ¿Queda cupo? (no lanza). */
  async ok(name: LimitName, id: string): Promise<boolean> {
    const { max, windowS } = LIMITS[name]
    return (await this.store.hit(`${name}:${id}`, max, windowS)).ok
  }

  /** Cuenta un intento; 429 con el mensaje de la web si se pasó. `que`: "Enviaste muchas invitaciones seguidas". */
  async hit(name: LimitName, id: string, que?: string): Promise<void> {
    const { max, windowS } = LIMITS[name]
    const r = await this.store.hit(`${name}:${id}`, max, windowS)
    if (!r.ok) throw DomainError.rateLimited(limitMsg(r.resetMs, que), r.resetMs / 1000)
  }
}

/** IP y dispositivo de la petición (actividad de seguridad: los triggers de Auth no los conocen). */
@Injectable()
export class RequestMeta {
  constructor(private readonly cls: ClsService) {}
  get(): { ip: string | null; user_agent: string | null } {
    const req = this.cls.isActive() ? (this.cls.get(CLS_REQ) as { headers?: Record<string, string | string[] | undefined>; ip?: string } | undefined) : undefined
    const h = req?.headers ?? {}
    const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
    const ip = one(h["x-forwarded-for"])?.split(",")[0]?.trim() || req?.ip || null
    return { ip, user_agent: one(h["user-agent"])?.slice(0, 300) ?? null }
  }
  /** Origen de la web que llamó (localhost, pruebas o producción) para los enlaces de vuelta, si es válido. */
  origin(): string | null {
    const req = this.cls.isActive() ? (this.cls.get(CLS_REQ) as { headers?: Record<string, string | string[] | undefined> } | undefined) : undefined
    const o = req?.headers?.origin
    const v = Array.isArray(o) ? o[0] : o
    return v && /^https?:\/\/[^/\s]+$/.test(v) ? v : null
  }
}
