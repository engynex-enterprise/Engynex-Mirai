// Casos de uso de la cuenta (F2-I-2). Mismos pasos y mensajes que features/account/actions.ts y deleteAccount
// (features/data/actions.ts) de apps/web. Reglas puras en @mirai/domain/account; el proveedor de identidad detrás del
// puerto IdentityAdmin. Pasar el hogar, salir y borrar un hogar están en HouseholdsService.
import { Injectable } from "@nestjs/common"
import type { AccountData, SessionRow } from "@mirai/contracts/modules/account"
import { canRemove, checkNewEmail, isRecentAuth, type AccountState } from "@mirai/domain/account"
import { isTestEmail } from "@mirai/domain/household/invites"
import { toAccess } from "@mirai/domain/household/roles"
import { transferStatus, type TransferRow } from "@mirai/domain/household/transfer"
import { originAllowed } from "../../app.setup"
import { AppConfig } from "../../core/config/app-config"
import { RequestContextService } from "../../core/context/request-context.service"
import { systemScope } from "../../core/db/scope"
import { DomainError } from "../../core/errors/domain-error"
import { HouseholdAccess } from "../households/household-access"
import { HouseholdsRepo } from "../households/households.repository"
import { Limiter, RequestMeta } from "../households/limiter"
import { StoragePurge } from "../households/ports"
import { SiteUrl } from "../households/site-url"
import { AccountRepo } from "./account.repository"
import { IdentityAdmin } from "./identity-admin"

const SYS = systemScope("cuenta: hogares y actividad (supabaseAdmin en la web)")
const TAKEN = /already|registered|exists/i
const TAKEN_MSG = "Ese correo ya es de otra cuenta de Mirai. Usa otro o entra con esa cuenta."
type Msg = { msg: string }

@Injectable()
export class AccountService {
  constructor(
    private readonly repo: AccountRepo,
    private readonly households: HouseholdsRepo,
    private readonly identity: IdentityAdmin,
    private readonly access: HouseholdAccess,
    private readonly ctx: RequestContextService,
    private readonly limiter: Limiter,
    private readonly meta: RequestMeta,
    private readonly purge: StoragePurge,
    private readonly site: SiteUrl,
    private readonly config: AppConfig,
  ) {}

  private get scope() {
    return this.ctx.db
  }

  /** Evento de la actividad de seguridad con IP y dispositivo (informativo: si falla, sigue). */
  private async event(kind: string, detail: Record<string, unknown> = {}) {
    await this.households.accountEvent(SYS, { user_id: this.ctx.user.id, kind, detail, ...this.meta.get() }).catch(() => undefined)
  }

  private redirect() {
    const o = this.meta.origin()
    const base = o && originAllowed(o, this.config.webOrigins) ? o : this.site.base
    return `${base}/auth/callback?next=${encodeURIComponent("/perfil?correo=listo#cuentas")}`
  }

  // ── Lectura ──

  /** Todo lo de "Tu cuenta" en un viaje: formas de entrar, sesiones, actividad, hogares y solicitudes de dueño. */
  async load(activeHouseholdId?: string): Promise<AccountData> {
    const { user, raw } = await this.access.actor()
    const scope = this.scope
    const ids = raw.households.map((h) => h.id)
    const [account, sessions, events, members, transfers] = await Promise.all([
      this.repo.myAccount(scope),
      this.repo.mySessions(scope),
      this.repo.myEvents(scope, 40),
      this.repo.membersOf(SYS, ids),
      this.households.pendingTransfers(scope, user.id),
    ])
    const pend = transfers.filter((t) => transferStatus(t) === "pendiente")
    const people = [...new Set(pend.flatMap((t) => [t.from_user, t.to_user]))]
    const [ps, hs] = await Promise.all([this.households.profiles(SYS, people), this.households.householdNames(SYS, [...new Set(pend.map((t) => t.household_id))])])
    const name = (id: string) => {
      const p = ps.find((x) => x.id === id)
      return p?.apodo || p?.nombre || p?.email || "Alguien"
    }
    const view = (t: TransferRow) => ({
      id: t.id, householdId: t.household_id, hogar: hs.find((h) => h.id === t.household_id)?.nombre ?? "Hogar", de: name(t.from_user), para: name(t.to_user),
      fromRole: toAccess(t.from_role), planAction: t.plan_action === "cancelar" ? ("cancelar" as const) : ("seguir" as const), expiresAt: t.expires_at, createdAt: t.created_at,
    })
    const active = activeHouseholdId ?? raw.books.find((b) => b.id === raw.profile?.last_book_id)?.household_id ?? raw.households[0]?.id
    return {
      account: account ?? { email: user.email, new_email: null, email_change_sent_at: null, email_change_confirm_status: 0, has_password: false, created_at: null, last_sign_in_at: null, identities: [] },
      sessions,
      events: events.map((e) => ({ ...e, detail: (e.detail ?? null) as Record<string, unknown> | null })),
      households: raw.households.map((h) => ({
        id: h.id, nombre: h.nombre, access: toAccess(h.access_role, h.role), active: h.id === active,
        personas: members.filter((m) => m.household_id === h.id).length,
        firstBook: raw.books.find((b) => b.household_id === h.id)?.id ?? null,
        outgoing: pend.filter((t) => t.household_id === h.id && t.from_user === user.id).map(view)[0] ?? null,
      })),
      incoming: pend.filter((t) => t.to_user === user.id).map(view),
    }
  }

  sessions(): Promise<SessionRow[]> {
    return this.repo.mySessions(this.scope)
  }

  // ── Correo de la cuenta ──

  /**
   * Pide cambiar el correo. El proveedor envía el enlace al correo nuevo. Con un correo de prueba (.test, example.com)
   * no se envía nada: el cambio queda pendiente con la API de administración.
   */
  async requestEmailChange(email: string): Promise<Msg & { prueba: boolean }> {
    const user = this.ctx.user
    const acc = await this.repo.myAccount(this.scope)
    const current = acc?.email ?? user.email ?? ""
    const v = checkNewEmail(current, String(email ?? ""))
    if (!v.ok) throw DomainError.validation(v.msg)
    if (isTestEmail(v.email)) {
      const err = await this.identity.pendingEmailChange(current, v.email)
      if (err) throw TAKEN.test(err.message) ? DomainError.conflict(TAKEN_MSG, { reason: "correo_en_uso" }) : DomainError.upstream("No pudimos pedir el cambio. Intenta de nuevo.")
      await this.event("correo_solicitado", { correo: v.email, prueba: true })
      return { prueba: true, msg: `Correo de prueba: no se envió de verdad. El cambio a ${v.email} quedó pendiente de confirmar.` }
    }
    // Los correos de prueba no cuentan para el límite.
    await this.limiter.hit("cuentaCorreo", user.id, "Pediste cambiar el correo muchas veces seguidas")
    const err = await this.identity.requestEmailChange(user.token, v.email, this.redirect())
    if (err) {
      if (TAKEN.test(err.message) || err.code === "email_exists") throw DomainError.conflict(TAKEN_MSG, { reason: "correo_en_uso" })
      if (/rate|seconds|security purposes/i.test(err.message)) throw DomainError.rateLimited("Acabamos de enviarte un correo. Espera un minuto y vuelve a intentar.", 60)
      throw DomainError.upstream("No pudimos enviar el correo de confirmación. Intenta de nuevo en un rato.")
    }
    await this.event("correo_solicitado", { correo: v.email })
    return { prueba: false, msg: `Te enviamos un enlace a ${v.email}. Ábrelo para confirmar el cambio.` }
  }

  /** Reenvía el enlace del cambio pendiente (el proveedor espera al menos un minuto entre envíos). */
  async resendEmailChange(): Promise<Msg & { prueba: boolean }> {
    const user = this.ctx.user
    const acc = await this.repo.myAccount(this.scope)
    if (!acc?.new_email) throw DomainError.notFound("No tienes un cambio de correo pendiente.")
    await this.limiter.hit("cuentaCorreo", user.id, "Reenviaste el correo muchas veces seguidas")
    if (isTestEmail(acc.new_email)) return { prueba: true, msg: "Correo de prueba: no se envió de verdad." }
    const err = await this.identity.requestEmailChange(user.token, acc.new_email, this.redirect())
    if (err) {
      if (/rate|seconds|security purposes/i.test(err.message)) throw DomainError.rateLimited("Acabamos de enviarte un correo. Espera un minuto y vuelve a intentar.", 60)
      throw DomainError.upstream("No pudimos reenviar el correo. Intenta de nuevo en un rato.")
    }
    return { prueba: false, msg: `Te reenviamos el enlace a ${acc.new_email}.` }
  }

  async cancelEmailChange(): Promise<Msg> {
    const done = await this.repo.rpc(this.scope, "cancel_my_email_change")
    if (!done) throw DomainError.notFound("No tenías un cambio de correo pendiente.")
    return { msg: "Cancelamos el cambio de correo. Los enlaces que te llegaron ya no sirven." }
  }

  // ── Formas de entrar ──

  /** Quita una forma de entrar. Nunca la última, y solo si entraste hace poco (si no, pide volver a entrar). */
  async removeMethod(m: { kind: "password" } | { kind: "google"; identityId: string }): Promise<Msg> {
    const user = this.ctx.user
    await this.limiter.hit("cuentaMetodo", user.id)
    const acc: AccountState | null = await this.repo.myAccount(this.scope)
    if (!acc) throw DomainError.unauthenticated("Tu sesión venció. Vuelve a entrar.")
    const r = canRemove(acc, m)
    if (!r.ok) throw DomainError.conflict(r.msg, { reason: "ultima" })
    if (!isRecentAuth(user.claims.amr)) throw DomainError.conflict("Por seguridad, vuelve a entrar a Mirai y luego quita esta forma de entrar.", { reason: "reauth" })

    if (m.kind === "password") {
      await this.repo.rpc(this.scope, "remove_my_password")
      return { msg: "Quitamos tu contraseña. Ahora entras con Google." }
    }
    // El proveedor pide al menos 2 identidades para desconectar una: quien entró con Google y creó contraseña aún no
    // tiene la identidad "correo"; se crea (ensure_email_identity) y luego se desconecta Google.
    let list = await this.identity.identities(user.token)
    const target = list.find((i) => i.identity_id === m.identityId && i.provider === "google")
    if (!target) throw DomainError.notFound("Esa cuenta de Google ya no está conectada.")
    if (list.length < 2) {
      await this.repo.rpc(this.scope, "ensure_email_identity")
      list = await this.identity.identities(user.token)
    }
    const fresh = list.find((i) => i.identity_id === target.identity_id) ?? target
    const err = await this.identity.unlinkIdentity(user.token, fresh.identity_id)
    if (err) throw /single|at least|identities/i.test(err.message) ? DomainError.conflict("Es tu única forma de entrar. Agrega otra antes de quitarla.", { reason: "ultima" }) : DomainError.upstream("No pudimos quitar la cuenta de Google. Intenta de nuevo.")
    const email = (target.identity_data?.email as string | undefined) ?? null
    return { msg: email ? `Quitamos la cuenta de Google ${email}. Ya no podrás entrar con ella.` : "Quitamos la cuenta de Google." }
  }

  // ── Sesiones ──

  async revokeSession(id: string): Promise<Msg> {
    await this.limiter.hit("cuentaMetodo", this.ctx.user.id)
    const done = await this.repo.rpc(this.scope, "revoke_my_session", { p_session: id })
    if (!done) throw DomainError.notFound("Esa sesión ya estaba cerrada.")
    return { msg: "Cerramos esa sesión. En unos minutos ese dispositivo tendrá que volver a entrar." }
  }

  /** Cierra la sesión en todos los dispositivos, incluido este. */
  async signOutEverywhere(): Promise<Msg> {
    const user = this.ctx.user
    await this.limiter.hit("cuentaMetodo", user.id)
    await this.event("sesiones_cerradas")
    if (await this.identity.signOutEverywhere(user.token)) throw DomainError.upstream("No pudimos cerrar las sesiones. Intenta de nuevo.")
    this.access.invalidate()
    return { msg: "Cerramos tu sesión en todos los dispositivos." }
  }

  // ── Borrar la cuenta (Ley 1581, supresión) ──

  /**
   * Elimina la cuenta y los hogares en los que es la única persona. Si es dueño de un hogar con más personas, primero
   * debe pasárselo a alguien o borrarlo: así nadie se queda con un hogar sin dueño.
   */
  async remove(confirm: string): Promise<Msg> {
    const { user, raw } = await this.access.actor()
    if (String(confirm ?? "").trim().toLowerCase() !== user.email.toLowerCase()) throw DomainError.validation("Escribe tu correo exactamente para confirmar")
    const mine = await this.repo.myMemberships(SYS, user.id)
    const all = await this.repo.membersOf(SYS, mine.map((m) => m.household_id))
    const others = (h: string) => all.filter((m) => m.household_id === h && m.user_id !== user.id)
    const bloquean = mine.filter((m) => (m.access_role ?? m.role) === "owner" && others(m.household_id).length > 0).map((m) => raw.households.find((h) => h.id === m.household_id)?.nombre ?? "Hogar")
    if (bloquean.length)
      throw DomainError.conflict(`Eres el dueño de ${bloquean.map((n) => `“${n}”`).join(", ")} y hay más personas. Pásale el hogar a alguien o bórralo en Ajustes › Tu cuenta antes de eliminar tu cuenta.`, { reason: "dueno", hogares: bloquean })
    for (const m of mine) {
      if (others(m.household_id).length) continue
      await this.purge.household(m.household_id)
      await this.repo.deleteHousehold(SYS, m.household_id)
    }
    await this.purge.user(user.id).catch(() => 0)
    if (await this.identity.deleteUser(user.id)) throw DomainError.upstream("No pudimos eliminar tu cuenta. Intenta de nuevo o escríbenos.")
    this.access.invalidate()
    return { msg: "Eliminamos tu cuenta." }
  }
}
