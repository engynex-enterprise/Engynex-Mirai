// Mismas consultas que features/account/actions.ts y deleteAccount (features/data/actions.ts) de apps/web.
import { Injectable } from "@nestjs/common"
import type { SessionRow } from "@mirai/contracts/modules/account"
import type { AccountEvent, AccountState } from "@mirai/domain/account"
import type { DbScope, UserScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { DomainError } from "../../../core/errors/domain-error"
import { AccountRepo, type AccountRpc } from "../account.repository"

@Injectable()
export class SupabaseJsAccountRepo extends AccountRepo {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  async myAccount(scope: UserScope) {
    const { data } = await this.sb.for(scope).rpc("my_account")
    return (data as unknown as AccountState | null) ?? null
  }
  async mySessions(scope: UserScope) {
    const { data, error } = await this.sb.for(scope).rpc("my_sessions")
    if (error) throw DomainError.fromPg(error)
    return (data ?? []) as unknown as SessionRow[]
  }
  async myEvents(scope: UserScope, limit: number) {
    const { data, error } = await this.sb.for(scope).from("account_events").select("id,kind,detail,created_at,ip,user_agent").eq("user_id", scope.userId).order("created_at", { ascending: false }).limit(limit)
    if (error) throw DomainError.fromPg(error)
    return (data ?? []) as AccountEvent[]
  }
  async rpc(scope: UserScope, fn: AccountRpc, args: Record<string, unknown> = {}) {
    const { data, error } = await this.sb.for(scope).rpc(fn as never, args as never)
    if (error) throw DomainError.fromPg(error)
    return data
  }
  async membersOf(scope: DbScope, householdIds: string[]) {
    if (!householdIds.length) return []
    const { data, error } = await this.sb.for(scope).from("household_members").select("household_id,user_id,role,access_role").in("household_id", householdIds)
    if (error) throw DomainError.fromPg(error)
    return data ?? []
  }
  async myMemberships(scope: DbScope, userId: string) {
    const { data, error } = await this.sb.for(scope).from("household_members").select("household_id,role,access_role").eq("user_id", userId)
    if (error) throw DomainError.fromPg(error)
    return data ?? []
  }
  async deleteHousehold(scope: DbScope, householdId: string) {
    const { error } = await this.sb.for(scope).from("households").delete().eq("id", householdId)
    if (error) throw DomainError.fromPg(error)
  }
}
