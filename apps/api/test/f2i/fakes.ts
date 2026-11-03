// Dobles en memoria de los puertos de F2-I. Guardan las llamadas (con su alcance) para revisar qué hizo el servicio.
// FakeBillingRepo imita apply_plan_payment (una transacción idempotente por proveedor + referencia).
import type { SessionRow } from "@mirai/contracts/modules/account"
import type { AccountEvent, AccountState } from "@mirai/domain/account"
import type { PlanRow } from "@mirai/domain/app-context"
import { nextPayState, payEffect, type ApplyResult } from "@mirai/domain/billing"
import type { ChannelResult } from "@mirai/domain/household/invites"
import type { TransferRow } from "@mirai/domain/household/transfer"
import type { RentaData } from "@mirai/domain/integral-extras"
import type { Coupon } from "@mirai/domain/plans"
import type { DbScope, UserScope } from "../../src/core/db/scope"
import { DomainError } from "../../src/core/errors/domain-error"
import { AccountRepo, type AccountRpc } from "../../src/modules/account/account.repository"
import { IdentityAdmin, type AdminUser, type AuthErr, type UserIdentity } from "../../src/modules/account/identity-admin"
import { AdminRepo, type AuditActivity, type MemberRow as AdminMember, type Notice, type PayRow, type ProfileRow, type SubRow } from "../../src/modules/admin/admin.repository"
import { PlatformMailer, type PlatformMail } from "../../src/modules/admin/platform-mailer"
import { BillingRepo, type ApplyArgs, type PlanPrice, type Renewal } from "../../src/modules/billing/billing.repository"
import { MercadoPagoClient, type AuthorizedPayment, type MpPayment, type NewPreapproval, type Preapproval } from "../../src/modules/billing/mercadopago.client"
import {
  HouseholdsRepo, type FamilyInput, type FamilyRow, type HouseholdRpc, type InvitationInfoRaw, type InvitationPatch, type InvRow, type MemberRow, type NewInvitation, type ProfileLite, type RespondResult, type SendLog,
} from "../../src/modules/households/households.repository"
import { NoChannelMessenger, StoragePurge, type InviteMsg, type TransferMail } from "../../src/modules/households/ports"
import { AccountantRepo, type ShareRow } from "../../src/modules/tax/accountant.repository"
import { H_GRATIS, H_PREMIUM, USERS } from "../setup/fixtures"

const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
export type Call = { m: string; scope: DbScope["kind"]; args: unknown[] }

export const PLAN_ROWS: Record<string, NonNullable<PlanRow>> = {
  gratis: { id: "gratis", nombre: "Gratis", funciones: [], anuncios: true, limites: { libros: 1, personas: 2 }, precio_mes: 0 },
  premium: { id: "premium", nombre: "Premium", funciones: ["ia", "banco", "impuestos", "familia"], anuncios: false, limites: { libros: 5, personas: 8 }, precio_mes: 14900 },
}

export const familyRow = (p: Partial<FamilyRow> & { id: string; household_id: string; nombre: string }): FamilyRow => ({
  avatar: "", color: "", created_at: now(), created_by: null, cupo: 0, deleted_at: null, dep_de: null, dep_rel: null, discapacidad: false, doc: "", es_titular: false, estudia: false,
  nacimiento: null, rol: "Otro familiar", sin_ingresos: false, sort: 0, updated_at: now(), user_id: null, ...p,
})

export class FakeHouseholdsRepo extends HouseholdsRepo {
  calls: Call[] = []
  members_: Record<string, MemberRow[]> = {}
  family_: FamilyRow[] = []
  invitations: (InvRow & { token_hash: string })[] = []
  profiles_: ProfileLite[] = Object.entries(USERS).map(([r, id]) => ({ id, nombre: r === "owner" ? "Ana" : r, apodo: r, email: `${r}@correo.co`, avatar_url: null, telefono: null }))
  plans: Record<string, string> = { [H_GRATIS]: "gratis", [H_PREMIUM]: "premium" }
  transfers: TransferRow[] = []
  respond: RespondResult | null = null
  rpcError: DomainError | null = null
  info: InvitationInfoRaw | null = null
  acceptTo: string | null = H_GRATIS
  referral = { owner: null as string | null, cfg: { referidos_activo: true, referidos_plan: "premium", referidos_dias: 30 } as Record<string, unknown> | null, referred: false, rewarded: 0, own: {} as Record<string, string> }
  notices: { user_id: string; titulo: string; dedupe: string }[] = []
  courtesies: { householdId: string; vence: string; id?: string }[] = []
  referralState: Record<string, string> = {}
  deleted: string[] = []

  private log(m: string, scope: DbScope, ...args: unknown[]) {
    this.calls.push({ m, scope: scope.kind, args })
  }
  called(m: string) {
    return this.calls.filter((c) => c.m === m)
  }

  async setProfileName(scope: UserScope, nombre: string) { this.log("setProfileName", scope, nombre) }
  async createHousehold(scope: UserScope, hogar: string, libro: string) { this.log("createHousehold", scope, hogar, libro); return "book-nuevo" }
  async rename(scope: DbScope, h: string, nombre: string) { this.log("rename", scope, h, nombre) }
  async members(scope: DbScope, h: string) { this.log("members", scope, h); return this.members_[h] ?? [] }
  async countMembers(scope: DbScope, h: string) { return (this.members_[h] ?? []).length }
  async family(scope: DbScope, h: string) { this.log("family", scope, h); return this.family_.filter((f) => f.household_id === h && !f.deleted_at) }
  async profiles(_s: DbScope, ids: string[]) { return this.profiles_.filter((p) => ids.includes(p.id)) }
  async rpc(scope: UserScope, fn: HouseholdRpc, args: Record<string, unknown>) {
    this.log(`rpc:${fn}`, scope, args)
    if (this.rpcError) throw this.rpcError
  }
  async revokeAccountantShares(scope: DbScope, h: string, by: string) { this.log("revokeAccountantShares", scope, h, by) }
  async pendingInvitations(scope: DbScope, h: string) { this.log("pendingInvitations", scope, h); return this.invitations.filter((i) => i.household_id === h && !i.accepted_at && !i.canceled_at) }
  async pendingInvitation(_s: DbScope, h: string, id: string) { return this.invitations.find((i) => i.id === id && i.household_id === h && !i.accepted_at && !i.canceled_at) ?? null }
  async insertInvitation(scope: DbScope, row: NewInvitation) {
    this.log("insertInvitation", scope, row)
    const inv = { id: uid(), created_at: now(), accepted_at: null, canceled_at: null, last_sent_at: null, sends_day: null, sends_today: 0, sent_count: 0, last_result: {}, ...row }
    this.invitations.push(inv)
    return inv
  }
  async updateInvitation(scope: DbScope, id: string, patch: InvitationPatch) {
    this.log("updateInvitation", scope, id, patch)
    const i = this.invitations.find((x) => x.id === id)
    if (i) Object.assign(i, patch)
  }
  async cancelFamilyInvitations(scope: DbScope, id: string, by: string) { this.log("cancelFamilyInvitations", scope, id, by) }
  async householdOfToken(_s: DbScope, hash: string) { return this.invitations.find((i) => i.token_hash === hash)?.household_id ?? null }
  async planOf(_s: DbScope, h: string): Promise<PlanRow> { return PLAN_ROWS[this.plans[h] ?? "gratis"] }
  async invitationInfo(scope: DbScope, token: string) { this.log("invitationInfo", scope, token); return this.info }
  async acceptInvitation(scope: UserScope, token: string) { this.log("acceptInvitation", scope, token); return this.acceptTo }
  async openFirstBook(scope: UserScope, h: string) { this.log("openFirstBook", scope, h); return `book-de-${h.slice(0, 8)}` }
  async logSend(scope: DbScope, row: SendLog) { this.log("logSend", scope, row) }
  async saveFamily(scope: UserScope, h: string, id: string | null, row: FamilyInput) {
    this.log("saveFamily", scope, h, id, row)
    if (id) return this.family_.find((f) => f.id === id) ? id : null
    const f = familyRow({ id: uid(), household_id: h, ...row })
    this.family_.push(f)
    return f.id
  }
  async familyMember(_s: UserScope, h: string, id: string) { return this.family_.find((f) => f.id === id && f.household_id === h) ?? null }
  async setFamilyDeleted(scope: UserScope, id: string, deleted: boolean) {
    this.log("setFamilyDeleted", scope, id, deleted)
    const f = this.family_.find((x) => x.id === id)
    if (f) f.deleted_at = deleted ? now() : null
  }
  async requestTransfer(scope: UserScope, a: unknown) { this.log("requestTransfer", scope, a); return uid() }
  async respondTransfer(scope: UserScope, id: string, accept: boolean) { this.log("respondTransfer", scope, id, accept); return this.respond }
  async cancelTransfer(scope: UserScope, id: string) { this.log("cancelTransfer", scope, id) }
  async pendingTransfers() { return this.transfers }
  async householdNames(_s: DbScope, ids: string[]) { return ids.map((id) => ({ id, nombre: id === H_GRATIS ? "Familia Pérez" : "Tienda" })) }
  async deleteHousehold(scope: DbScope, h: string) { this.log("deleteHousehold", scope, h); this.deleted.push(h) }
  async accountEvent(scope: DbScope, e: unknown) { this.log("accountEvent", scope, e) }
  async referralOwner(_s: DbScope, codigo: string) { return codigo === "ABCD2345" ? this.referral.owner : null }
  async referralSettings() { return this.referral.cfg }
  async wasReferred() { return this.referral.referred }
  async insertReferral(scope: DbScope, r: unknown) { this.log("insertReferral", scope, r); const id = uid(); this.referralState[id] = "pendiente"; return id }
  async countRewarded() { return this.referral.rewarded }
  async ownHousehold(_s: DbScope, u: string) { return this.referral.own[u] ?? null }
  async setReferral(_s: DbScope, id: string, p: { estado: string }) { this.referralState[id] = p.estado }
  async planName(_s: DbScope, id: string) { return PLAN_ROWS[id] ? { id, nombre: PLAN_ROWS[id].nombre } : null }
  async courtesy() { return null }
  async setCourtesy(_s: DbScope, a: { householdId: string; vence: string; id?: string }) { this.courtesies.push(a) }
  async notify(_s: DbScope, rows: { user_id: string; titulo: string; dedupe: string }[]) { this.notices.push(...rows) }
}

export class FakeBillingRepo extends BillingRepo {
  calls: Call[] = []
  plans: Record<string, PlanPrice> = { premium: { nombre: "Premium", precio_mes: 14900, precio_anio: 149000, activo: true }, gratis: { nombre: "Gratis", precio_mes: 0, precio_anio: 0, activo: true } }
  coupons: Coupon[] = [{ codigo: "MITAD", tipo: "porcentaje", valor: 50, planes: [], periodos: ["mes", "anio"], desde: null, hasta: null, max_usos: null, usos: 0, activo: true }]
  subs: (Renewal & { household_id: string; estado: string; proveedor: string; plan: string; periodo: string })[] = []
  pending: { household_id: string; referencia: string; periodo: string; plan: string; cupon: string | null; monto: number }[] = []
  /** Estado de cada pago (proveedor:referencia), como plan_payments. */
  payments = new Map<string, { estado: string; householdId: string }>()
  extensions: string[] = []
  notified = new Map<string, { userIds: string[]; titulo: string }>()
  owners_: Record<string, string[]> = { [H_GRATIS]: [USERS.owner], [H_PREMIUM]: [USERS.owner] }

  async plan(_s: DbScope, id: string) { return this.plans[id] ?? null }
  async coupon(_s: DbScope, codigo: string) { return this.coupons.find((c) => c.codigo === codigo) ?? null }
  async subscriptionByRef(_s: DbScope, _p: string, ref: string) { const s = this.subs.find((x) => x.proveedor_ref === ref); return s ? { id: s.id } : null }
  async insertSubscription(scope: DbScope, row: { household_id: string; plan: string; proveedor: string; proveedor_ref: string; periodo: string; estado: string; created_by?: string | null }) {
    this.calls.push({ m: "insertSubscription", scope: scope.kind, args: [row] })
    this.subs.push({ id: uid(), vence_at: null, created_by: row.created_by ?? null, ...row })
  }
  async setSubscriptionState(_s: DbScope, id: string, estado: string) { const s = this.subs.find((x) => x.id === id); if (s) s.estado = estado }
  async renewals(_s: DbScope, h: string, createdBy?: string) {
    return this.subs.filter((s) => s.household_id === h && s.proveedor === "mercadopago" && ["activa", "pendiente"].includes(s.estado) && (!createdBy || s.created_by === createdBy))
  }
  async insertPendingPayment(scope: DbScope, row: { household_id: string; referencia: string; periodo: string; plan: string; cupon: string | null; monto: number }) {
    this.calls.push({ m: "insertPendingPayment", scope: scope.kind, args: [row] })
    this.pending.push(row)
  }
  async paymentByRef(_s: DbScope, _p: string, ref: string) { return this.pending.find((p) => p.referencia === ref) ?? null }
  /** Como apply_plan_payment: con candado por referencia, un aviso repetido no extiende dos veces. */
  async applyPlanPayment(scope: DbScope, a: ApplyArgs): Promise<ApplyResult> {
    this.calls.push({ m: "applyPlanPayment", scope: scope.kind, args: [a] })
    const k = `${a.proveedor}:${a.referencia}`
    const prev = this.payments.get(k)?.estado ?? null
    const estado = nextPayState(prev as never, a.estado)
    this.payments.set(k, { estado, householdId: a.householdId })
    const fx = payEffect(prev as never, estado)
    if (fx.extend) this.extensions.push(k)
    return { subscription_id: null, payment_id: k, prev_estado: prev as never, estado, first_approval: fx.extend, revoked: fx.revoke, vence_at: fx.extend || fx.revoke ? new Date(Date.now() + 30 * 864e5).toISOString() : null, cupon_contado: false }
  }
  async owners(_s: DbScope, h: string) { return this.owners_[h] ?? [] }
  async notifyUsers(_s: DbScope, userIds: string[], n: { titulo: string; dedupe: string }) { if (!this.notified.has(n.dedupe)) this.notified.set(n.dedupe, { userIds, titulo: n.titulo }) }
}

export class FakeMercadoPago extends MercadoPagoClient {
  created: NewPreapproval[] = []
  canceled: string[] = []
  preapprovals = new Map<string, Preapproval>()
  authorized = new Map<string, AuthorizedPayment>()
  pays = new Map<string, MpPayment>()
  async createPreapproval(i: NewPreapproval) {
    this.created.push(i)
    const p: Preapproval = { id: `pre-${this.created.length}`, status: "pending", init_point: `https://www.mercadopago.com.co/subscriptions/checkout?preapproval_id=pre-${this.created.length}`, external_reference: i.externalReference }
    this.preapprovals.set(p.id, p)
    return p
  }
  async getPreapproval(id: string) { const p = this.preapprovals.get(id); if (!p) throw DomainError.upstream("Mercado Pago 404: no existe"); return p }
  async cancelPreapproval(id: string) { this.canceled.push(id); return { ...(this.preapprovals.get(id) ?? { id }), status: "cancelled" as const } }
  async getAuthorizedPayment(id: string) { const p = this.authorized.get(id); if (!p) throw DomainError.upstream("404"); return p }
  async getPayment(id: string) { const p = this.pays.get(id); if (!p) throw DomainError.upstream("404"); return p }
}

export const ACCOUNT: AccountState = {
  email: "owner@correo.co", new_email: null, email_change_sent_at: null, email_change_confirm_status: 0, has_password: true, created_at: "2026-01-01T00:00:00Z", last_sign_in_at: null,
  identities: [{ id: "g-1", provider: "google", email: "ana@gmail.com", last_sign_in_at: null, created_at: null }],
}

export class FakeAccountRepo extends AccountRepo {
  calls: Call[] = []
  account: AccountState | null = { ...ACCOUNT }
  sessions: SessionRow[] = [{ id: crypto.randomUUID(), created_at: now(), last_active: null, user_agent: "Chrome", ip: "1.2.3.4", aal: "aal1", actual: true }]
  events: AccountEvent[] = []
  rpcResult: unknown = true
  memberships: Record<string, { household_id: string; role: string; access_role: string | null }[]> = {}
  allMembers: { household_id: string; user_id: string }[] = []
  async myAccount() { return this.account }
  async mySessions() { return this.sessions }
  async myEvents() { return this.events }
  async rpc(scope: UserScope, fn: AccountRpc, args?: Record<string, unknown>) { this.calls.push({ m: `rpc:${fn}`, scope: scope.kind, args: [args] }); return this.rpcResult }
  async membersOf(_s: DbScope, ids: string[]) { return this.allMembers.filter((m) => ids.includes(m.household_id)) }
  async myMemberships(_s: DbScope, u: string) { return this.memberships[u] ?? [] }
  async deleteHousehold(scope: DbScope, h: string) { this.calls.push({ m: "deleteHousehold", scope: scope.kind, args: [h] }) }
}

export class FakeIdentity extends IdentityAdmin {
  calls: { m: string; args: unknown[] }[] = []
  emailError: AuthErr | null = null
  ids: UserIdentity[] = [{ identity_id: "11111111-1111-4111-8111-111111111111", provider: "google", identity_data: { email: "ana@gmail.com" } }, { identity_id: "e-1", provider: "email" }]
  users: AdminUser[] = Object.entries(USERS).map(([r, id]) => ({ id, email: `${r}@correo.co`, created_at: "2026-10-01T00:00:00Z", last_sign_in_at: now(), app_metadata: { provider: "email" }, user_metadata: {}, factors: [] }))
  private rec(m: string, ...args: unknown[]) { this.calls.push({ m, args }) }
  async requestEmailChange(_t: string, email: string, redirectTo: string) { this.rec("requestEmailChange", email, redirectTo); return this.emailError }
  async pendingEmailChange(cur: string, next: string) { this.rec("pendingEmailChange", cur, next); return null }
  async identities() { return this.ids }
  async unlinkIdentity(_t: string, id: string) { this.rec("unlinkIdentity", id); return null }
  async signOutEverywhere() { this.rec("signOutEverywhere"); return null }
  async deleteUser(id: string) { this.rec("deleteUser", id); return null }
  async getUser(id: string) { return this.users.find((u) => u.id === id) ?? null }
  async setBanned(id: string, b: boolean) { this.rec("setBanned", id, b); return null }
  async recoveryLink(email: string) { this.rec("recoveryLink", email); return { link: "https://proyecto-prueba.supabase.co/auth/v1/verify?token=abc" } }
  async inviteUser(email: string) { this.rec("inviteUser", email); return null }
  async listUsers() { return this.users }
}

export class FakeAdminRepo extends AdminRepo {
  audits: { actor: string; accion: string; objetivo: string | null; detalle: Record<string, unknown> }[] = []
  admins = [{ user_id: USERS.owner, created_at: "2026-01-01T00:00:00Z" }]
  notices: Notice[] = []
  subs: SubRow[] = []
  pays: PayRow[] = [{ id: crypto.randomUUID(), household_id: H_PREMIUM, plan: "premium", proveedor: "wompi", referencia: "mirai-1", periodo: "mes", monto: 14900, estado: "aprobado", metodo: "NEQUI", pagador: "owner@correo.co", paid_at: now(), created_at: now(), factura_ref: null, cupon: null }]
  members: AdminMember[] = [
    { household_id: H_GRATIS, user_id: USERS.owner, role: "owner", access_role: "owner", households: { id: H_GRATIS, nombre: "Familia Pérez", created_at: "2026-01-01T00:00:00Z" } },
    { household_id: H_GRATIS, user_id: USERS.editor, role: "editor", access_role: "editor", households: { id: H_GRATIS, nombre: "Familia Pérez", created_at: "2026-01-01T00:00:00Z" } },
  ]
  async audit(_s: DbScope, row: { actor: string; accion: string; objetivo: string | null; detalle: Record<string, unknown> }) { this.audits.push(row) }
  async memberships(_s: DbScope, o: { userId?: string; householdIds?: string[] } = {}) { return this.members.filter((m) => (!o.userId || m.user_id === o.userId) && (!o.householdIds || o.householdIds.includes(m.household_id))) }
  async profiles(_s: DbScope, ids?: string[]): Promise<ProfileRow[]> { return Object.entries(USERS).filter(([, id]) => !ids || ids.includes(id)).map(([r, id]) => ({ id, nombre: r, email: `${r}@correo.co`, avatar_url: null, telefono: null })) }
  async profileDetail() { return { nombre: "Ana", apodo: "ana", email: "owner@correo.co", telefono: null, ciudad: "Bogotá", doc_tipo: "CC", doc: "1020304050", trabajo: null, ocupacion: null, avatar_url: null, created_at: "2026-01-01T00:00:00Z", deletion_requested_at: null } }
  async activity(): Promise<AuditActivity[]> { return [{ created_at: now(), actor: USERS.owner, tabla: "expenses", accion: "insert", household_id: H_GRATIS }] }
  async feedbackOf() { return [{ id: crypto.randomUUID(), user_id: USERS.editor, household_id: null, tipo: "calificacion", rating: 5, mensaje: "¡Me encanta!", estado: "nuevo", pagina: null, captura: null, contexto: {}, respuesta: null, respondido_at: null, respondido_por: null, created_at: now(), updated_at: now() }] }
  async notes() { return [] }
  async addNote() { return crypto.randomUUID() }
  async deleteNote() {}
  async platformAdmins() { return this.admins }
  async setPlatformAdmin(_s: DbScope, u: string, on: boolean) { this.admins = on ? [...this.admins, { user_id: u, created_at: now() }] : this.admins.filter((a) => a.user_id !== u) }
  async households() { return [{ id: H_GRATIS, nombre: "Familia Pérez", created_at: "2026-01-01T00:00:00Z" }] }
  async books() { return [{ id: crypto.randomUUID(), household_id: H_GRATIS, nombre: "Casa", tipo: "personal", deleted_at: null }] }
  async householdPlan(_s: DbScope, h: string) { return h === H_PREMIUM ? "premium" : "gratis" }
  async deleteHousehold() {}
  async countBooks() { return 1 }
  async plan() { return { nombre: "Premium", precio_mes: 14900, precio_anio: 149000 } }
  async subscriptions() { return this.subs }
  async subscription(_s: DbScope, id: string) { return this.subs.find((s) => s.id === id) ?? null }
  async insertSubscription() {}
  async updateSubscription(_s: DbScope, id: string, p: Partial<SubRow>) { const s = this.subs.find((x) => x.id === id); if (s) Object.assign(s, p) }
  async endCourtesy() {}
  async payments() { return this.pays }
  async updatePayment() {}
  async owners() { return [USERS.owner] }
  async notify(_s: DbScope, rows: Notice[]) { this.notices.push(...rows) }
  async insertBroadcast() {}
  async auditLog() { return this.audits.map((a, i) => ({ id: i + 1, ...a, detalle: a.detalle as never, created_at: now() })) }
  async settings() { return { id: true, registro_abierto: true } }
  async saveSettings() {}
  async migrations() { return [{ name: "20261103003800_api_idempotency.sql", applied_at: now() }] }
  async orphanCount() { return 0 }
  async deleteOrphans() { return 2 }
  async referralCounts() { return { total: 3, premiados: 1 } }
  async adsenseMode() { return null }
  updatedFeedback: { scope: DbScope["kind"]; id: string }[] = []
  async updateFeedback(scope: UserScope, id: string) { this.updatedFeedback.push({ scope: scope.kind, id }) }
  async signedFeedbackUrls() { return new Map<string, string>() }
  async notifyLog() { return [{ id: 1, user_id: USERS.owner, household_id: null, book_id: null, channel: "email", kind: "prueba_admin", provider: "resend", source: "plataforma", status: "enviado", destino: "ow•••@correo.co", error: null, ref: null, dedupe: null, created_at: now() }] }
  async whatsappTo() { return "573151234567" }
}

export class FakeAccountantRepo extends AccountantRepo {
  shares: (ShareRow & { token_hash: string })[] = []
  planOf: Record<string, PlanRow> = {}
  views: string[] = []
  notes_: { id: string; share_id: string; autor: string; texto: string; created_at: string }[] = []
  visible = new Set<string>()
  async shareByHash(_s: DbScope, h: string) { return this.shares.find((s) => s.token_hash === h) ?? null }
  async ownerName() { return "Ana" }
  async bookPlan(_s: DbScope, bookId: string) { return bookId in this.planOf ? { plan: this.planOf[bookId] } : null }
  async countView(_s: DbScope, s: { id: string }) { this.views.push(s.id) }
  async renta(): Promise<RentaData> {
    return { book: { expenses: [{ id: "g1", fecha: "2020-03-01", valor: 1, descripcion: "viejo" }, { id: "g2", fecha: `${new Date().getFullYear()}-01-15`, valor: 1, descripcion: "nuevo" }] }, members: [], bienes: [], years: [], settings: { uvt: {}, smmlv: {} }, perfil: { nombre: "Ana", digitos: "", doc: "" }, fechas: [], attachments: [], liabilitiesNamed: [] } as unknown as RentaData
  }
  async notes(_s: DbScope, shareId: string) { return this.notes_.filter((n) => n.share_id === shareId) }
  async addNote(_s: DbScope, n: { share_id: string; texto: string }) { this.notes_.push({ id: crypto.randomUUID(), autor: "contador", created_at: now(), ...n }) }
  async visibleAttachment(_s: DbScope, _b: string, path: string) { return this.visible.has(path) }
  async signedUrl(_s: DbScope, path: string) { return `https://storage.test/${path}?token=firmado` }
}

export class FakePurge extends StoragePurge {
  households: string[] = []
  users: string[] = []
  async household(h: string) { this.households.push(h); return 0 }
  async user(u: string) { this.users.push(u); return 0 }
}

export class SpyMessenger extends NoChannelMessenger {
  emails: { m: InviteMsg; to: string }[] = []
  transfers: { m: TransferMail; to: string | null | undefined }[] = []
  async inviteEmail(m: InviteMsg, to: string): Promise<ChannelResult> { this.emails.push({ m, to }); return super.inviteEmail(m, to) }
  async transferEmail(m: TransferMail, to: string | null | undefined) { this.transfers.push({ m, to }); return super.transferEmail(m, to) }
}

export class FakeMailer extends PlatformMailer {
  on = false
  sent: PlatformMail[] = []
  async available() { return this.on }
  async send(m: PlatformMail) { this.sent.push(m); return "ref-1" }
}
