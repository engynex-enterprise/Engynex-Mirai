import type { AccessRole } from "@/lib/household/roles"
import type { AccountEvent, AccountState } from "@/lib/account/account"

export type SessionRow = { id: string; created_at: string; last_active: string | null; user_agent: string | null; ip: string | null; aal: string | null; actual: boolean }
export type TransferView = { id: string; householdId: string; hogar: string; de: string; para: string; fromRole: AccessRole; planAction: "seguir" | "cancelar"; expiresAt: string; createdAt: string }
export type MyHousehold = { id: string; nombre: string; access: AccessRole; active: boolean; personas: number; firstBook: string | null; outgoing: TransferView | null }
export type AccountData = { account: AccountState; sessions: SessionRow[]; events: AccountEvent[]; households: MyHousehold[]; incoming: TransferView[] }
export type TransferPerson = { userId: string; nombre: string; email: string | null; avatar: string | null; access: AccessRole; ok: boolean }
export type TransferCandidates = { ok: boolean; msg: string; people: TransferPerson[]; tienePago: boolean; hogar: string }
