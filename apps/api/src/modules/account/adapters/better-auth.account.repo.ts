// AccountRepo con AUTH_PROVIDER=mirai (V7-A, §3.1.6): lo que antes hacían las funciones SQL sobre el esquema `auth` de
// Supabase (my_account, my_sessions, revoke_my_session, cancel_my_email_change, remove_my_password,
// ensure_email_identity) ahora se lee de las tablas de Better Auth. Lo de `public` (hogares, actividad) sigue igual.
import { Injectable } from "@nestjs/common"
import { sql } from "kysely"
import type { SessionRow } from "@mirai/contracts/modules/account"
import type { AccountState } from "@mirai/domain/account"
import type { UserScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { authDb } from "../../auth/auth-db"
import { clearPending, getPending } from "../../auth/auth.config"
import { MiraiAuthService } from "../../auth/mirai-auth.service"
import type { AccountRpc } from "../account.repository"
import { SupabaseJsAccountRepo } from "./supabase-js.account.repo"

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)

@Injectable()
export class BetterAuthAccountRepo extends SupabaseJsAccountRepo {
  constructor(
    sb: SupabaseJsFactory,
    private readonly auth: MiraiAuthService,
  ) {
    super(sb)
  }

  private get t() {
    return authDb(this.auth.db)
  }

  private async event(userId: string, kind: string, detail: Record<string, unknown> = {}) {
    await sql`select public.log_account_event(${userId}::uuid, ${kind}, ${JSON.stringify(detail)}::jsonb)`.execute(this.auth.db).catch(() => undefined)
  }

  override async myAccount(scope: UserScope): Promise<AccountState | null> {
    const u = await this.t.selectFrom("users").select(["id", "email", "created_at", "last_sign_in_at"]).where("id", "=", scope.userId).executeTakeFirst()
    if (!u) return null
    const accs = await this.t.selectFrom("accounts").select(["id", "provider_id", "password", "email", "created_at", "updated_at"]).where("user_id", "=", u.id).orderBy("created_at").execute()
    const p = await getPending(this.auth.db, u.id)
    return {
      email: u.email,
      new_email: p?.newEmail ?? null,
      email_change_sent_at: p?.sentAt ?? null,
      email_change_confirm_status: p?.step ?? 0,
      has_password: accs.some((a) => a.provider_id === "credential" && !!a.password),
      created_at: iso(u.created_at),
      last_sign_in_at: iso(u.last_sign_in_at),
      identities: accs.map((a) => ({
        id: a.id,
        provider: a.provider_id === "credential" ? "email" : a.provider_id,
        email: a.provider_id === "credential" ? u.email : a.email,
        last_sign_in_at: iso(a.updated_at),
        created_at: iso(a.created_at),
      })),
    }
  }

  override async mySessions(scope: UserScope): Promise<SessionRow[]> {
    const current = String(scope.claims.session_id ?? "")
    const rows = await this.t
      .selectFrom("sessions")
      .select(["id", "created_at", "updated_at", "user_agent", "ip_address", "aal"])
      .where("user_id", "=", scope.userId)
      .where("expires_at", ">", new Date())
      .orderBy("updated_at", "desc")
      .limit(30)
      .execute()
    return rows.map((s) => ({ id: s.id, created_at: iso(s.created_at)!, last_active: iso(s.updated_at), user_agent: s.user_agent, ip: s.ip_address, aal: s.aal, actual: s.id === current }))
  }

  // El tipo `never` viene del cliente supabase-js de la clase base (el servicio solo lee booleanos).
  override async rpc(scope: UserScope, fn: AccountRpc, args: Record<string, unknown> = {}): Promise<never> {
    return (await this.rpcValue(scope, fn, args)) as never
  }

  private async rpcValue(scope: UserScope, fn: AccountRpc, args: Record<string, unknown>): Promise<boolean> {
    const uid = scope.userId
    switch (fn) {
      case "ensure_email_identity":
        return true // con Better Auth la fila `credential` existe si hay contraseña: no hace falta
      case "remove_my_password": {
        // canRemove() ya revisó que quede otra forma de entrar.
        const r = await this.t.deleteFrom("accounts").where("user_id", "=", uid).where("provider_id", "=", "credential").executeTakeFirst()
        if (Number(r.numDeletedRows ?? 0)) await this.event(uid, "contrasena", { accion: "quitada" })
        return true
      }
      case "cancel_my_email_change": {
        const p = await getPending(this.auth.db, uid)
        const done = await clearPending(this.auth.db, uid)
        if (done) await this.event(uid, "correo_cancelado", { correo: p?.newEmail ?? null })
        return done
      }
      case "revoke_my_session": {
        const id = String(args.p_session ?? "")
        if (id === String(scope.claims.session_id ?? "")) return false // la actual se cierra con "Cerrar sesión"
        const r = await this.t.deleteFrom("sessions").where("id", "=", id).where("user_id", "=", uid).executeTakeFirst()
        const done = Number(r.numDeletedRows ?? 0) > 0
        if (done) await this.event(uid, "sesion_cerrada", {})
        return done
      }
    }
  }
}
