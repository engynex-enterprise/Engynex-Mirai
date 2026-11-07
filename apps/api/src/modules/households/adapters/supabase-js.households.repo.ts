// Adaptador de hoy (PostgREST). Mismas consultas que features/household/actions.ts, features/account/actions.ts,
// app/(onboarding)/bienvenida/actions.ts y lib/referidos.ts de apps/web. Con UserScope va el JWT de la persona.
// (Cloud SQL, fase 4: adaptador pg-kysely con las mismas firmas; hoy el módulo registra solo este.)
import { Injectable } from "@nestjs/common"
import type { PlanRow } from "@mirai/domain/app-context"
import type { TransferRow } from "@mirai/domain/household/transfer"
import type { DbScope, UserScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { DomainError } from "../../../core/errors/domain-error"
import {
  HouseholdsRepo, INV_COLS,
  type FamilyInput, type FamilyPatchRow, type FamilyRow, type HouseholdRpc, type InvitationInfoRaw, type InvitationPatch, type InvRow, type MemberRow, type NewInvitation, type ProfileLite, type RespondResult, type SendLog,
} from "../households.repository"

type PgErr = { code?: string; message?: string } | null
/** Datos de la respuesta o DomainError (fromPg) si PostgREST devolvió error. */
const must = <R extends { data: unknown; error: PgErr }>(r: R): R["data"] => {
  if (r.error) throw DomainError.fromPg(r.error)
  return r.data
}

@Injectable()
export class SupabaseJsHouseholdsRepo extends HouseholdsRepo {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }
  private db(scope: DbScope) {
    return this.sb.for(scope)
  }

  async setProfileName(scope: UserScope, nombre: string) {
    must(await this.db(scope).from("profiles").update({ nombre }).eq("id", scope.userId))
  }
  async createHousehold(scope: UserScope, hogar: string, libro: string) {
    const { data, error } = await this.db(scope).rpc("create_household", { p_nombre: hogar, p_libro: libro })
    if (error || !data) throw new DomainError("INTERNAL", "No pudimos crear tu hogar. Intenta de nuevo.", undefined, { cause: error })
    return data as string
  }
  async rename(scope: DbScope, householdId: string, nombre: string) {
    must(await this.db(scope).from("households").update({ nombre }).eq("id", householdId))
  }

  async members(scope: DbScope, householdId: string): Promise<MemberRow[]> {
    return must(await this.db(scope).from("household_members").select("user_id,role,access_role,created_at").eq("household_id", householdId).order("created_at")) ?? []
  }
  async countMembers(scope: DbScope, householdId: string) {
    const { count, error } = await this.db(scope).from("household_members").select("user_id", { count: "exact", head: true }).eq("household_id", householdId)
    if (error) throw DomainError.fromPg(error)
    return count ?? 0
  }
  async family(scope: DbScope, householdId: string): Promise<FamilyRow[]> {
    return must(await this.db(scope).from("family_members").select("*").eq("household_id", householdId).is("deleted_at", null).order("sort").order("created_at")) ?? []
  }
  async profiles(scope: DbScope, ids: string[]): Promise<ProfileLite[]> {
    if (!ids.length) return []
    return must(await this.db(scope).from("profiles").select("id,nombre,apodo,email,avatar_url,telefono").in("id", ids)) ?? []
  }
  async rpc(scope: UserScope, fn: HouseholdRpc, args: Record<string, unknown>) {
    const { error } = await this.db(scope).rpc(fn as never, args as never)
    if (error) throw DomainError.fromPg(error)
  }
  async revokeAccountantShares(scope: DbScope, householdId: string, createdBy: string) {
    const db = this.db(scope)
    const { data: bs } = await db.from("books").select("id").eq("household_id", householdId)
    if (bs?.length) must(await db.from("accountant_shares").update({ revoked_at: new Date().toISOString() }).in("book_id", bs.map((b) => b.id)).eq("created_by", createdBy).is("revoked_at", null))
  }

  async pendingInvitations(scope: DbScope, householdId: string): Promise<InvRow[]> {
    return (must(await this.db(scope).from("household_invitations").select(INV_COLS).eq("household_id", householdId).is("accepted_at", null).is("canceled_at", null).order("created_at", { ascending: false })) ?? []) as InvRow[]
  }
  async pendingInvitation(scope: DbScope, householdId: string, id: string): Promise<InvRow | null> {
    return must(await this.db(scope).from("household_invitations").select(INV_COLS).eq("id", id).eq("household_id", householdId).is("accepted_at", null).is("canceled_at", null).maybeSingle()) as InvRow | null
  }
  async insertInvitation(scope: DbScope, row: NewInvitation): Promise<InvRow> {
    const { data, error } = await this.db(scope).from("household_invitations").insert(row).select(INV_COLS).single()
    if (error?.code === "23505") throw DomainError.conflict("Ya hay una invitación pendiente para esa persona. Búscala en la lista y reenvíala.", { reason: "pendiente" })
    if (error || !data) throw DomainError.fromPg(error ?? { message: "sin fila" })
    return data as InvRow
  }
  async updateInvitation(scope: DbScope, id: string, patch: InvitationPatch) {
    must(await this.db(scope).from("household_invitations").update(patch as never).eq("id", id))
  }
  async cancelFamilyInvitations(scope: DbScope, familyId: string, by: string) {
    const now = new Date().toISOString()
    must(await this.db(scope).from("household_invitations").update({ canceled_at: now, canceled_by: by, expires_at: now }).eq("family_member_id", familyId).is("accepted_at", null).is("canceled_at", null))
  }
  async householdOfToken(scope: DbScope, tokenHash: string) {
    const r = must(await this.db(scope).from("household_invitations").select("household_id").eq("token_hash", tokenHash).is("accepted_at", null).is("canceled_at", null).maybeSingle())
    return r?.household_id ?? null
  }
  async planOf(scope: DbScope, householdId: string): Promise<PlanRow> {
    const db = this.db(scope)
    const { data: id } = await db.rpc("household_plan", { h: householdId })
    return must(await db.from("plans").select("id,nombre,funciones,anuncios,limites,precio_mes").eq("id", (id as string | null) ?? "gratis").maybeSingle())
  }
  async invitationInfo(scope: DbScope, token: string) {
    const { data } = await this.db(scope).rpc("invitation_info", { p_token: token })
    return (data as unknown as InvitationInfoRaw | null) ?? null
  }
  async acceptInvitation(scope: UserScope, token: string) {
    const { data, error } = await this.db(scope).rpc("accept_invitation", { p_token: token })
    if (error) {
      if (/venció|no existe/.test(error.message ?? "")) throw DomainError.notFound("La invitación no existe o ya venció. Pide una nueva.")
      throw DomainError.fromPg(error)
    }
    return (data as string | null) ?? null
  }
  async openFirstBook(scope: UserScope, householdId: string) {
    const db = this.db(scope)
    const { data: book } = await db.from("books").select("id").eq("household_id", householdId).is("deleted_at", null).order("is_default", { ascending: false }).order("created_at").limit(1).maybeSingle()
    if (!book) return null
    await db.from("profiles").update({ last_book_id: book.id }).eq("id", scope.userId)
    return book.id
  }
  async logSend(scope: DbScope, row: SendLog) {
    // Informativo: si falla, no se cae la acción (igual que logSend de la web).
    await this.db(scope).from("notification_log").insert(row as never)
  }

  async saveFamily(scope: UserScope, householdId: string, id: string | null, row: FamilyInput) {
    const db = this.db(scope)
    const r = id
      ? await db.from("family_members").update(row).eq("id", id).eq("household_id", householdId).select("id").maybeSingle()
      : await db.from("family_members").insert({ ...row, household_id: householdId }).select("id").single()
    return must(r)?.id ?? null
  }
  async familyMember(scope: UserScope, householdId: string, id: string) {
    return must(await this.db(scope).from("family_members").select("id,nombre,user_id,es_titular").eq("id", id).eq("household_id", householdId).maybeSingle())
  }
  async patchFamily(scope: UserScope, householdId: string, id: string, patch: FamilyPatchRow) {
    return must(await this.db(scope).from("family_members").update(patch).eq("id", id).eq("household_id", householdId).is("deleted_at", null).select("id").maybeSingle())?.id ?? null
  }
  async setFamilyDeleted(scope: UserScope, id: string, deleted: boolean) {
    must(await this.db(scope).from("family_members").update({ deleted_at: deleted ? new Date().toISOString() : null }).eq("id", id))
  }

  async requestTransfer(scope: UserScope, a: { householdId: string; userId: string; fromRole: string; planAction: string; confirm: string }) {
    const { data, error } = await this.db(scope).rpc("request_household_transfer", { p_household: a.householdId, p_user: a.userId, p_from_role: a.fromRole, p_plan_action: a.planAction, p_confirm: a.confirm })
    if (error || !data) throw DomainError.fromPg(error ?? { code: "P0001", message: "No pudimos pedir el cambio de dueño. Intenta de nuevo." })
    return data as string
  }
  async respondTransfer(scope: UserScope, id: string, accept: boolean) {
    const { data, error } = await this.db(scope).rpc("respond_household_transfer", { p_transfer: id, p_accept: accept })
    if (error) throw DomainError.fromPg(error)
    return (data as unknown as RespondResult | null) ?? null
  }
  async cancelTransfer(scope: UserScope, id: string) {
    const { error } = await this.db(scope).rpc("cancel_household_transfer", { p_transfer: id })
    if (error) throw DomainError.fromPg(error)
  }
  async pendingTransfers(scope: UserScope, userId: string): Promise<TransferRow[]> {
    return must(await this.db(scope).from("household_transfers").select("id,household_id,from_user,to_user,from_role,plan_action,status,expires_at,created_at").eq("status", "pendiente").or(`to_user.eq.${userId},from_user.eq.${userId}`)) ?? []
  }
  async householdNames(scope: DbScope, ids: string[]) {
    if (!ids.length) return []
    return must(await this.db(scope).from("households").select("id,nombre").in("id", ids)) ?? []
  }
  async deleteHousehold(scope: DbScope, householdId: string) {
    const { error } = await this.db(scope).from("households").delete().eq("id", householdId)
    if (error) throw new DomainError("INTERNAL", "No pudimos borrar el hogar. Intenta de nuevo.", undefined, { cause: error })
  }
  async accountEvent(scope: DbScope, e: { user_id: string; kind: string; detail: Record<string, unknown>; ip: string | null; user_agent: string | null }) {
    await this.db(scope).from("account_events").insert({ ...e, detail: e.detail as never })
  }

  async referralOwner(scope: DbScope, codigo: string) {
    return must(await this.db(scope).from("referral_codes").select("user_id").eq("codigo", codigo).maybeSingle())?.user_id ?? null
  }
  async referralSettings(scope: DbScope) {
    return must(await this.db(scope).from("platform_settings").select("referidos_activo,referidos_plan,referidos_dias").single())
  }
  async wasReferred(scope: DbScope, userId: string) {
    return !!must(await this.db(scope).from("referrals").select("id").eq("referred", userId).maybeSingle())
  }
  async insertReferral(scope: DbScope, r: { referrer: string; referred: string; codigo: string }) {
    const { data, error } = await this.db(scope).from("referrals").insert(r).select("id").single()
    return error || !data ? null : data.id
  }
  async countRewarded(scope: DbScope, referrer: string) {
    const { count } = await this.db(scope).from("referrals").select("id", { count: "exact", head: true }).eq("referrer", referrer).eq("estado", "recompensado")
    return count ?? 0
  }
  async ownHousehold(scope: DbScope, userId: string) {
    return must(await this.db(scope).from("household_members").select("household_id").eq("user_id", userId).eq("role", "owner").limit(1).maybeSingle())?.household_id ?? null
  }
  async setReferral(scope: DbScope, id: string, patch: { estado: string; rewarded_at?: string }) {
    must(await this.db(scope).from("referrals").update(patch).eq("id", id))
  }
  async planName(scope: DbScope, planId: string) {
    return must(await this.db(scope).from("plans").select("id,nombre").eq("id", planId).maybeSingle())
  }
  async courtesy(scope: DbScope, householdId: string, plan: string) {
    return must(await this.db(scope).from("plan_subscriptions").select("id,vence_at").eq("household_id", householdId).eq("estado", "cortesia").eq("plan", plan).gt("vence_at", new Date().toISOString()).order("vence_at", { ascending: false }).limit(1).maybeSingle())
  }
  async setCourtesy(scope: DbScope, a: { id?: string; householdId: string; plan: string; vence: string; nota: string }) {
    const db = this.db(scope)
    if (a.id) must(await db.from("plan_subscriptions").update({ vence_at: a.vence }).eq("id", a.id))
    else must(await db.from("plan_subscriptions").insert({ household_id: a.householdId, plan: a.plan, proveedor: "manual", estado: "cortesia", periodo: "mes", vence_at: a.vence, nota: a.nota }))
  }
  async notify(scope: DbScope, rows: { user_id: string; kind: string; titulo: string; cuerpo: string; href: string | null; dedupe: string }[]) {
    if (rows.length) must(await this.db(scope).from("notifications").insert(rows))
  }
}
