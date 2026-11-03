// Casos de uso de Google (F2-E-3). Igual que apps/web/app/api/google/{connect,callback} y features/correo/actions.ts,
// pero sin cookie: el `state` va firmado (oauth-state.ts) y el callback es de la API (<API_PUBLIC_URL>/v1/google/callback,
// URI nueva que hay que registrar en Google Cloud › Credenciales).
import { Inject, Injectable } from "@nestjs/common"
import type { Logger } from "pino"
import { can } from "@mirai/domain/plans"
import { calSyncMsg } from "@mirai/services/google/calendar"
import { G_SCOPES } from "@mirai/services/google/oauth"
import { safeNext } from "@mirai/services/security/safe-next"
import { RequestContextService } from "../../core/context/request-context.service"
import { DomainError } from "../../core/errors/domain-error"
import { LOGGER } from "../../core/logging/logger"
import { service } from "../integrations/service-errors"
import { ServicesEnv } from "../integrations/services-env"
import { GooglePort } from "./google.port"
import { signState, verifyState } from "./oauth-state"

const NOT_CONFIGURED = "Google no está configurado en este despliegue (faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_OAUTH_STATE_KEY)."

@Injectable()
export class GoogleService {
  constructor(
    private readonly port: GooglePort,
    private readonly ctx: RequestContextService,
    private readonly env: ServicesEnv,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  get redirectUri() {
    return `${this.env.values.apiPublicUrl}/v1/google/callback`
  }
  private get site() {
    return this.env.values.siteUrl
  }

  /** URL de consentimiento. El plan (banco) ya lo revisó BookGuard. */
  async connectUrl(s: "gmail" | "calendar", backRaw?: string): Promise<{ url: string }> {
    const key = this.env.values.googleStateKey
    if (!this.port.configured() || !key) throw DomainError.upstream(NOT_CONFIGURED)
    const back = safeNext(backRaw, "/correo")
    // La conexión es de la cuenta de cada persona; el administrador solo decide si el servicio está disponible.
    if (!(await service(() => this.port.available(this.ctx.book.household.id, s)))) return { url: `${this.site}${back}${back.includes("?") ? "&" : "?"}google=no-disponible` }
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    u.search = new URLSearchParams({
      client_id: this.port.clientId(), redirect_uri: this.redirectUri, response_type: "code", access_type: "offline", prompt: "consent",
      include_granted_scopes: "true", scope: `openid email ${G_SCOPES[s]}`, state: signState(key, { u: this.ctx.user.id, s, b: back }),
    }).toString()
    return { url: u.toString() }
  }

  /** Callback público: devuelve a dónde redirigir (siempre a la web, con ?google=ok|cancelado|error). */
  async callback(q: { code?: string; state?: string; error?: string }): Promise<string> {
    const key = this.env.values.googleStateKey
    const st = key ? verifyState(key, q.state) : null
    const back = safeNext(st?.b, "/correo")
    const to = (r: string) => `${this.site}${back}${back.includes("?") ? "&" : "?"}google=${r}`
    if (q.error) return to("cancelado")
    if (!st || !q.code) return to("error")
    try {
      await this.port.connect(st.u, q.code, this.redirectUri)
      return to("ok")
    } catch (e) {
      this.log.warn({ error: e, userId: st.u }, "google: no se pudo guardar la conexión")
      return to("error")
    }
  }

  async disconnect() {
    await service(() => this.port.disconnect(this.ctx.user.id))
    return {}
  }

  async calendarSync() {
    const b = this.ctx.book
    const r = await service(() => this.port.syncCalendar({ userId: this.ctx.user.id, bookId: b.book.id, householdId: b.household.id }), "UPSTREAM")
    return { msg: calSyncMsg(r), ...r }
  }

  async calendarStatus() {
    const b = this.ctx.book
    const s = await service(() => this.port.calendarStatus(this.ctx.user.id, b.book.id))
    return { conectado: s.conectado, plan: can(b.plan, "banco"), eventos: s.eventos }
  }
}
