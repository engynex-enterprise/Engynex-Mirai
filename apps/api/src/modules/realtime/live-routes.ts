// A qué sala y con qué evento va cada cambio (puro, sin socket.io: lo prueban las unitarias).
// Equivalencias con Supabase Realtime (apps/web/hooks/use-realtime.ts y features/automations/runner.tsx):
//   LIVE_TABLES (filtro book_id)            → sala book:{id}         evento `change`
//   HOUSEHOLD_TABLES (filtro household_id)  → sala household:{id}    evento `change`
//   notifications (filtro user_id)          → sala user:{id}         evento `notification`
//   automation_events INSERT (canal auto:)  → sala book:{id}         evento `automation`
import { ACCESS_ROLES, ROLE_RANK, type AccessRole } from "@mirai/domain/household/roles"
import { HOUSEHOLD_TABLES, isLiveTable, type HouseholdTable, type LiveChange } from "@mirai/contracts/live"
import { AUTOMATION_TABLE, LIVE_MIN_ROLE, rooms, type PgLiveNotify, type ServerToClientEvents } from "@mirai/contracts/modules/realtime"

export type DeliveryEvent = "change" | "notification" | "automation"
export type Delivery = {
  rooms: string[]
  event: DeliveryEvent
  payload: Parameters<ServerToClientEvents[DeliveryEvent]>[0]
}
export type Routed = { deliveries: Delivery[]; /** Cambió quién está en el hogar: revisar membresía y rol. */ revalidateHousehold?: string }

const isHouseholdTable = (t: string): t is HouseholdTable => (HOUSEHOLD_TABLES as readonly string[]).includes(t)

/** Salas del libro que reciben un evento según el rol mínimo (sin mínimo = toda la sala del libro). */
export function roomsFor(bookId: string, min?: AccessRole): string[] {
  if (!min || min === "viewer") return [rooms.book(bookId)]
  return ACCESS_ROLES.filter((r) => ROLE_RANK[r] >= ROLE_RANK[min]).map((r) => rooms.bookRole(bookId, r))
}

/** Cambio de la API (EventsService) o del trigger (ya traducido a LiveChange). */
export function routeChange(c: LiveChange, minRole: typeof LIVE_MIN_ROLE = LIVE_MIN_ROLE): Routed {
  if (isLiveTable(c.table) && c.bookId) {
    return { deliveries: [{ rooms: roomsFor(c.bookId, minRole[c.table]), event: "change", payload: { table: c.table, bookId: c.bookId, id: c.id, op: c.op } }] }
  }
  if (isHouseholdTable(c.table) && c.householdId) {
    return {
      deliveries: [{ rooms: [rooms.household(c.householdId)], event: "change", payload: { table: c.table, householdId: c.householdId, id: c.id, op: c.op } }],
      revalidateHousehold: c.table === "household_members" ? c.householdId : undefined,
    }
  }
  return { deliveries: [] }
}

/** Aviso de pg_notify (`mirai_live`). */
export function routeNotify(n: PgLiveNotify, minRole: typeof LIVE_MIN_ROLE = LIVE_MIN_ROLE): Routed {
  if (n.t === "notifications") return n.u ? { deliveries: [{ rooms: [rooms.user(n.u)], event: "notification", payload: { id: n.id, op: n.op } }] } : { deliveries: [] }
  if (n.t === AUTOMATION_TABLE) {
    if (n.op !== "INSERT" || !n.b) return { deliveries: [] }
    return { deliveries: [{ rooms: roomsFor(n.b, minRole.automation), event: "automation", payload: { bookId: n.b, id: n.id } }] }
  }
  return routeChange({ table: n.t, bookId: n.b, householdId: n.h, id: n.id, op: n.op }, minRole)
}
