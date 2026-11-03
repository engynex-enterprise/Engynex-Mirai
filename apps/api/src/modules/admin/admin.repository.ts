// Puerto de la consola (F2-I-5). Todo con SystemScope (la web usa supabaseAdmin()) salvo responder opiniones, que va
// con la sesión del administrador para que la base registre quién respondió y le avise a la persona.
// Por privacidad NINGÚN método lee montos ni movimientos de los libros (gastos, ingresos, saldos…): solo cuentas,
// hogares, planes, pagos del plan a Mirai, auditoría y opiniones.
import type { Json } from "@mirai/db"
import type { DbScope, UserScope } from "../../core/db/scope"

export type SubRow = { id: string; household_id: string; plan: string; periodo: string; estado: string; proveedor: string; proveedor_ref: string | null; vence_at: string | null; nota: string | null; created_at: string; created_by: string | null; updated_at: string }
export type PayRow = { id: string; household_id: string | null; plan: string | null; proveedor: string; referencia: string; periodo: string | null; monto: number; estado: string; metodo: string | null; pagador: string | null; paid_at: string | null; created_at: string; factura_ref: string | null; cupon: string | null }
export type MemberRow = { household_id: string; user_id: string; role: string; access_role?: string | null; households?: { id?: string; nombre: string; created_at?: string } | null }
export type ProfileRow = { id: string; nombre: string | null; email: string | null; avatar_url?: string | null; telefono?: string | null }
export type AuditActivity = { created_at: string; actor: string | null; tabla: string; accion: string; household_id?: string | null }
export type Notice = { user_id: string; kind: string; titulo: string; cuerpo: string; href: string | null; dedupe: string }

export abstract class AdminRepo {
  abstract audit(scope: DbScope, row: { actor: string; accion: string; objetivo: string | null; detalle: Record<string, unknown> }): Promise<void>

  // Personas y hogares
  abstract memberships(scope: DbScope, o?: { userId?: string; householdIds?: string[] }): Promise<MemberRow[]>
  abstract profiles(scope: DbScope, ids?: string[]): Promise<ProfileRow[]>
  abstract profileDetail(scope: DbScope, userId: string): Promise<Record<string, string | null> | null>
  abstract activity(scope: DbScope, o: { sinceIso: string; actor?: string; limit: number }): Promise<AuditActivity[]>
  abstract feedbackOf(scope: DbScope, o: { userId?: string; limit: number }): Promise<Record<string, unknown>[]>
  abstract notes(scope: DbScope, userId: string): Promise<{ id: string; texto: string; autor: string | null; created_at: string }[]>
  abstract addNote(scope: DbScope, n: { user_id: string; texto: string; autor: string }): Promise<string>
  abstract deleteNote(scope: DbScope, id: string): Promise<void>
  abstract platformAdmins(scope: DbScope): Promise<{ user_id: string; created_at: string }[]>
  abstract setPlatformAdmin(scope: DbScope, userId: string, on: boolean): Promise<void>
  abstract households(scope: DbScope, ids?: string[]): Promise<{ id: string; nombre: string; created_at: string }[]>
  abstract books(scope: DbScope, householdIds?: string[]): Promise<{ id: string; household_id: string; nombre: string; tipo: string; deleted_at: string | null }[]>
  abstract householdPlan(scope: DbScope, householdId: string): Promise<string>
  abstract deleteHousehold(scope: DbScope, householdId: string): Promise<void>
  abstract countBooks(scope: DbScope): Promise<number>

  // Planes, suscripciones y pagos (lo que los hogares le pagan a Mirai)
  abstract plan(scope: DbScope, planId: string): Promise<{ nombre: string; precio_mes: number; precio_anio: number } | null>
  abstract subscriptions(scope: DbScope, o?: { householdIds?: string[]; estados?: string[]; limit?: number }): Promise<SubRow[]>
  abstract subscription(scope: DbScope, id: string): Promise<SubRow | null>
  abstract insertSubscription(scope: DbScope, row: { household_id: string; plan?: string; proveedor: string; estado: string; periodo: string; vence_at: string; nota: string | null; created_by: string }): Promise<void>
  abstract updateSubscription(scope: DbScope, id: string, patch: Partial<Pick<SubRow, "vence_at" | "estado" | "plan">>): Promise<void>
  abstract endCourtesy(scope: DbScope, householdId: string): Promise<void>
  abstract payments(scope: DbScope, o?: { householdIds?: string[]; limit?: number }): Promise<PayRow[]>
  abstract updatePayment(scope: DbScope, id: string, patch: { estado?: string; factura_ref?: string; nota?: string }): Promise<void>
  abstract owners(scope: DbScope, householdId: string): Promise<string[]>
  abstract notify(scope: DbScope, rows: Notice[]): Promise<void>

  // Comunicados, sistema, opiniones y envíos
  abstract insertBroadcast(scope: DbScope, b: { titulo: string; cuerpo: string; href: string | null; segmento: string; enviados: number; created_by: string }): Promise<void>
  abstract auditLog(scope: DbScope, limit: number): Promise<{ id: number; actor: string | null; accion: string; objetivo: string | null; detalle: Json; created_at: string }[]>
  abstract settings(scope: DbScope): Promise<Record<string, unknown> | null>
  abstract saveSettings(scope: DbScope, patch: Record<string, unknown>): Promise<void>
  abstract migrations(scope: DbScope): Promise<{ name: string; applied_at: string }[]>
  abstract orphanCount(scope: DbScope): Promise<number>
  abstract deleteOrphans(scope: DbScope): Promise<number>
  abstract referralCounts(scope: DbScope): Promise<{ total: number; premiados: number }>
  abstract adsenseMode(scope: DbScope): Promise<string | null>
  abstract updateFeedback(scope: UserScope, id: string, patch: { estado?: string; respuesta?: string }): Promise<void>
  abstract signedFeedbackUrls(scope: DbScope, paths: string[], seconds: number): Promise<Map<string, string>>
  abstract notifyLog(scope: DbScope, limit: number): Promise<Record<string, unknown>[]>
  abstract whatsappTo(scope: DbScope, userId: string): Promise<string | null>
}
