// Adaptador de la fase 2 (§2.3): supabase-js contra PostgREST. Con UserScope manda el JWT de la persona (misma RLS,
// mismo auth.uid()) y `x-mirai-enlaces: 1` (las cascadas gasto ↔ tarjeta ↔ fijo, R5). No abre conexiones a Postgres.
import { Inject, Injectable } from "@nestjs/common"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Logger } from "pino"
import type { Database } from "@mirai/db"
import { AppConfig } from "../config/app-config"
import { DomainError } from "../errors/domain-error"
import { LOGGER } from "../logging/logger"
import type { DbScope, SystemScope, UserScope } from "./scope"

export type Sb = SupabaseClient<Database>

const AUTH = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const

@Injectable()
export class SupabaseJsFactory {
  private system?: Sb
  private readonly perUser = new WeakMap<UserScope, Sb>()

  constructor(
    private readonly config: AppConfig,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  /** Cliente para el alcance: el de la persona (RLS) o el del sistema (clave secreta). */
  for(scope: DbScope): Sb {
    return scope.kind === "user" ? this.user(scope) : this.sys(scope)
  }

  private user(s: UserScope): Sb {
    let c = this.perUser.get(s)
    if (!c) {
      c = createClient<Database>(this.config.supabase.url, this.config.supabase.publishableKey, {
        auth: AUTH,
        global: { headers: { Authorization: `Bearer ${s.token}`, "x-mirai-enlaces": "1", "x-client-info": "mirai-api" } },
      })
      this.perUser.set(s, c)
    }
    return c
  }

  private sys(s: SystemScope): Sb {
    const key = this.config.supabase.secretKey
    if (!key) throw DomainError.internal(new Error(`SystemScope (${s.reason}) sin SUPABASE_SECRET_KEY`))
    this.log.debug({ reason: s.reason }, "SystemScope")
    // Igual que supabaseAdmin() de apps/web: sin x-mirai-enlaces.
    return (this.system ??= createClient<Database>(this.config.supabase.url, key, { auth: AUTH, global: { headers: { "x-client-info": "mirai-api" } } }))
  }

  /** Para /readyz: PostgREST responde (HEAD a /rest/v1/, sin consultar tablas ni abrir conexiones nuevas). */
  async ping(timeoutMs = 2000): Promise<{ ok: boolean; msg?: string }> {
    try {
      const r = await fetch(`${this.config.supabase.url}/rest/v1/`, { method: "HEAD", headers: { apikey: this.config.supabase.publishableKey }, signal: AbortSignal.timeout(timeoutMs) })
      return r.status < 500 ? { ok: true } : { ok: false, msg: `PostgREST respondió ${r.status}` }
    } catch (e) {
      return { ok: false, msg: `PostgREST no responde (${(e as Error).name})` }
    }
  }
}
