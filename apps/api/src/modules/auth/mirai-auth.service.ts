// Dueño de la instancia de Better Auth en la API (V7-A). Con AUTH_PROVIDER=supabase no crea nada (ni pool ni rutas):
// la API se comporta exactamente como antes. Con `mirai`:
// - arma Better Auth (auth.config.ts) sobre la Postgres del esquema `auth`;
// - entrega los correos con las plantillas en español de @mirai/services (o los captura para la consola);
// - resuelve sesiones para el TokenVerifier (cookie httpOnly o Bearer) con los claims que espera la RLS.
import { AsyncLocalStorage } from "node:async_hooks"
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common"
import { sql } from "kysely"
import type { Logger } from "pino"
import {
  accountSuspendedMail,
  changeEmailApproveMail,
  changeEmailConfirmMail,
  emailChangedMail,
  invitationMail,
  magicLinkMail,
  resetPasswordMail,
  verifyEmailMail,
  type AuthMail,
} from "@mirai/services/mail/auth/templates"
import { SessionResolver, type ResolvedSession } from "../../core/auth/better-auth.verifier"
import { LOGGER } from "../../core/logging/logger"
import { DomainError } from "../../core/errors/domain-error"
import { createAuthKysely, type AuthKysely } from "./auth-db"
import { AuthEnv, type AuthEnvValues } from "./auth.env"
import { createMiraiAuth, MAGIC_LINK_S, RESET_S, VERIFY_EMAIL_S, type AuthDelivery, type MiraiAuth } from "./auth.config"
import { AuthMailer } from "./auth-mailer"

type Captured = { url: string; kind: AuthDelivery["kind"]; to: string }

@Injectable()
export class MiraiAuthService extends SessionResolver implements OnModuleDestroy {
  private readonly env: AuthEnvValues
  private auth?: MiraiAuth
  private kysely?: { db: AuthKysely; pool: { end(): Promise<void> } }
  private readonly capturing = new AsyncLocalStorage<Captured[]>()

  constructor(
    env: AuthEnv,
    private readonly mailer: AuthMailer,
    @Inject(LOGGER) private readonly log: Logger,
  ) {
    super()
    this.env = env.values
  }

  get enabled() {
    return this.env.enabled
  }
  get values() {
    return this.env
  }

  /** Base de `auth` (se crea al primer uso; las pruebas pueden pasar la suya con `useDb`). */
  get db(): AuthKysely {
    this.assertOn()
    this.kysely ??= createAuthKysely(this.env.dbUrl)
    return this.kysely.db
  }

  /** Pruebas: usar una base ya creada (Postgres en Docker). */
  useDb(db: AuthKysely) {
    this.kysely = { db, pool: { end: async () => undefined } }
    this.auth = undefined
  }

  get instance(): MiraiAuth {
    this.assertOn()
    this.auth ??= createMiraiAuth({ env: this.env, db: this.db, deliver: (m) => this.deliver(m), registroAbierto: () => this.registroAbierto() })
    return this.auth
  }

  private assertOn() {
    if (!this.env.enabled) throw DomainError.notFound("El inicio de sesión propio de Mirai no está encendido.")
  }

  async onModuleDestroy() {
    await this.kysely?.pool.end().catch(() => undefined)
  }

  // ── Correos ──

  /** Corre `fn` sin enviar correos: devuelve los enlaces que se habrían enviado (consola: enlace de recuperación). */
  async capture<T>(fn: () => Promise<T>): Promise<{ result: T; mails: Captured[] }> {
    const mails: Captured[] = []
    const result = await this.capturing.run(mails, fn)
    return { result, mails }
  }

  private mailOf(m: AuthDelivery): AuthMail {
    const support = this.env.supportUrl
    switch (m.kind) {
      case "verify":
        return verifyEmailMail({ url: m.url, nombre: m.nombre, expiresIn: VERIFY_EMAIL_S })
      case "magic":
        return magicLinkMail({ url: m.url, nombre: m.nombre, expiresIn: MAGIC_LINK_S })
      case "reset":
        return resetPasswordMail({ url: m.url, nombre: m.nombre, expiresIn: RESET_S })
      case "change-approve":
        return changeEmailApproveMail({ url: m.url, nombre: m.nombre, newEmail: m.newEmail, cancelUrl: `${this.env.baseURL}/perfil?correo=cancelar#cuentas` })
      case "change-confirm":
        return changeEmailConfirmMail({ url: m.url, nombre: m.nombre, newEmail: m.newEmail })
      case "changed":
        return emailChangedMail({ nombre: m.nombre, newEmail: m.newEmail, supportUrl: support })
    }
  }

  async deliver(m: AuthDelivery) {
    const box = this.capturing.getStore()
    if (box && "url" in m) {
      box.push({ url: m.url, kind: m.kind, to: m.to })
      return
    }
    await this.mailer.send(m.to, this.mailOf(m), { userId: m.userId })
  }

  /** Correos que no salen de Better Auth (consola). */
  async sendInvitation(to: string, url: string, nombre: string | null, userId: string) {
    await this.mailer.send(to, invitationMail({ url, nombre }), { userId })
  }
  async sendSuspended(to: string, nombre: string | null, userId: string) {
    await this.mailer.send(to, accountSuspendedMail({ nombre, supportUrl: this.env.supportUrl }), { userId })
  }

  // ── Reglas de la plataforma ──

  /** platform_settings.registro_abierto (si la función no existe todavía en la base: abierto, como en Supabase). */
  async registroAbierto(): Promise<boolean> {
    try {
      const r = await sql<{ v: boolean | null }>`select public.registro_abierto() as v`.execute(this.db)
      return r.rows[0]?.v !== false
    } catch (e) {
      this.log.warn({ err: (e as Error).name }, "registro_abierto() no respondió: se toma como abierto")
      return true
    }
  }

  // ── Sesiones ──

  /** Encabezados para llamar a `auth.api.*` con la sesión de la persona. */
  headersFor(o: { token?: string | null; cookie?: string | null }): Headers {
    const h = new Headers()
    if (o.cookie) h.set("cookie", o.cookie)
    else if (o.token) h.set("authorization", `Bearer ${o.token}`)
    return h
  }

  async resolve(o: { token?: string | null; cookie?: string | null }): Promise<ResolvedSession | null> {
    if (!this.enabled || (!o.token && !o.cookie)) return null
    let data: Awaited<ReturnType<MiraiAuth["api"]["getSession"]>>
    try {
      data = await this.instance.api.getSession({ headers: this.headersFor(o) })
    } catch (e) {
      this.log.warn({ err: (e as Error).name }, "No se pudo leer la sesión de Better Auth")
      throw DomainError.upstream("No pudimos validar tu sesión en este momento. Intenta de nuevo.", e)
    }
    if (!data) return null
    const u = data.user as typeof data.user & { twoFactorEnabled?: boolean | null; banned?: boolean | null; ban_expires?: Date | null; mfa_reactivar?: boolean | null }
    const s = data.session as typeof data.session & { aal?: string | null; amr?: string | null }
    const banned = !!u.banned && (!u.ban_expires || new Date(u.ban_expires).getTime() > Date.now())
    return {
      user: { id: u.id, email: u.email, name: u.name, emailVerified: u.emailVerified, twoFactorEnabled: !!u.twoFactorEnabled, banned, mfaReactivar: !!u.mfa_reactivar },
      session: { id: s.id, token: s.token, aal: s.aal ?? "aal1", amr: s.amr ?? null, createdAt: new Date(s.createdAt), expiresAt: new Date(s.expiresAt) },
    }
  }
}
