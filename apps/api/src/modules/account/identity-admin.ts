// Puerto IdentityAdmin (F2-I-2): todo lo que la API le pide al proveedor de identidad. Hoy Supabase Auth (GoTrue):
// - con el token de la persona (equivale a sb.auth.* en la web): cambiar el correo, sus identidades, desconectar
//   Google y cerrar todas sus sesiones;
// - con la clave del sistema (auth.admin.*): borrar, suspender, enlaces de recuperación e invitaciones.
// En la fase 4 se cambia por Identity Platform (Admin SDK) sin tocar los servicios.
import { Inject, Injectable } from "@nestjs/common"
import type { Logger } from "pino"
import { AppConfig } from "../../core/config/app-config"
import { systemScope } from "../../core/db/scope"
import { SupabaseJsFactory } from "../../core/db/supabase-js.factory"
import { DomainError } from "../../core/errors/domain-error"
import { LOGGER } from "../../core/logging/logger"

export type AuthErr = { message: string; code?: string; status?: number }
export type UserIdentity = { identity_id: string; id?: string; provider: string; identity_data?: Record<string, unknown> | null }
export type AdminUser = {
  id: string; email?: string | null; created_at: string; last_sign_in_at?: string | null; email_confirmed_at?: string | null; banned_until?: string | null
  app_metadata: { provider?: string; providers?: string[] }; user_metadata?: Record<string, unknown>; factors?: { status: string }[]
}

export abstract class IdentityAdmin {
  /** Pide el cambio de correo (el proveedor envía el enlace). null = salió bien. */
  abstract requestEmailChange(userToken: string, email: string, redirectTo: string): Promise<AuthErr | null>
  /** Deja pendiente el cambio sin enviar correos (correos de prueba). */
  abstract pendingEmailChange(currentEmail: string, newEmail: string): Promise<AuthErr | null>
  abstract identities(userToken: string): Promise<UserIdentity[]>
  abstract unlinkIdentity(userToken: string, identityId: string): Promise<AuthErr | null>
  /** Cierra la sesión en todos los dispositivos (scope global). */
  abstract signOutEverywhere(userToken: string): Promise<AuthErr | null>
  abstract deleteUser(userId: string): Promise<AuthErr | null>
  abstract getUser(userId: string): Promise<AdminUser | null>
  abstract setBanned(userId: string, banned: boolean): Promise<AuthErr | null>
  abstract recoveryLink(email: string, redirectTo: string): Promise<{ link?: string; error?: AuthErr }>
  abstract inviteUser(email: string, data: Record<string, unknown>, redirectTo: string): Promise<AuthErr | null>
  /** Todas las cuentas (páginas de 1.000, hasta 50.000). */
  abstract listUsers(): Promise<AdminUser[]>
}

@Injectable()
export class SupabaseIdentityAdmin extends IdentityAdmin {
  constructor(
    private readonly config: AppConfig,
    private readonly sb: SupabaseJsFactory,
    @Inject(LOGGER) private readonly log: Logger,
  ) {
    super()
  }

  private get admin() {
    return this.sb.for(systemScope("identidad: administración de cuentas")).auth.admin
  }

  /** GoTrue con el token de la persona (la API no guarda sesiones: no sirve sb.auth.updateUser). */
  private async gotrue(path: string, userToken: string, init: { method: string; body?: unknown }): Promise<{ ok: boolean; data: unknown; error: AuthErr | null }> {
    try {
      const r = await fetch(`${this.config.supabase.url}/auth/v1${path}`, {
        method: init.method,
        headers: { apikey: this.config.supabase.publishableKey, Authorization: `Bearer ${userToken}`, "Content-Type": "application/json", "x-client-info": "mirai-api" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(10_000),
      })
      const data = await r.json().catch(() => ({}))
      if (r.ok) return { ok: true, data, error: null }
      const d = data as { msg?: string; message?: string; error_description?: string; error_code?: string; code?: string }
      return { ok: false, data, error: { message: d.msg ?? d.message ?? d.error_description ?? `Auth ${r.status}`, code: d.error_code ?? d.code, status: r.status } }
    } catch (e) {
      throw DomainError.upstream("No pudimos conectarnos con el servicio de cuentas. Intenta de nuevo en un momento.", e)
    }
  }

  async requestEmailChange(userToken: string, email: string, redirectTo: string) {
    return (await this.gotrue(`/user?redirect_to=${encodeURIComponent(redirectTo)}`, userToken, { method: "PUT", body: { email } })).error
  }
  async pendingEmailChange(currentEmail: string, newEmail: string) {
    const { error } = await this.admin.generateLink({ type: "email_change_new", email: currentEmail, newEmail })
    return error ? { message: error.message, code: error.code, status: error.status } : null
  }
  async identities(userToken: string) {
    const r = await this.gotrue("/user", userToken, { method: "GET" })
    return r.ok ? (((r.data as { identities?: UserIdentity[] }).identities ?? []) as UserIdentity[]) : []
  }
  async unlinkIdentity(userToken: string, identityId: string) {
    return (await this.gotrue(`/user/identities/${encodeURIComponent(identityId)}`, userToken, { method: "DELETE" })).error
  }
  async signOutEverywhere(userToken: string) {
    return (await this.gotrue("/logout?scope=global", userToken, { method: "POST" })).error
  }
  async deleteUser(userId: string) {
    const { error } = await this.admin.deleteUser(userId)
    return error ? { message: error.message, code: error.code } : null
  }
  async getUser(userId: string) {
    const { data, error } = await this.admin.getUserById(userId)
    if (error || !data.user) return null
    return data.user as unknown as AdminUser
  }
  async setBanned(userId: string, banned: boolean) {
    const { error } = await this.admin.updateUserById(userId, { ban_duration: banned ? "876000h" : "none" })
    return error ? { message: error.message, code: error.code } : null
  }
  async recoveryLink(email: string, redirectTo: string) {
    const { data, error } = await this.admin.generateLink({ type: "recovery", email, options: { redirectTo } })
    return error ? { error: { message: error.message, code: error.code } } : { link: data.properties.action_link }
  }
  async inviteUser(email: string, data: Record<string, unknown>, redirectTo: string) {
    const { error } = await this.admin.inviteUserByEmail(email, { data, redirectTo })
    return error ? { message: error.message, code: error.code } : null
  }
  async listUsers() {
    const out: AdminUser[] = []
    for (let page = 1; page < 50; page++) {
      const { data, error } = await this.admin.listUsers({ page, perPage: 1000 })
      if (error) throw DomainError.upstream("No pudimos leer las cuentas. Intenta de nuevo.", error)
      out.push(...(data.users as unknown as AdminUser[]))
      if (data.users.length < 1000) break
    }
    this.log.debug({ cuentas: out.length }, "listUsers")
    return out
  }
}
