// Casos de uso del hogar (F2-I-1). Mismos pasos, reglas y mensajes que apps/web: features/household/actions.ts,
// la parte de titularidad, salir y borrar de features/account/actions.ts y la bienvenida (con referidos).
// Las reglas puras (roles, invitaciones, titularidad, referidos) vienen de @mirai/domain; la base vuelve a revisar
// (RLS y RPC con sus RAISE en español).
import { createHash, randomBytes } from "node:crypto"
import { Inject, Injectable, Optional } from "@nestjs/common"
import type { Logger } from "pino"
import type { FamilyPatch, HouseholdPeople, InvitationInfo, Person, Share } from "@mirai/contracts/modules/households"
import { afterSend, checkDuplicate, inviteEstado, inviteText, isTestEmail, normalizeDest, resendGate, sameName, waMeLink, type LastResult } from "@mirai/domain/household/invites"
import { ACCESS_ROLES, assignableRoles, can, deniedMsg, ROLE_INFO, ROLE_RANK, toAccess, type AccessRole } from "@mirai/domain/household/roles"
import { canReceive, nameMatches, TRANSFER_DAYS } from "@mirai/domain/household/transfer"
import { formatCoPhone } from "@mirai/domain/phone"
import { limitOf, toPlanInfo } from "@mirai/domain/plans"
import { cortesiaHasta, MAX_RECOMPENSAS, normCodigo, referidosCfg } from "@mirai/domain/referidos"
import { RequestContextService } from "../../core/context/request-context.service"
import { CryptoService } from "../../core/crypto/crypto.service"
import { systemScope } from "../../core/db/scope"
import { DomainError } from "../../core/errors/domain-error"
import { LOGGER } from "../../core/logging/logger"
import { BetterAuthIdentityAdmin } from "../auth/better-auth.identity-admin"
import { MiraiAuthService } from "../auth/mirai-auth.service"
import { BillingService } from "../billing/billing.service"
import { HouseholdAccess, type HouseholdCtx } from "./household-access"
import { HouseholdsRepo, type FamilyRow, type InvRow } from "./households.repository"
import { Limiter, RequestMeta } from "./limiter"
import { HouseholdMessenger, StoragePurge, type InviteMsg } from "./ports"
import { SiteUrl } from "./site-url"

const SYS = systemScope("hogar: personas e invitaciones (supabaseAdmin en la web)")
const hash = (t: string) => createHash("sha256").update(t).digest("hex")
const DAYS = 7
type Msg = { msg: string }

/** Igual que el `code` de la web: el front sabe qué ventana mostrar. */
const conflict = (reason: string, msg: string, extra: Record<string, unknown> = {}) => DomainError.conflict(msg, { reason, ...extra })

@Injectable()
export class HouseholdsService {
  constructor(
    private readonly repo: HouseholdsRepo,
    private readonly access: HouseholdAccess,
    private readonly ctx: RequestContextService,
    private readonly crypto: CryptoService,
    private readonly limiter: Limiter,
    private readonly messenger: HouseholdMessenger,
    private readonly purge: StoragePurge,
    private readonly billing: BillingService,
    private readonly site: SiteUrl,
    private readonly meta: RequestMeta,
    @Inject(LOGGER) private readonly log: Logger,
    // V7: con AUTH_PROVIDER=mirai los datos del registro (user_metadata) no viajan en los claims: se leen de auth.users.
    @Optional() private readonly miraiAuth?: MiraiAuthService,
    @Optional() private readonly identity?: BetterAuthIdentityAdmin,
  ) {}

  /** Código de referido guardado al registrarse (auth.users.raw_user_meta_data.ref) con el auth propio. */
  private async registeredRef(userId: string): Promise<string | undefined> {
    if (!this.miraiAuth?.enabled || !this.identity) return undefined
    const ref = (await this.identity.getUser(userId))?.user_metadata?.ref
    return typeof ref === "string" ? ref : undefined
  }

  private get scope() {
    return this.ctx.db
  }

  // ── Bienvenida ──────────────────────────────────────────────────────────────────────────────────────────────

  /** Crea el hogar y su libro (create_household), guarda el nombre y reclama el referido. Devuelve el libro. */
  async create(b: { nombre: string; hogar: string; libro: string; ref?: string | null }): Promise<{ bookId: string; msg: string }> {
    const scope = this.scope
    await this.repo.setProfileName(scope, b.nombre)
    const bookId = await this.repo.createHousehold(scope, b.hogar, b.libro)
    // Referidos: el código llega en los datos del registro (user_metadata.ref) o en la cookie que deja /registro?ref=…
    const meta = (this.ctx.user.claims as { user_metadata?: { ref?: string } }).user_metadata
    const ref = meta?.ref ?? b.ref ?? (await this.registeredRef(scope.userId).catch(() => undefined))
    await this.claimReferral(scope.userId, ref).catch((e) => this.log.warn({ error: e }, "no se pudo reclamar el referido"))
    this.access.invalidate()
    return { bookId, msg: "¡Listo! Tu hogar quedó creado." }
  }

  /**
   * Registra que `referred` llegó con `codigo` y, si aplica, da la recompensa (cortesía del plan configurado) a los
   * dos hogares. Idempotente (una persona solo puede ser referida una vez). Igual que lib/referidos.ts.
   */
  async claimReferral(referred: string, codigo: string | null | undefined) {
    const c = normCodigo(codigo)
    if (!c) return
    const [dueno, rawCfg, ya] = await Promise.all([this.repo.referralOwner(SYS, c), this.repo.referralSettings(SYS), this.repo.wasReferred(SYS, referred)])
    if (!dueno || dueno === referred || ya) return
    const refId = await this.repo.insertReferral(SYS, { referrer: dueno, referred, codigo: c })
    if (!refId) return
    const cfg = referidosCfg(rawCfg)
    const [count, hA, hB] = await Promise.all([this.repo.countRewarded(SYS, dueno), this.repo.ownHousehold(SYS, dueno), this.repo.ownHousehold(SYS, referred)])
    if (!cfg.activo || !hA || !hB || count >= MAX_RECOMPENSAS) return this.repo.setReferral(SYS, refId, { estado: "sin_recompensa" })
    const plan = await this.repo.planName(SYS, cfg.plan)
    if (!plan) return
    for (const [h, uid, quien] of [[hA, dueno, "por invitar a alguien"], [hB, referred, "por llegar con una invitación"]] as const) {
      // Si el hogar ya tiene una cortesía vigente, se suman los días.
      const prev = await this.repo.courtesy(SYS, h, plan.id)
      await this.repo.setCourtesy(SYS, { id: prev?.id, householdId: h, plan: plan.id, vence: cortesiaHasta(prev?.vence_at, cfg.dias), nota: "Referido" })
      await this.repo.notify(SYS, [{ user_id: uid, kind: "plan", titulo: `¡Ganaste ${cfg.dias} días de Mirai ${plan.nombre}!`, cuerpo: `Te lo regalamos ${quien}. Disfrútalo.`, href: "/referidos", dedupe: `ref-${refId}-${uid}` }])
    }
    await this.repo.setReferral(SYS, refId, { estado: "recompensado", rewarded_at: new Date().toISOString() })
  }

  async rename(householdId: string, nombre: string): Promise<Msg> {
    const h = await this.access.can(householdId, "ajustes")
    const n = nombre.trim().slice(0, 60)
    if (!n) throw DomainError.validation("Escribe un nombre")
    await this.repo.rename(SYS, h.household.id, n)
    this.access.invalidate()
    return { msg: "Nombre actualizado" }
  }

  // ── Lista de personas ───────────────────────────────────────────────────────────────────────────────────────

  private newToken() {
    const token = randomBytes(24).toString("base64url")
    let enc: string | null = null
    try {
      enc = this.crypto.encrypt(token)
    } catch {
      /* sin ENCRYPTION_KEY el enlace solo se muestra al crearla */
    }
    return { token, token_hash: hash(token), token_enc: enc }
  }

  private shareOf(h: HouseholdCtx, inv: Pick<InvRow, "nombre" | "phone" | "access_role" | "role" | "expires_at">, token: string): Share {
    const url = this.site.to(`/invitacion/${token}`)
    const text = inviteText({ invita: h.user.apodo || h.user.nombre, hogar: h.household.nombre, nombre: inv.nombre, rol: toAccess(inv.access_role, inv.role), url, vence: inv.expires_at })
    return { url, text, wa: waMeLink(text, inv.phone) }
  }

  /** Integrantes sin cuenta, personas con cuenta e invitaciones pendientes del hogar, en una sola lista. */
  async people(householdId: string): Promise<HouseholdPeople> {
    const h = await this.access.of(householdId)
    const hh = h.household.id
    const admin = can(h.access, "invitar")
    const [ms, fams, invs] = await Promise.all([this.repo.members(SYS, hh), this.repo.family(SYS, hh), admin ? this.repo.pendingInvitations(SYS, hh) : Promise.resolve([] as InvRow[])])
    const prof = new Map((await this.repo.profiles(SYS, ms.map((m) => m.user_id))).map((p) => [p.id, p]))
    const mem = new Map(ms.map((m) => [m.user_id, m]))
    const now = new Date()
    const invOf = (i: InvRow): NonNullable<Person["invite"]> => ({
      id: i.id, kind: i.phone ? "tel" : "email", destino: i.phone ? formatCoPhone(i.phone) : String(i.email ?? ""), phone: i.phone,
      access: toAccess(i.access_role, i.role), createdAt: i.created_at, expiresAt: i.expires_at, estado: inviteEstado(i, now) === "vencida" ? "vencida" : "pendiente",
      lastSentAt: i.last_sent_at, sendsDay: i.sends_day, sendsToday: i.sends_today ?? 0, result: (i.last_result ?? {}) as LastResult,
      share: inviteEstado(i, now) === "pendiente" && i.token_enc ? (() => { try { return this.shareOf(h, i, this.crypto.decrypt(i.token_enc!)) } catch { return null } })() : null,
    })
    const people: Person[] = []
    const seen = new Set<string>()
    for (const f of fams) {
      const m = f.user_id ? mem.get(f.user_id) : undefined
      const p = f.user_id ? prof.get(f.user_id) : undefined
      const inv = !m ? invs.find((i) => i.family_member_id === f.id) : undefined
      if (m) seen.add(m.user_id)
      const invite = inv ? invOf(inv) : null
      people.push({
        key: `fm:${f.id}`, familyId: f.id, userId: m ? m.user_id : null, nombre: f.nombre, avatar: f.avatar || p?.avatar_url || null, parentesco: f.rol,
        access: m ? toAccess(m.access_role, m.role) : null, me: m?.user_id === h.user.id, titular: f.es_titular, email: p?.email ?? null,
        estado: m ? "miembro" : invite ? (invite.estado === "vencida" ? "vencida" : "invitado") : "sin_cuenta", invite, family: f,
      })
    }
    for (const m of ms) {
      if (seen.has(m.user_id)) continue
      const p = prof.get(m.user_id)
      people.push({
        key: `u:${m.user_id}`, familyId: null, userId: m.user_id, nombre: p?.nombre || p?.email || "Sin nombre", avatar: p?.avatar_url ?? null, parentesco: null,
        access: toAccess(m.access_role, m.role), me: m.user_id === h.user.id, titular: false, email: p?.email ?? null, estado: "miembro", invite: null, family: null,
      })
    }
    for (const i of invs) {
      if (i.family_member_id && people.some((x) => x.familyId === i.family_member_id)) continue
      const invite = invOf(i)
      people.push({
        key: `inv:${i.id}`, familyId: null, userId: null, nombre: i.nombre?.trim() || invite.destino, avatar: null, parentesco: i.parentesco,
        access: null, me: false, titular: false, email: i.email, estado: invite.estado === "vencida" ? "vencida" : "invitado", invite, family: null,
      })
    }
    const order = (x: Person) => (x.me ? 0 : x.estado === "miembro" ? 10 - ROLE_RANK[x.access ?? "viewer"] / 10 : x.estado === "sin_cuenta" ? 20 : 30)
    people.sort((a, b) => order(a) - order(b))
    const limite = limitOf(h.plan, "personas")
    return {
      people,
      sinCuenta: people.filter((x) => x.estado === "sin_cuenta" && x.familyId).map((x) => ({ id: x.familyId!, nombre: x.nombre, parentesco: x.parentesco ?? "" })),
      ...(limite !== undefined ? { limite } : {}),
    }
  }

  // ── Invitar, reenviar, compartir y cancelar ─────────────────────────────────────────────────────────────────

  /** Token de una invitación (descifrado) o uno nuevo si no se guardó (invitaciones de la versión anterior). */
  private async tokenOf(inv: InvRow) {
    if (inv.token_enc) try { return this.crypto.decrypt(inv.token_enc) } catch { /* se rota abajo */ }
    const t = this.newToken()
    await this.repo.updateInvitation(SYS, inv.id, { token_hash: t.token_hash, token_enc: t.token_enc })
    return t.token
  }

  /** Envía por correo y/o WhatsApp, guarda el resultado y los contadores (límite de reenvíos). */
  private async deliver(h: HouseholdCtx, inv: InvRow, token: string) {
    const share = this.shareOf(h, inv, token)
    const m: InviteMsg = { householdId: h.household.id, userId: h.user.id, invita: h.user.apodo || h.user.nombre, hogar: h.household.nombre, nombre: inv.nombre, rol: toAccess(inv.access_role, inv.role), url: share.url, vence: inv.expires_at }
    const prev = { ...((inv.last_result ?? {}) as LastResult) }
    delete prev.cancelada
    const result: LastResult = { ...prev }
    if (inv.email) result.email = await this.messenger.inviteEmail(m, inv.email)
    if (inv.phone) result.whatsapp = await this.messenger.inviteWhatsApp(m, inv.phone)
    await this.repo.updateInvitation(SYS, inv.id, { ...afterSend(inv), sent_count: (inv.sent_count ?? 0) + 1, last_result: result })
    return { share, result }
  }

  private deliveryMsg(quien: string, r: LastResult, reenvio: boolean) {
    const verbo = reenvio ? "reenviada" : "enviada"
    if (r.email?.ok && r.email.via === "prueba") return `Invitación ${verbo} (correo de prueba: no se envió de verdad).`
    if (r.email?.ok) return `Invitación ${verbo} por correo a ${quien}.`
    if (r.whatsapp?.ok) return `Invitación ${verbo} por WhatsApp a ${quien}.`
    if (r.email && !r.email.ok) return `La invitación quedó lista, pero el correo no salió: ${r.email.error}. Envíala desde tu WhatsApp o copia el enlace.`
    if (r.whatsapp?.via === "api") return `La invitación quedó lista, pero WhatsApp no la envió: ${r.whatsapp.error}. Envíala desde tu WhatsApp.`
    return `La invitación quedó lista. Envíasela a ${quien} desde tu WhatsApp o copia el enlace.`
  }

  /** Invita por correo o celular, sin duplicados (miembros, invitaciones pendientes e integrantes). */
  async invite(householdId: string, b: { destino: string; nombre?: string | null; parentesco?: string | null; access: AccessRole; familyId?: string | null; nueva?: boolean }) {
    const h = await this.access.can(householdId, "invitar")
    if (!assignableRoles(h.access).includes(b.access)) throw DomainError.role("No puedes dar un rol con más permisos que el tuyo.")
    const dest = normalizeDest(b.destino)
    if ("error" in dest) throw DomainError.validation(dest.error)
    // Límite de invitaciones nuevas (evita envíos masivos). Los correos de prueba no se envían y no cuentan.
    if (!(dest.kind === "email" && isTestEmail(dest.value))) {
      await this.limiter.hit("invitarMin", h.user.id, "Enviaste muchas invitaciones seguidas")
      await this.limiter.hit("invitar", h.user.id, "Llegaste al límite de invitaciones de hoy")
    }
    const hh = h.household.id
    const [ms, invs] = await Promise.all([this.repo.members(SYS, hh), this.repo.pendingInvitations(SYS, hh)])
    const ids = ms.map((m) => m.user_id)
    const ps = await this.repo.profiles(SYS, ids)
    const dup = checkDuplicate(dest, ps.map((x) => ({ nombre: x.nombre ?? "", email: x.email, telefono: x.telefono })), invs)
    if (dup.kind === "miembro") throw conflict("miembro", dup.msg)
    if (dup.kind === "pendiente") throw conflict("pendiente", dup.msg, { invitationId: dup.id })

    // Integrante sin cuenta: se vincula a ese mismo (al aceptar no se crea otro).
    let nombre = b.nombre?.trim() || null
    let parentesco = b.parentesco?.trim() || null
    const familyId = b.familyId ?? null
    const fams = await this.repo.family(SYS, hh)
    if (familyId) {
      const f = fams.find((x) => x.id === familyId)
      if (!f) throw DomainError.notFound("Ese integrante ya no está en el hogar.")
      if (f.user_id) throw conflict("miembro", `${f.nombre} ya tiene su cuenta y hace parte de tu hogar.`)
      const other = invs.find((i) => i.family_member_id === familyId)
      if (other) throw conflict("pendiente", `Ya invitaste a ${f.nombre}. ¿Quieres reenviarle la invitación?`, { invitationId: other.id })
      nombre ||= f.nombre
      parentesco ||= f.rol
    } else if (nombre && !b.nueva) {
      const same = fams.find((x) => !x.user_id && sameName(x.nombre, nombre!))
      if (same) throw conflict("mismo_nombre", `Ya tienes a ${same.nombre} en tu hogar (sin cuenta). ¿Es la misma persona?`, { familyId: same.id })
    }

    // Límite de personas del plan.
    const max = limitOf(h.plan, "personas")
    if (max !== undefined) {
      const vivos = invs.filter((i) => new Date(i.expires_at) > new Date()).length
      if (ids.length + vivos >= max) throw DomainError.plan(`Tu plan permite ${max} personas con cuenta por hogar. Cambia de plan para invitar a toda tu familia.`)
    }

    const t = this.newToken()
    const inv = await this.repo.insertInvitation(SYS, {
      household_id: hh, email: dest.kind === "email" ? dest.value : null, phone: dest.kind === "tel" ? dest.value : null,
      access_role: b.access, role: b.access === "admin" || b.access === "editor" ? "editor" : "viewer",
      nombre, parentesco, family_member_id: familyId, token_hash: t.token_hash, token_enc: t.token_enc, invited_by: h.user.id,
      expires_at: new Date(Date.now() + DAYS * 86400000).toISOString(),
    })
    const { share, result } = await this.deliver(h, inv, t.token)
    return { invitationId: inv.id, share, delivery: result, msg: this.deliveryMsg(nombre || dest.label, result, false) }
  }

  private async ownInvitation(householdId: string, id: string) {
    const h = await this.access.can(householdId, "invitar")
    const inv = await this.repo.pendingInvitation(SYS, h.household.id, id)
    if (!inv) throw DomainError.notFound("Esa invitación ya no está pendiente (la aceptaron o la cancelaron).")
    return { h, inv }
  }

  /** Reenvía (máximo 1 cada 10 minutos y 5 al día). Si ya venció, la renueva por 7 días más. */
  async resend(householdId: string, id: string) {
    const o = await this.ownInvitation(householdId, id)
    const gate = resendGate(o.inv)
    if (!gate.ok) throw new DomainError("RATE_LIMITED", gate.msg, { reason: "espera", waitMin: gate.waitMin }, { headers: { "retry-after": String((gate.waitMin ?? 60 * 24) * 60) } })
    let inv = o.inv
    if (new Date(inv.expires_at) <= new Date()) {
      const expires_at = new Date(Date.now() + DAYS * 86400000).toISOString()
      await this.repo.updateInvitation(SYS, inv.id, { expires_at })
      inv = { ...inv, expires_at }
    }
    const token = await this.tokenOf(inv)
    const { share, result } = await this.deliver(o.h, inv, token)
    return { invitationId: inv.id, share, delivery: result, msg: this.deliveryMsg(inv.nombre || (inv.phone ? formatCoPhone(inv.phone) : inv.email ?? ""), result, true) }
  }

  /** Enlace, texto y wa.me de una invitación pendiente (Copiar enlace, Compartir, Enviar desde mi WhatsApp). */
  async share(householdId: string, id: string) {
    const o = await this.ownInvitation(householdId, id)
    if (new Date(o.inv.expires_at) <= new Date()) throw DomainError.validation("La invitación venció. Reenvíala para renovarla por 7 días.")
    return { share: this.shareOf(o.h, o.inv, await this.tokenOf(o.inv)) }
  }

  /** Registra que la persona abrió su WhatsApp con la invitación lista (canal "propio"). */
  async markShared(householdId: string, id: string): Promise<Msg> {
    const o = await this.ownInvitation(householdId, id)
    const at = new Date().toISOString()
    const result: LastResult = { ...((o.inv.last_result ?? {}) as LastResult), whatsapp: { ok: true, at, via: "propio", provider: "wa.me" } }
    await this.repo.updateInvitation(SYS, id, { last_result: result })
    await this.repo
      .logSend(SYS, { user_id: o.h.user.id, household_id: o.h.household.id, channel: "whatsapp", kind: "invitacion", provider: "wa.me", source: "hogar", status: "enviado", destino: o.inv.phone ? maskPhone(o.inv.phone) : "contacto elegido en WhatsApp" })
      .catch(() => undefined)
    return { msg: "" }
  }

  async cancelInvitation(householdId: string, id: string): Promise<Msg> {
    const o = await this.ownInvitation(householdId, id)
    const now = new Date().toISOString()
    await this.repo.updateInvitation(SYS, id, { canceled_at: now, canceled_by: o.h.user.id, expires_at: new Date(Math.min(Date.now(), new Date(o.inv.expires_at).getTime())).toISOString() })
    return { msg: "Invitación cancelada. El enlace ya no sirve." }
  }

  // ── Roles y personas con cuenta ─────────────────────────────────────────────────────────────────────────────

  async changeRole(householdId: string, userId: string, access: AccessRole): Promise<Msg> {
    if (!(ACCESS_ROLES as readonly string[]).includes(access) || access === "owner") throw DomainError.validation("Ese rol no existe. Para que alguien sea dueño, pásale el hogar.")
    const h = await this.access.of(householdId)
    await this.repo.rpc(this.scope, "set_member_access", { p_household: h.household.id, p_user: userId, p_access: access })
    this.access.invalidate(userId)
    return { msg: `Rol actualizado: ${ROLE_INFO[access].label}.` }
  }

  async removePerson(householdId: string, userId: string) {
    const h = await this.access.of(householdId)
    await this.repo.rpc(this.scope, "remove_household_member", { p_household: h.household.id, p_user: userId })
    // Los accesos del contador que creó esa persona dejan de servir: ya no es del hogar.
    await this.repo.revokeAccountantShares(SYS, h.household.id, userId)
    const self = userId === h.user.id
    this.access.invalidate(userId)
    return { self, msg: self ? "Saliste del hogar." : "Ya no tiene acceso al hogar. Sus gastos e ingresos se quedan a su nombre." }
  }

  async makeOwner(householdId: string, userId: string): Promise<Msg> {
    const h = await this.access.of(householdId)
    await this.repo.rpc(this.scope, "transfer_household", { p_household: h.household.id, p_user: userId })
    this.access.invalidate()
    this.access.invalidate(userId)
    return { msg: "Listo: ahora esa persona es la dueña del hogar y tú quedas como Administra." }
  }

  /** Une a una persona con cuenta con el integrante sin cuenta que la representaba (la misma persona). */
  async linkPerson(householdId: string, userId: string, familyId: string): Promise<Msg> {
    const h = await this.access.of(householdId)
    await this.repo.rpc(this.scope, "link_family_member", { p_household: h.household.id, p_user: userId, p_family: familyId })
    return { msg: "Listo: ahora es una sola persona, con su cuenta y sus movimientos." }
  }

  // ── Integrantes sin cuenta ──────────────────────────────────────────────────────────────────────────────────

  /** Crea o edita un integrante (sin duplicar nombres sin confirmar). Con la sesión de la persona: queda en la auditoría. */
  async saveFamily(householdId: string, id: string | null, b: { nombre: string; rol?: string | null; avatar?: string | null; nacimiento?: string | null; cupo?: number; force?: boolean }) {
    const h = await this.access.of(householdId)
    const perm = id ? "planear" : "invitar"
    if (!can(h.access, perm)) throw DomainError.role(deniedMsg(perm))
    if (!b.force) {
      const fams = await this.repo.family(this.scope, h.household.id)
      const same = fams.find((f) => f.id !== id && sameName(f.nombre, b.nombre))
      if (same) throw conflict("mismo_nombre", `Ya hay una persona llamada ${same.nombre} en tu hogar. ¿Es otra persona con el mismo nombre?`)
    }
    const row = { nombre: b.nombre, rol: b.rol || "Otro familiar", avatar: b.avatar ?? "", nacimiento: b.nacimiento ?? null, cupo: b.cupo ?? 0 }
    const saved = await this.repo.saveFamily(this.scope, h.household.id, id, row)
    if (!saved) throw DomainError.role("No se pudo guardar: sin permiso")
    return { id: saved, msg: id ? `Se actualizaron los datos de ${row.nombre}.` : `${row.nombre} ya hace parte de tu hogar.` }
  }

  /** V7-H2: integrantes vivos del hogar (useMembers de la web). Cualquier integrante; con su sesión (la RLS decide). */
  async family(householdId: string): Promise<FamilyRow[]> {
    const h = await this.access.of(householdId)
    return this.repo.family(this.scope, h.household.id)
  }

  /** V7-H2: cupo o datos de dependiente de un integrante (permiso «planear», como updateFamily). */
  async patchFamily(householdId: string, id: string, patch: FamilyPatch): Promise<{ id: string; msg: string }> {
    const h = await this.access.can(householdId, "planear")
    const saved = await this.repo.patchFamily(this.scope, h.household.id, id, patch)
    if (!saved) throw DomainError.notFound("Ese integrante ya no está en el hogar.")
    return { id: saved, msg: "Guardado" }
  }

  /** Saca del hogar a un integrante sin cuenta (borrado lógico, con Deshacer). Cancela su invitación pendiente. */
  async deleteFamily(householdId: string, id: string, restore = false): Promise<Msg> {
    const h = await this.access.can(householdId, "invitar")
    const f = await this.repo.familyMember(this.scope, h.household.id, id)
    if (!f) throw DomainError.notFound("Ese integrante ya no está en el hogar.")
    if (!restore && (f.es_titular || f.user_id)) throw DomainError.conflict(`${f.nombre} tiene cuenta en Mirai: primero quítale el acceso al hogar.`)
    await this.repo.setFamilyDeleted(this.scope, id, !restore)
    if (!restore) await this.repo.cancelFamilyInvitations(SYS, id, h.user.id)
    return { msg: restore ? `${f.nombre} volvió al hogar.` : `${f.nombre} ya no está en el hogar.` }
  }

  // ── Aceptar una invitación ──────────────────────────────────────────────────────────────────────────────────

  /** Datos de /invitacion/<token>. Con sesión, `ya_miembro` dice si ya es del hogar (RPC invitation_info). */
  async invitationInfo(token: string, withUser: boolean): Promise<InvitationInfo> {
    const d = (await this.repo.invitationInfo(withUser ? this.scope : systemScope("invitación pública (sin sesión)"), token)) ?? { estado: "no_existe" }
    const estados = ["pendiente", "vencida", "aceptada", "cancelada", "no_existe"] as const
    const estado = (estados as readonly string[]).includes(d.estado) ? (d.estado as InvitationInfo["estado"]) : "no_existe"
    return { ...d, estado, rol: d.rol ? toAccess(d.rol) : undefined }
  }

  /** Acepta con la sesión actual (accept_invitation, idempotente) y deja abierto el hogar nuevo. */
  async accept(token: string) {
    const scope = this.scope
    const info = await this.repo.invitationInfo(scope, token)
    const ya = !!info?.ya_miembro
    // Límite de personas del plan del hogar que invita (si bajó de plan después de invitar, no entra nadie más).
    if (!ya && token.length <= 128) {
      const hh = await this.repo.householdOfToken(SYS, hash(token))
      if (hh) {
        const max = limitOf(toPlanInfo(await this.repo.planOf(SYS, hh)), "personas")
        if (max !== undefined && (await this.repo.countMembers(SYS, hh)) >= max)
          throw DomainError.plan(`Ese hogar ya tiene las ${max} personas que permite su plan. Pídele a quien te invitó que revise su plan en Ajustes › Mi plan.`)
      }
    }
    const householdId = await this.repo.acceptInvitation(scope, token)
    if (!householdId) throw DomainError.notFound("La invitación no existe o ya venció. Pide una nueva.")
    const bookId = await this.repo.openFirstBook(scope, householdId)
    this.access.invalidate()
    return { householdId, bookId, ya, msg: ya ? "Ya hacías parte de este hogar. Te llevamos allá." : "¡Listo! Ya haces parte del hogar." }
  }

  // ── Pasar el hogar ──────────────────────────────────────────────────────────────────────────────────────────

  /** Personas que pueden recibir el hogar y si pagas una renovación automática. */
  async transferCandidates(householdId: string) {
    const h = await this.access.of(householdId)
    const owner = h.access === "owner"
    const [ms, subs] = await Promise.all([this.repo.members(SYS, h.household.id), this.billing.activeRenewals(h.household.id, h.user.id)])
    const ps = await this.repo.profiles(SYS, ms.map((m) => m.user_id))
    const people = ms
      .map((m) => {
        const p = ps.find((x) => x.id === m.user_id)
        const access = toAccess(m.access_role, m.role)
        return { userId: m.user_id, nombre: p?.nombre || p?.email || "Sin nombre", email: p?.email ?? null, avatar: p?.avatar_url ?? null, access, ok: canReceive(h.access, { userId: m.user_id, access, me: m.user_id === h.user.id, estado: "miembro" }).ok }
      })
      .filter((p) => p.userId !== h.user.id)
    return { owner, msg: owner ? "" : "Solo el dueño puede pasar el hogar a otra persona.", people, tienePago: subs.length > 0, hogar: h.household.nombre }
  }

  /** Pide pasarle el hogar a otra persona. Queda pendiente hasta que acepte (7 días). Le llega un aviso y un correo. */
  async requestTransfer(householdId: string, b: { userId: string; fromRole: AccessRole; planAction: "seguir" | "cancelar"; confirm: string }): Promise<Msg> {
    const h = await this.access.of(householdId)
    if (h.access !== "owner") throw DomainError.role("Solo el dueño puede pasar el hogar a otra persona.")
    if (!nameMatches(b.confirm, h.household.nombre)) throw DomainError.validation("Escribe el nombre del hogar tal como aparece para confirmar.")
    await this.limiter.hit("pasarHogar", h.user.id)
    await this.repo.requestTransfer(this.scope, { householdId: h.household.id, userId: b.userId, fromRole: b.fromRole, planAction: b.planAction, confirm: b.confirm })
    const [to] = await this.repo.profiles(SYS, [b.userId])
    const para = to?.apodo || to?.nombre || "esa persona"
    const mail = await this.messenger.transferEmail(
      { householdId: h.household.id, userId: h.user.id, de: h.user.apodo || h.user.nombre, para, hogar: h.household.nombre, url: this.site.to("/ajustes?tab=cuenta"), vence: new Date(Date.now() + TRANSFER_DAYS * 86400000).toISOString() },
      to?.email,
    )
    const extra = mail === "enviado" ? " y un correo" : mail === "prueba" ? " (correo de prueba: no se envió)" : ""
    return { msg: `Listo: le enviamos a ${para} un aviso en Mirai${extra}. Cuando acepte, será el dueño del hogar.` }
  }

  /** Acepta o rechaza ser el dueño. Si aceptas y quien te lo pasó pidió cancelar su renovación, se cancela. */
  async respondTransfer(id: string, accept: boolean): Promise<Msg> {
    const user = this.ctx.user
    await this.limiter.hit("pasarHogar", user.id)
    const r = await this.repo.respondTransfer(this.scope, id, accept)
    if (!r) throw DomainError.notFound("Esa solicitud no existe.")
    if (r.estado === "vencida") throw DomainError.conflict("La solicitud venció (pasaron 7 días). Pídele que te la envíe de nuevo.", { reason: "vencida" })
    if (r.estado === "no_aplica") throw DomainError.conflict("Esta solicitud ya no aplica: el hogar cambió de dueño o ya no haces parte de él.", { reason: "no_aplica" })
    if (r.estado === "cancelada") throw DomainError.conflict("Esta solicitud fue cancelada.", { reason: "cancelada" })
    if (r.estado === "aceptada" && accept) {
      if (r.plan_action === "cancelar" && r.from_user) await this.billing.cancelRenewals(r.household_id, r.from_user, { tolerant: true })
      this.access.invalidate()
      if (r.from_user) this.access.invalidate(r.from_user)
      return { msg: "¡Listo! Ahora eres el dueño del hogar. El plan y borrar el hogar quedan en tus manos." }
    }
    return { msg: r.estado === "rechazada" ? "Rechazaste la solicitud. Todo sigue igual en el hogar." : "Esa solicitud ya tenía respuesta." }
  }

  async cancelTransfer(id: string): Promise<Msg> {
    await this.limiter.hit("pasarHogar", this.ctx.user.id)
    await this.repo.cancelTransfer(this.scope, id)
    return { msg: "Cancelaste la solicitud. Sigues siendo el dueño del hogar." }
  }

  // ── Salir o borrar un hogar ─────────────────────────────────────────────────────────────────────────────────

  private async event(userId: string, kind: string, detail: Record<string, unknown>) {
    await this.repo.accountEvent(SYS, { user_id: userId, kind, detail, ...this.meta.get() }).catch(() => undefined)
  }

  /** Sale de un hogar donde no eres dueño. Los accesos del contador que creaste en ese hogar se cierran. */
  async leave(householdId: string): Promise<Msg> {
    const h = await this.access.of(householdId).catch(() => {
      throw DomainError.notFound("Ya no haces parte de ese hogar.")
    })
    if (h.access === "owner") throw DomainError.conflict("Eres el dueño: primero pásale el hogar a otra persona o bórralo.", { reason: "dueno" })
    await this.limiter.hit("borrarHogar", h.user.id)
    await this.repo.rpc(this.scope, "remove_household_member", { p_household: h.household.id, p_user: h.user.id })
    await this.repo.revokeAccountantShares(SYS, h.household.id, h.user.id)
    await this.event(h.user.id, "hogar_salida", { hogar: h.household.nombre })
    this.access.invalidate()
    return { msg: `Saliste de “${h.household.nombre}”. Para volver, alguien tendrá que invitarte de nuevo.` }
  }

  /** Borra un hogar del que eres dueño (con sus libros y archivos). Pide el nombre escrito y que no tenga un pago automático activo. */
  async remove(householdId: string, confirm: string): Promise<Msg> {
    const h = await this.access.of(householdId)
    if (h.access !== "owner") throw DomainError.role("Solo el dueño puede borrar el hogar.")
    if (!nameMatches(String(confirm ?? ""), h.household.nombre)) throw DomainError.validation("Escribe el nombre del hogar tal como aparece para confirmar.")
    await this.limiter.hit("borrarHogar", h.user.id)
    if ((await this.billing.activeRenewals(h.household.id)).length) throw DomainError.conflict("Este hogar tiene una renovación automática del plan. Cancélala primero en Ajustes › Mi plan.", { reason: "renovacion" })
    await this.purge.household(h.household.id)
    await this.repo.deleteHousehold(SYS, h.household.id)
    await this.event(h.user.id, "hogar_borrado", { hogar: h.household.nombre })
    this.access.invalidate()
    return { msg: `Borramos “${h.household.nombre}” con sus libros.` }
  }
}

/** Destino enmascarado para el registro de envíos (maskDest("whatsapp", …) de la web: +57 315 ••• 4567). */
export const maskPhone = (dest: string) => {
  const n = dest.replace(/\D/g, "")
  return n.length >= 10 ? `+${n.slice(0, -10)} ${n.slice(-10, -7)} ••• ${n.slice(-4)}`.replace(/^\+ /, "") : "•••"
}
