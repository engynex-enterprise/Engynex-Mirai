// Puerto de account. Con UserScope: las funciones SQL de la cuenta (my_account, my_sessions, revoke_my_session,
// remove_my_password, ensure_email_identity, cancel_my_email_change) que leen el esquema `auth` con auth.uid().
// Con SystemScope: lo que la web hace con supabaseAdmin() (personas de otros hogares, actividad, borrar hogares).
import type { SessionRow } from "@mirai/contracts/modules/account"
import type { AccountEvent, AccountState } from "@mirai/domain/account"
import type { DbScope, UserScope } from "../../core/db/scope"

export type AccountRpc = "remove_my_password" | "ensure_email_identity" | "cancel_my_email_change" | "revoke_my_session"

export abstract class AccountRepo {
  abstract myAccount(scope: UserScope): Promise<AccountState | null>
  abstract mySessions(scope: UserScope): Promise<SessionRow[]>
  abstract myEvents(scope: UserScope, limit: number): Promise<AccountEvent[]>
  /** RPC de la cuenta; devuelve su resultado (booleano en revoke/cancel). */
  abstract rpc(scope: UserScope, fn: AccountRpc, args?: Record<string, unknown>): Promise<unknown>
  abstract membersOf(scope: DbScope, householdIds: string[]): Promise<{ household_id: string; user_id: string; role?: string; access_role?: string | null }[]>
  abstract myMemberships(scope: DbScope, userId: string): Promise<{ household_id: string; role: string; access_role: string | null }[]>
  abstract deleteHousehold(scope: DbScope, householdId: string): Promise<void>
}
