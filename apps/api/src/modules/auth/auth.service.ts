// Casos de uso de auth que Better Auth no trae (contrato `auth`, §3.1.4): configuración pública, consentimientos (Ley
// 1581), crear contraseña, estado del segundo factor y sesiones desde la consola.
import { Injectable } from "@nestjs/common"
import { sql } from "kysely"
import type { AdminSession, AuthConfig, Consents, MfaStatus } from "@mirai/contracts/modules/auth"
import { PASSWORD_MIN } from "@mirai/contracts/modules/auth"
import { RequestContextService } from "../../core/context/request-context.service"
import { DomainError } from "../../core/errors/domain-error"
import { authDb, comoServicio } from "./auth-db"
import { MiraiAuthService } from "./mirai-auth.service"

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)

@Injectable()
export class AuthService {
  constructor(
    private readonly auth: MiraiAuthService,
    private readonly ctx: RequestContextService,
  ) {}

  async config(): Promise<AuthConfig> {
    const v = this.auth.values
    if (!this.auth.enabled) return { provider: "supabase", registroAbierto: true, google: true, captcha: false, passwordMin: PASSWORD_MIN }
    return { provider: "mirai", registroAbierto: await this.auth.registroAbierto(), google: !!v.google, captcha: !!v.turnstileSecret, passwordMin: PASSWORD_MIN }
  }

  // ── Consentimientos (public.consents, como handle_new_user) ──

  async consents(): Promise<Consents> {
    const uid = this.ctx.user.id
    const r = await comoServicio(this.auth.db, (tx) => sql<{ document: string; version: string; accepted_at: Date }>`
      select document, version, accepted_at from public.consents where user_id = ${uid} order by accepted_at desc limit 50`.execute(tx))
    const items = r.rows.map((x) => ({ document: x.document, version: x.version, accepted_at: new Date(x.accepted_at).toISOString() }))
    const version = items.filter((i) => i.document === "terminos").map((i) => i.version).sort().at(-1) ?? ""
    return { version, items }
  }

  async acceptConsent(version: string): Promise<{ msg: string }> {
    const uid = this.ctx.user.id
    await this.auth.db.transaction().execute(async (tx) => {
      // Compatibilidad: la versión aceptada también queda en los metadatos (los lee la consola y la vuelta atrás).
      // Primero auth.users (con el rol de la conexión, dueño de `auth`); luego public.consents como service_role.
      await sql`update auth.users set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('acepta_version', ${version}::text, 'acepta_at', now()::text) where id = ${uid}`.execute(tx)
      await sql`set local role service_role`.execute(tx)
      await sql`insert into public.consents (user_id, document, version) values (${uid}, 'terminos', ${version}), (${uid}, 'privacidad', ${version})`.execute(tx)
    })
    return { msg: "Gracias. Aceptaste la nueva versión." }
  }

  // ── Contraseña para quien entró solo con Google ──

  async setPassword(newPassword: string): Promise<{ msg: string }> {
    const u = this.ctx.user
    try {
      await this.auth.instance.api.setPassword({ body: { newPassword }, headers: this.auth.headersFor({ token: u.token }) })
    } catch (e) {
      const code = (e as { body?: { code?: string } }).body?.code
      if (code === "PASSWORD_ALREADY_SET" || code === "USER_ALREADY_HAS_PASSWORD") throw DomainError.conflict("Ya tienes una contraseña. Cámbiala en vez de crear otra.", { reason: "ya_tiene" })
      if (code === "PASSWORD_TOO_SHORT") throw DomainError.validation("La contraseña es muy corta: usa al menos 10 caracteres")
      throw DomainError.upstream("No pudimos guardar la contraseña. Intenta de nuevo.", e)
    }
    return { msg: "Contraseña creada: ya puedes entrar con tu correo y esta contraseña." }
  }

  async mfa(): Promise<MfaStatus> {
    const u = this.ctx.user
    const row = await authDb(this.auth.db).selectFrom("users").select(["two_factor_enabled", "mfa_reactivar"]).where("id", "=", u.id).executeTakeFirst()
    const tf = await authDb(this.auth.db).selectFrom("two_factors").select(["backup_codes"]).where("user_id", "=", u.id).executeTakeFirst()
    return { enabled: !!row?.two_factor_enabled, reactivar: !!row?.mfa_reactivar && !row?.two_factor_enabled, backupCodes: !!tf?.backup_codes, aal: u.aal === "aal2" ? "aal2" : "aal1" }
  }

  // ── Consola ──

  async adminSessions(userId: string): Promise<AdminSession[]> {
    const rows = await authDb(this.auth.db)
      .selectFrom("sessions")
      .select(["id", "created_at", "updated_at", "user_agent", "ip_address", "aal", "expires_at"])
      .where("user_id", "=", userId)
      .where("expires_at", ">", new Date())
      .orderBy("updated_at", "desc")
      .limit(50)
      .execute()
    return rows.map((s) => ({ id: s.id, created_at: iso(s.created_at)!, last_active: iso(s.updated_at), user_agent: s.user_agent, ip: s.ip_address, aal: s.aal, expires_at: iso(s.expires_at)! }))
  }

  async adminRevokeSessions(userId: string): Promise<{ msg: string; cerradas: number }> {
    const r = await authDb(this.auth.db).deleteFrom("sessions").where("user_id", "=", userId).executeTakeFirst()
    const n = Number(r.numDeletedRows ?? 0)
    return { msg: n ? `Cerramos ${n} sesión${n === 1 ? "" : "es"}. En unos minutos esa persona tendrá que volver a entrar.` : "No tenía sesiones abiertas.", cerradas: n }
  }
}
