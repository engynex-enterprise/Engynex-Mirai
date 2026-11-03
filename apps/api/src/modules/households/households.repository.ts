// Puerto del módulo households (§2.1). Cada método recibe el alcance:
// - UserScope (JWT de la persona): RPC con reglas en la base (roles, aceptar, pasar el hogar) y lo que debe quedar en
//   la auditoría con su nombre (integrantes). La RLS vuelve a revisar.
// - SystemScope: lo que la web hace con supabaseAdmin() (invitaciones, listas del hogar, perfiles de los demás).
import type { Row } from "@mirai/db/tables"
import type { LastResult } from "@mirai/domain/household/invites"
import type { TransferRow } from "@mirai/domain/household/transfer"
import type { PlanRow } from "@mirai/domain/app-context"
import type { DbScope, UserScope } from "../../core/db/scope"

export type InvRow = {
  id: string; household_id: string; email: string | null; phone: string | null; role: string; access_role: string | null; nombre: string | null; parentesco: string | null
  family_member_id: string | null; token_enc: string | null; expires_at: string; created_at: string; accepted_at: string | null; canceled_at: string | null
  last_sent_at: string | null; sends_day: string | null; sends_today: number; sent_count: number; last_result: unknown; invited_by: string | null
}
export const INV_COLS = "id,household_id,email,phone,role,access_role,nombre,parentesco,family_member_id,token_enc,expires_at,created_at,accepted_at,canceled_at,last_sent_at,sends_day,sends_today,sent_count,last_result,invited_by"

export type MemberRow = { user_id: string; role: string; access_role: string | null; created_at?: string }
export type ProfileLite = { id: string; nombre: string | null; apodo?: string | null; email: string | null; avatar_url?: string | null; telefono?: string | null }
export type FamilyRow = Row<"family_members">
export type NewInvitation = {
  household_id: string; email: string | null; phone: string | null; access_role: string; role: string; nombre: string | null; parentesco: string | null
  family_member_id: string | null; token_hash: string; token_enc: string | null; invited_by: string; expires_at: string
}
export type InvitationPatch = Partial<Pick<InvRow, "expires_at" | "token_enc" | "last_sent_at" | "sends_day" | "sends_today" | "sent_count">> & { token_hash?: string; last_result?: LastResult; canceled_at?: string; canceled_by?: string }
export type FamilyInput = { nombre: string; rol: string; avatar: string; nacimiento: string | null; cupo: number }
export type HouseholdRpc = "set_member_access" | "remove_household_member" | "transfer_household" | "link_family_member"
export type InvitationInfoRaw = { estado: string; hogar?: string; invita?: string; rol?: string; nombre?: string | null; vence?: string; ya_miembro?: boolean }
export type RespondResult = { estado: string; household_id: string; from_user?: string; plan_action?: string }
export type SendLog = { user_id: string; household_id: string; channel: string; kind: string; provider: string; source: string; status: string; destino: string }

export abstract class HouseholdsRepo {
  // ── Bienvenida y nombre ──
  abstract setProfileName(scope: UserScope, nombre: string): Promise<void>
  /** RPC create_household: crea el hogar, el libro y la persona como dueña. Devuelve el id del libro. */
  abstract createHousehold(scope: UserScope, hogar: string, libro: string): Promise<string>
  abstract rename(scope: DbScope, householdId: string, nombre: string): Promise<void>

  // ── Personas ──
  abstract members(scope: DbScope, householdId: string): Promise<MemberRow[]>
  abstract countMembers(scope: DbScope, householdId: string): Promise<number>
  abstract family(scope: DbScope, householdId: string): Promise<FamilyRow[]>
  abstract profiles(scope: DbScope, ids: string[]): Promise<ProfileLite[]>
  /** RPC con reglas de roles en la base (los RAISE ya vienen en español → VALIDATION con ese texto). */
  abstract rpc(scope: UserScope, fn: HouseholdRpc, args: Record<string, unknown>): Promise<void>
  /** Los accesos del contador que creó esa persona en el hogar dejan de servir. */
  abstract revokeAccountantShares(scope: DbScope, householdId: string, createdBy: string): Promise<void>

  // ── Invitaciones ──
  abstract pendingInvitations(scope: DbScope, householdId: string): Promise<InvRow[]>
  abstract pendingInvitation(scope: DbScope, householdId: string, id: string): Promise<InvRow | null>
  /** Inserta; si choca con otra pendiente al mismo destino (23505) lanza CONFLICT. */
  abstract insertInvitation(scope: DbScope, row: NewInvitation): Promise<InvRow>
  abstract updateInvitation(scope: DbScope, id: string, patch: InvitationPatch): Promise<void>
  abstract cancelFamilyInvitations(scope: DbScope, familyId: string, by: string): Promise<void>
  abstract householdOfToken(scope: DbScope, tokenHash: string): Promise<string | null>
  abstract planOf(scope: DbScope, householdId: string): Promise<PlanRow>
  abstract invitationInfo(scope: DbScope, token: string): Promise<InvitationInfoRaw | null>
  /** RPC accept_invitation (idempotente). Devuelve el hogar. */
  abstract acceptInvitation(scope: UserScope, token: string): Promise<string | null>
  /** Primer libro vivo del hogar (el predeterminado primero) y queda como último libro de la persona. */
  abstract openFirstBook(scope: UserScope, householdId: string): Promise<string | null>
  abstract logSend(scope: DbScope, row: SendLog): Promise<void>

  // ── Integrantes sin cuenta (con la sesión de la persona: auditoría) ──
  abstract saveFamily(scope: UserScope, householdId: string, id: string | null, row: FamilyInput): Promise<string | null>
  abstract familyMember(scope: UserScope, householdId: string, id: string): Promise<Pick<FamilyRow, "id" | "nombre" | "user_id" | "es_titular"> | null>
  abstract setFamilyDeleted(scope: UserScope, id: string, deleted: boolean): Promise<void>

  // ── Pasar el hogar, salir y borrar ──
  abstract requestTransfer(scope: UserScope, a: { householdId: string; userId: string; fromRole: string; planAction: string; confirm: string }): Promise<string>
  abstract respondTransfer(scope: UserScope, id: string, accept: boolean): Promise<RespondResult | null>
  abstract cancelTransfer(scope: UserScope, id: string): Promise<void>
  abstract pendingTransfers(scope: UserScope, userId: string): Promise<TransferRow[]>
  abstract householdNames(scope: DbScope, ids: string[]): Promise<{ id: string; nombre: string }[]>
  abstract deleteHousehold(scope: DbScope, householdId: string): Promise<void>
  abstract accountEvent(scope: DbScope, e: { user_id: string; kind: string; detail: Record<string, unknown>; ip: string | null; user_agent: string | null }): Promise<void>

  // ── Referidos (bienvenida) ──
  abstract referralOwner(scope: DbScope, codigo: string): Promise<string | null>
  abstract referralSettings(scope: DbScope): Promise<{ referidos_activo?: boolean | null; referidos_plan?: string | null; referidos_dias?: number | null } | null>
  abstract wasReferred(scope: DbScope, userId: string): Promise<boolean>
  abstract insertReferral(scope: DbScope, r: { referrer: string; referred: string; codigo: string }): Promise<string | null>
  abstract countRewarded(scope: DbScope, referrer: string): Promise<number>
  abstract ownHousehold(scope: DbScope, userId: string): Promise<string | null>
  abstract setReferral(scope: DbScope, id: string, patch: { estado: string; rewarded_at?: string }): Promise<void>
  abstract planName(scope: DbScope, planId: string): Promise<{ id: string; nombre: string } | null>
  abstract courtesy(scope: DbScope, householdId: string, plan: string): Promise<{ id: string; vence_at: string | null } | null>
  abstract setCourtesy(scope: DbScope, a: { id?: string; householdId: string; plan: string; vence: string; nota: string }): Promise<void>
  abstract notify(scope: DbScope, rows: { user_id: string; kind: string; titulo: string; cuerpo: string; href: string | null; dedupe: string }[]): Promise<void>
}
