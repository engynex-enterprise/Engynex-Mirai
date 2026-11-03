// IdentityAdmin sobre Better Auth (V7-A; reemplaza a SupabaseIdentityAdmin con AUTH_PROVIDER=mirai). Mismos métodos
// y mismos errores que esperan AccountService y la consola (mensajes "already registered", "single identity"…), así
// los casos de uso no cambian.
import { randomUUID } from "node:crypto"
import { Inject, Injectable } from "@nestjs/common"
import type { Logger } from "pino"
import { LOGGER } from "../../core/logging/logger"
import { DomainError } from "../../core/errors/domain-error"
import { IdentityAdmin, type AdminUser, type AuthErr, type UserIdentity } from "../account/identity-admin"
import { authDb } from "./auth-db"
import { getPending } from "./auth.config"
import { MiraiAuthService } from "./mirai-auth.service"

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)
const FOREVER = "9999-12-31T23:59:59.000Z"
const errOf = (e: unknown): AuthErr => {
  const x = e as { body?: { code?: string; message?: string }; status?: number | string; statusCode?: number; message?: string }
  return { message: x.body?.message ?? x.message ?? "error", code: x.body?.code, status: x.statusCode }
}

@Injectable()
export class BetterAuthIdentityAdmin extends IdentityAdmin {
  constructor(
    private readonly auth: MiraiAuthService,
    @Inject(LOGGER) private readonly log: Logger,
  ) {
    super()
  }

  private get t() {
    return authDb(this.auth.db)
  }
  private h(token: string) {
    return this.auth.headersFor({ token })
  }

  async requestEmailChange(userToken: string, email: string, redirectTo: string): Promise<AuthErr | null> {
    // Mirai avisa si el correo ya es de otra cuenta (igual que hoy con Supabase); Better Auth solo respondería "ok".
    const taken = await this.t.selectFrom("users").select("id").where("email", "=", email.toLowerCase()).executeTakeFirst()
    if (taken) return { message: "A user with this email address has already been registered", code: "email_exists" }
    try {
      await this.auth.instance.api.changeEmail({ body: { newEmail: email, callbackURL: redirectTo }, headers: this.h(userToken) })
      return null
    } catch (e) {
      return errOf(e)
    }
  }

  async pendingEmailChange(currentEmail: string, newEmail: string): Promise<AuthErr | null> {
    const u = await this.t.selectFrom("users").select("id").where("email", "=", currentEmail.toLowerCase()).executeTakeFirst()
    if (!u) return { message: "User not found", code: "user_not_found" }
    const taken = await this.t.selectFrom("users").select("id").where("email", "=", newEmail.toLowerCase()).executeTakeFirst()
    if (taken) return { message: "A user with this email address has already been registered", code: "email_exists" }
    await this.t.deleteFrom("verifications").where("identifier", "=", `mirai-email-change:${u.id}`).execute()
    await this.t
      .insertInto("verifications")
      .values({ id: randomUUID(), identifier: `mirai-email-change:${u.id}`, value: JSON.stringify({ newEmail: newEmail.toLowerCase(), step: 0, sentAt: new Date().toISOString() }), expires_at: new Date(Date.now() + 86_400_000) })
      .execute()
    return null
  }

  async identities(userToken: string): Promise<UserIdentity[]> {
    const s = await this.auth.resolve({ token: userToken })
    if (!s) return []
    const rows = await this.t.selectFrom("accounts").select(["id", "provider_id", "account_id", "email"]).where("user_id", "=", s.user.id).execute()
    return rows.map((a) => ({
      identity_id: a.id,
      id: a.account_id,
      provider: a.provider_id === "credential" ? "email" : a.provider_id,
      identity_data: { email: a.provider_id === "credential" ? s.user.email : a.email },
    }))
  }

  async unlinkIdentity(userToken: string, identityId: string): Promise<AuthErr | null> {
    const s = await this.auth.resolve({ token: userToken })
    if (!s) return { message: "Session expired", code: "session_expired" }
    const a = await this.t.selectFrom("accounts").select(["id"]).where("id", "=", identityId).where("user_id", "=", s.user.id).executeTakeFirst()
    if (!a) return { message: "Account not found", code: "account_not_found" }
    try {
      await this.auth.instance.api.unlinkAccount({ body: { accountId: a.id }, headers: this.h(userToken) })
      return null
    } catch (e) {
      const err = errOf(e)
      return err.code === "FAILED_TO_UNLINK_LAST_ACCOUNT" ? { ...err, message: "User must have at least 1 identity after unlinking" } : err
    }
  }

  async signOutEverywhere(userToken: string): Promise<AuthErr | null> {
    try {
      await this.auth.instance.api.revokeSessions({ headers: this.h(userToken) })
      return null
    } catch (e) {
      return errOf(e)
    }
  }

  async deleteUser(userId: string): Promise<AuthErr | null> {
    try {
      // auth.sessions/accounts/two_factors caen en cascada; `public` también (las FK a auth.users son on delete cascade).
      await this.t.deleteFrom("users").where("id", "=", userId).execute()
      return null
    } catch (e) {
      this.log.error({ err: (e as Error).message }, "No se pudo borrar la cuenta")
      return { message: (e as Error).message }
    }
  }

  async getUser(userId: string): Promise<AdminUser | null> {
    const u = await this.t.selectFrom("users").selectAll().where("id", "=", userId).executeTakeFirst()
    if (!u) return null
    const providers = (await this.t.selectFrom("accounts").select("provider_id").where("user_id", "=", userId).execute()).map((a) => (a.provider_id === "credential" ? "email" : a.provider_id))
    return this.toAdmin(u, providers)
  }

  private toAdmin(u: { id: string; email: string | null; created_at: Date | string; last_sign_in_at: Date | string | null; email_confirmed_at: Date | string | null; email_verified: boolean; banned: boolean; ban_expires: Date | string | null; raw_user_meta_data: Record<string, unknown>; two_factor_enabled: boolean }, providers: string[]): AdminUser {
    const bannedUntil = u.banned ? (iso(u.ban_expires) ?? FOREVER) : null
    return {
      id: u.id,
      email: u.email,
      created_at: iso(u.created_at)!,
      last_sign_in_at: iso(u.last_sign_in_at),
      email_confirmed_at: iso(u.email_confirmed_at) ?? (u.email_verified ? iso(u.created_at) : null),
      banned_until: bannedUntil,
      app_metadata: { provider: providers[0] ?? "email", providers },
      user_metadata: u.raw_user_meta_data ?? {},
      factors: u.two_factor_enabled ? [{ status: "verified" }] : [],
    }
  }

  async setBanned(userId: string, banned: boolean): Promise<AuthErr | null> {
    const u = await this.t.updateTable("users").set({ banned, ban_expires: null, ban_reason: banned ? "consola" : null }).where("id", "=", userId).returning(["email", "name"]).executeTakeFirst()
    if (!u) return { message: "User not found", code: "user_not_found" }
    if (banned) {
      await this.t.deleteFrom("sessions").where("user_id", "=", userId).execute()
      if (u.email) await this.auth.sendSuspended(u.email, u.name || null, userId).catch(() => undefined)
    }
    return null
  }

  async recoveryLink(email: string, redirectTo: string): Promise<{ link?: string; error?: AuthErr }> {
    const u = await this.t.selectFrom("users").select("id").where("email", "=", email.toLowerCase()).executeTakeFirst()
    if (!u) return { error: { message: "User not found", code: "user_not_found" } }
    const { mails } = await this.auth.capture(() => this.auth.instance.api.requestPasswordReset({ body: { email, redirectTo } }))
    const link = mails.find((m) => m.kind === "reset")?.url
    return link ? { link } : { error: { message: "No se pudo crear el enlace" } }
  }

  async inviteUser(email: string, data: Record<string, unknown>, redirectTo: string): Promise<AuthErr | null> {
    const e = email.trim().toLowerCase()
    const taken = await this.t.selectFrom("users").select("id").where("email", "=", e).executeTakeFirst()
    if (taken) return { message: "A user with this email address has already been registered", code: "email_exists" }
    const id = randomUUID()
    const nombre = typeof data.nombre === "string" ? data.nombre : ""
    // La cuenta queda creada sin contraseña (handle_new_user arma su perfil); el enlace mágico la confirma al entrar.
    await this.t.insertInto("users").values({ id, email: e, name: nombre, raw_user_meta_data: { ...data, invitado: true } }).execute()
    try {
      const { mails } = await this.auth.capture(() => this.auth.instance.api.signInMagicLink({ body: { email: e, callbackURL: redirectTo }, headers: new Headers() }))
      const url = mails.find((m) => m.kind === "magic")?.url
      if (!url) throw DomainError.upstream("No pudimos crear el enlace de la invitación.")
      await this.auth.sendInvitation(e, url, nombre || null, id)
      return null
    } catch (err) {
      return errOf(err)
    }
  }

  async listUsers(): Promise<AdminUser[]> {
    const users = await this.t.selectFrom("users").selectAll().orderBy("created_at", "desc").limit(50_000).execute()
    const accs = await this.t.selectFrom("accounts").select(["user_id", "provider_id"]).execute()
    const by = new Map<string, string[]>()
    for (const a of accs) by.set(a.user_id, [...(by.get(a.user_id) ?? []), a.provider_id === "credential" ? "email" : a.provider_id])
    return users.map((u) => this.toAdmin(u, by.get(u.id) ?? []))
  }

  /** Cambio de correo pendiente (lo usa el repositorio de la cuenta). */
  pending(userId: string) {
    return getPending(this.auth.db, userId)
  }
}
