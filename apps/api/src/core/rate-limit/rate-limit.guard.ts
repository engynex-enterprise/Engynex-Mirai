// Límites de tasa (§2.7.5).
// - General: RATE_LIMIT_DEFAULT_PER_MIN peticiones por minuto por persona (o por IP si no hay sesión), en memoria.
// - Con nombre: @RateLimit("chat", "user" | "household" | "ip") usa LIMITS de @mirai/contracts y el almacén compartido.
// Al pasarse: 429 RATE_LIMITED con el mismo mensaje de apps/web (limitMsg) y Retry-After.
import { type CanActivate, type ExecutionContext, Inject, Injectable, SetMetadata } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { LIMITS, type LimitName } from "@mirai/contracts/limits"
import { AppConfig } from "../config/app-config"
import { RequestContextService } from "../context/request-context.service"
import { DomainError } from "../errors/domain-error"
import { MemoryRateLimitStore, RateLimitStore } from "./rate-limit.store"
import { limitMsg } from "./window"

export type LimitBy = "user" | "household" | "ip"
export type RateLimitMeta = { name: LimitName; by: LimitBy; msg?: string }
export const RATE_LIMIT = "mirai:rate-limit"
export const SKIP_DEFAULT_LIMIT = "mirai:skip-default-limit"

/** Límite con nombre de LIMITS (p. ej. @RateLimit("chat")). `msg`: qué se hizo muchas veces ("Enviaste muchos mensajes"). */
export const RateLimit = (name: LimitName, by: LimitBy = "user", msg?: string) => SetMetadata(RATE_LIMIT, { name, by, msg } satisfies RateLimitMeta)
/** Sin el límite general (health, webhooks: los protege Cloud Armor). */
export const SkipDefaultLimit = () => SetMetadata(SKIP_DEFAULT_LIMIT, true)

export const DEFAULT_LIMIT_STORE = Symbol("mirai.default-limit-store")

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfig,
    private readonly store: RateLimitStore,
    @Inject(DEFAULT_LIMIT_STORE) private readonly local: MemoryRateLimitStore,
    private readonly ctx: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true
    const targets = [context.getHandler(), context.getClass()]
    const c = this.ctx.get()
    const res = context.switchToHttp().getResponse<{ header(k: string, v: string): unknown }>()

    if (!this.reflector.getAllAndOverride<boolean>(SKIP_DEFAULT_LIMIT, targets)) {
      const who = c.user ? `u:${c.user.id}` : `ip:${c.ip ?? "?"}`
      const r = await this.local.hit(`api:${who}`, this.config.rateLimit.defaultPerMin, 60)
      if (!r.ok) throw DomainError.rateLimited(limitMsg(r.resetMs, "Hiciste muchas peticiones seguidas"), r.resetMs / 1000)
    }

    const meta = this.reflector.getAllAndOverride<RateLimitMeta | undefined>(RATE_LIMIT, targets)
    if (!meta) return true
    const id = meta.by === "household" ? c.bookAccess?.household.id : meta.by === "ip" ? c.ip : c.user?.id
    if (!id) throw DomainError.internal(new Error(`@RateLimit(${meta.name}, ${meta.by}) sin ${meta.by} en el contexto`))
    const { max, windowS } = LIMITS[meta.name]
    const r = await this.store.hit(`${meta.name}:${id}`, max, windowS)
    res.header("ratelimit-limit", String(max))
    res.header("ratelimit-remaining", String(r.remaining))
    res.header("ratelimit-reset", String(Math.ceil(r.resetMs / 1000)))
    if (!r.ok) throw DomainError.rateLimited(limitMsg(r.resetMs, meta.msg), r.resetMs / 1000)
    return true
  }
}
