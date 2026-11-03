// IdempotencyInterceptor (§2.7.6). En rutas marcadas con @Idempotent(), la cabecera `Idempotency-Key` hace que repetir
// la misma petición (misma persona, misma ruta, mismo cuerpo) devuelva la respuesta guardada sin volver a ejecutarla
// (cabecera `Idempotent-Replayed: true`). Si la primera sigue en curso: 409. Si la llave se reusa con otro cuerpo: 409.
// Se guardan solo las respuestas 2xx y 4xx de negocio; un 5xx o una excepción liberan la llave para reintentar.
import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor, SetMetadata } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { createHash } from "node:crypto"
import { from, lastValueFrom, type Observable } from "rxjs"
import { AppConfig } from "../config/app-config"
import { RequestContextService } from "../context/request-context.service"
import { DomainError } from "../errors/domain-error"
import { IdempotencyStore } from "./idempotency.store"

export const IDEMPOTENT = "mirai:idempotent"
/** La ruta acepta `Idempotency-Key` (comandos POST: pagar, abonar, checkout, invitar, chat…). `required`: la exige. */
export const Idempotent = (o: { required?: boolean } = {}) => SetMetadata(IDEMPOTENT, { required: !!o.required })

const KEY_RE = /^[\w.:-]{8,200}$/

type Req = { method: string; url: string; headers: Record<string, string | string[] | undefined>; body?: unknown; routeOptions?: { url?: string } }
type Res = { statusCode: number; status(n: number): Res; header(k: string, v: string): Res }

export function fingerprint(method: string, route: string, body: unknown): string {
  return createHash("sha256").update(`${method} ${route}\n${JSON.stringify(body ?? null)}`).digest("base64url")
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: IdempotencyStore,
    private readonly config: AppConfig,
    private readonly ctx: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<{ required: boolean } | undefined>(IDEMPOTENT, [context.getHandler(), context.getClass()])
    if (!meta || context.getType() !== "http") return next.handle()
    const http = context.switchToHttp()
    const req = http.getRequest<Req>()
    const res = http.getResponse<Res>()
    const raw = req.headers["idempotency-key"]
    const key = Array.isArray(raw) ? raw[0] : raw
    if (!key) {
      if (meta.required) throw DomainError.validation("Falta la cabecera Idempotency-Key.")
      return next.handle()
    }
    if (!KEY_RE.test(key)) throw DomainError.validation("Idempotency-Key inválida (8 a 200 letras, números, '-', '_', '.' o ':').")
    return from(this.run(key, req, res, next))
  }

  private async run(key: string, req: Req, res: Res, next: CallHandler): Promise<unknown> {
    const c = this.ctx.get()
    const route = `${req.method} ${req.routeOptions?.url ?? req.url.split("?")[0]}`
    // La llave es por persona y ruta: dos personas pueden usar la misma sin cruzarse.
    const full = `${c.user?.id ?? c.caller ?? "anon"}|${route}|${key}`
    const fp = fingerprint(req.method, req.url.split("?")[0], req.body)
    c.idempotencyKey = key
    const begun = await this.store.begin(full, { fingerprint: fp, userId: c.user?.id ?? null, route, ttlS: this.config.idempotency.ttlS })
    if (begun.state === "inflight") throw DomainError.conflict("Esta operación ya se está procesando. Espera un momento.")
    if (begun.state === "mismatch") throw DomainError.conflict("Esa Idempotency-Key ya se usó con otros datos.")
    if (begun.state === "done") {
      res.status(begun.response.status).header("idempotent-replayed", "true")
      return begun.response.body
    }
    try {
      const body = await lastValueFrom(next.handle(), { defaultValue: undefined })
      const status = res.statusCode
      if (status >= 500) await this.store.release(full)
      else await this.store.complete(full, { status, body })
      return body
    } catch (e) {
      // Los errores de negocio (4xx) también se repiten igual; los inesperados liberan la llave.
      if (e instanceof DomainError && e.status < 500) {
        await this.store.complete(full, { status: e.status, body: { ok: false, msg: e.msg, code: e.code, requestId: c.requestId, ...(e.details !== undefined ? { details: e.details } : {}) } })
      } else await this.store.release(full)
      throw e
    }
  }
}
