// v7 · V7-D · Puente PostgREST interno (docs/arquitectura/v7-gcp-total.md §3.3, D4). Con DB_ADAPTER=postgrest, los ~430
// sitios que hoy usan el constructor de supabase-js (packages/services, packages/ai y los adaptadores supabase-js.*)
// le hablan a un PostgREST propio, solo de tráfico interno, conectado a la Postgres destino con el rol authenticator.
//
// La API firma un JWT interno HS256 de 60 s por alcance (lo conocen solo la API y PostgREST, POSTGREST_JWT_SECRET):
//   UserScope   → { sub, role: "authenticated", email, session_id, aal }   (misma RLS, mismo auth.uid()/auth.jwt())
//   SystemScope → { role: "service_role" }                                  (salta RLS; auth.role() = 'service_role')
// PostgREST hace `set local role` y pone `request.jwt.claims` y `request.headers` (con `x-mirai-enlaces: 1` para las
// cascadas gasto ↔ tarjeta ↔ fijo), igual que Supabase. El token se renueva solo antes de vencer.
import { Inject, Injectable, Optional } from "@nestjs/common"
import { PostgrestClient } from "@supabase/postgrest-js"
import { SignJWT } from "jose"
import type { Logger } from "pino"
import type { Database } from "@mirai/db"
import { AppConfig } from "../config/app-config"
import { DomainError } from "../errors/domain-error"
import { LOGGER } from "../logging/logger"
import type { DbScope, UserScope } from "./scope"

export type Pgrst = PostgrestClient<Database>

/** Solo pruebas: otro fetch (para ver qué se manda sin red). */
export const PGRST_FETCH = Symbol("mirai.pgrst-fetch")

/** Vida del JWT interno (s) y cuándo se renueva (s antes de vencer). */
export const INTERNAL_JWT_TTL_S = 60
const RENEW_BEFORE_S = 15

/** Claims del JWT interno para un alcance (exportado para las pruebas). */
export function internalClaims(scope: DbScope): Record<string, unknown> {
  if (scope.kind === "system") return { role: "service_role" }
  const c = scope.claims as Record<string, unknown>
  return {
    sub: scope.userId,
    role: "authenticated",
    aud: "authenticated",
    ...(typeof c.email === "string" ? { email: c.email } : {}),
    ...(typeof c.session_id === "string" ? { session_id: c.session_id } : {}),
    ...(typeof c.aal === "string" ? { aal: c.aal } : {}),
    ...(c.is_anonymous === true ? { is_anonymous: true } : {}),
  }
}

type Signed = { token: string; exp: number }

@Injectable()
export class PostgrestFactory {
  private system?: Pgrst
  private readonly perUser = new WeakMap<UserScope, Pgrst>()
  private readonly tokens = new WeakMap<object, Signed>()
  private readonly systemKey = {}
  private secret?: Uint8Array

  constructor(
    private readonly config: AppConfig,
    @Inject(LOGGER) private readonly log: Logger,
    @Optional() @Inject(PGRST_FETCH) private readonly fetchOverride?: typeof fetch,
  ) {}

  private fetchImpl(input: Parameters<typeof fetch>[0], init?: RequestInit) {
    return (this.fetchOverride ?? fetch)(input, init)
  }

  private get url(): string {
    const u = this.config.db.postgrest?.url
    if (!u) throw DomainError.internal(new Error("DB_ADAPTER=postgrest sin POSTGREST_URL"))
    return u
  }

  private key(): Uint8Array {
    const s = this.config.db.postgrest?.jwtSecret
    if (!s) throw DomainError.internal(new Error("DB_ADAPTER=postgrest sin POSTGREST_JWT_SECRET"))
    return (this.secret ??= new TextEncoder().encode(s))
  }

  /** JWT interno vigente para el alcance (lo reusa hasta 15 s antes de vencer). */
  async token(scope: DbScope): Promise<string> {
    const k = scope.kind === "user" ? scope : this.systemKey
    const now = Math.floor(Date.now() / 1000)
    const hit = this.tokens.get(k)
    if (hit && hit.exp - now > RENEW_BEFORE_S) return hit.token
    const exp = now + INTERNAL_JWT_TTL_S
    const token = await new SignJWT(internalClaims(scope)).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuedAt(now).setExpirationTime(exp).setIssuer("mirai-api").sign(this.key())
    this.tokens.set(k, { token, exp })
    return token
  }

  /** Cliente para el alcance (uno por UserScope, es decir, por petición; uno para el sistema). */
  for(scope: DbScope): Pgrst {
    if (scope.kind === "system") {
      this.log.debug({ reason: scope.reason }, "SystemScope (postgrest)")
      return (this.system ??= this.client(scope, {}))
    }
    let c = this.perUser.get(scope)
    if (!c) this.perUser.set(scope, (c = this.client(scope, { "x-mirai-enlaces": "1" })))
    return c
  }

  private client(scope: DbScope, headers: Record<string, string>): Pgrst {
    const authed: typeof fetch = async (input, init) => {
      const h = new Headers(init?.headers)
      h.set("Authorization", `Bearer ${await this.token(scope)}`)
      h.set("x-client-info", "mirai-api")
      return this.fetchImpl(input, { ...init, headers: h })
    }
    return new PostgrestClient<Database>(this.url, { headers, fetch: authed })
  }

  /** Para /readyz: PostgREST responde (GET a la raíz, sin consultar tablas). */
  async ping(timeoutMs = 2000): Promise<{ ok: boolean; msg?: string }> {
    try {
      const r = await this.fetchImpl(`${this.url}/`, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs) })
      return r.status < 500 ? { ok: true } : { ok: false, msg: `PostgREST respondió ${r.status}` }
    } catch (e) {
      return { ok: false, msg: `PostgREST no responde (${(e as Error).name})` }
    }
  }
}
