// Mismas consultas que features/admin/server.ts y features/admin/actions.ts de apps/web (clave del sistema).
import { Injectable } from "@nestjs/common"
import type { DbScope, UserScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { DomainError } from "../../../core/errors/domain-error"
import { AdminRepo, type AuditActivity, type MemberRow, type Notice, type PayRow, type ProfileRow, type SubRow } from "../admin.repository"

type PgErr = { code?: string; message?: string } | null
const must = <R extends { data: unknown; error: PgErr }>(r: R): R["data"] => {
  if (r.error) throw DomainError.fromPg(r.error)
  return r.data
}

@Injectable()
export class SupabaseJsAdminRepo extends AdminRepo {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }
  private db(scope: DbScope) {
    return this.sb.for(scope)
  }

  async audit(scope: DbScope, row: { actor: string; accion: string; objetivo: string | null; detalle: Record<string, unknown> }) {
    must(await this.db(scope).from("admin_audit").insert({ ...row, detalle: row.detalle as never }))
  }

  async memberships(scope: DbScope, o: { userId?: string; householdIds?: string[] } = {}): Promise<MemberRow[]> {
    let q = this.db(scope).from("household_members").select("household_id,user_id,role,access_role,households(id,nombre,created_at)")
    if (o.userId) q = q.eq("user_id", o.userId)
    if (o.householdIds) q = q.in("household_id", o.householdIds)
    return (must(await q) ?? []) as unknown as MemberRow[]
  }
  async profiles(scope: DbScope, ids?: string[]): Promise<ProfileRow[]> {
    if (ids && !ids.length) return []
    let q = this.db(scope).from("profiles").select("id,nombre,email,avatar_url,telefono")
    if (ids) q = q.in("id", ids)
    return must(await q) ?? []
  }
  async profileDetail(scope: DbScope, userId: string) {
    return must(await this.db(scope).from("profiles").select("nombre,apodo,email,telefono,ciudad,doc_tipo,doc,trabajo,ocupacion,avatar_url,created_at,deletion_requested_at").eq("id", userId).maybeSingle()) as Record<string, string | null> | null
  }
  async activity(scope: DbScope, o: { sinceIso: string; actor?: string; limit: number }): Promise<AuditActivity[]> {
    let q = this.db(scope).from("audit_log").select("created_at,actor,tabla,accion,household_id").gte("created_at", o.sinceIso)
    if (o.actor) q = q.eq("actor", o.actor)
    return (must(await q.order("created_at", { ascending: false }).limit(o.limit)) ?? []) as AuditActivity[]
  }
  async feedbackOf(scope: DbScope, o: { userId?: string; limit: number }) {
    let q = this.db(scope).from("feedback").select("*")
    if (o.userId) q = q.eq("user_id", o.userId)
    return (must(await q.order("created_at", { ascending: false }).limit(o.limit)) ?? []) as Record<string, unknown>[]
  }
  async notes(scope: DbScope, userId: string) {
    return must(await this.db(scope).from("admin_notes").select("id,texto,autor,created_at").eq("user_id", userId).order("created_at", { ascending: false })) ?? []
  }
  async addNote(scope: DbScope, n: { user_id: string; texto: string; autor: string }) {
    return must(await this.db(scope).from("admin_notes").insert(n).select("id").single())!.id
  }
  async deleteNote(scope: DbScope, id: string) {
    must(await this.db(scope).from("admin_notes").delete().eq("id", id))
  }
  async platformAdmins(scope: DbScope) {
    return must(await this.db(scope).from("platform_admins").select("user_id,created_at")) ?? []
  }
  async setPlatformAdmin(scope: DbScope, userId: string, on: boolean) {
    const db = this.db(scope)
    must(on ? await db.from("platform_admins").upsert({ user_id: userId }) : await db.from("platform_admins").delete().eq("user_id", userId))
  }
  async households(scope: DbScope, ids?: string[]) {
    if (ids && !ids.length) return []
    let q = this.db(scope).from("households").select("id,nombre,created_at")
    if (ids) q = q.in("id", ids)
    return must(await q) ?? []
  }
  async books(scope: DbScope, householdIds?: string[]) {
    if (householdIds && !householdIds.length) return []
    let q = this.db(scope).from("books").select("id,household_id,nombre,tipo,deleted_at")
    if (householdIds) q = q.in("household_id", householdIds)
    return must(await q) ?? []
  }
  async householdPlan(scope: DbScope, householdId: string) {
    const { data } = await this.db(scope).rpc("household_plan", { h: householdId })
    return (data as string | null) ?? "gratis"
  }
  async deleteHousehold(scope: DbScope, householdId: string) {
    must(await this.db(scope).from("households").delete().eq("id", householdId))
  }
  async countBooks(scope: DbScope) {
    const { count, error } = await this.db(scope).from("books").select("id", { count: "exact", head: true }).is("deleted_at", null)
    if (error) throw DomainError.fromPg(error)
    return count ?? 0
  }

  async plan(scope: DbScope, planId: string) {
    return must(await this.db(scope).from("plans").select("nombre,precio_mes,precio_anio").eq("id", planId).maybeSingle())
  }
  async subscriptions(scope: DbScope, o: { householdIds?: string[]; estados?: string[]; limit?: number } = {}): Promise<SubRow[]> {
    if (o.householdIds && !o.householdIds.length) return []
    let q = this.db(scope).from("plan_subscriptions").select("*")
    if (o.householdIds) q = q.in("household_id", o.householdIds)
    if (o.estados) q = q.in("estado", o.estados)
    q = q.order("created_at", { ascending: false })
    return (must(await (o.limit ? q.limit(o.limit) : q)) ?? []) as SubRow[]
  }
  async subscription(scope: DbScope, id: string) {
    return must(await this.db(scope).from("plan_subscriptions").select("*").eq("id", id).maybeSingle()) as SubRow | null
  }
  async insertSubscription(scope: DbScope, row: { household_id: string; plan?: string; proveedor: string; estado: string; periodo: string; vence_at: string; nota: string | null; created_by: string }) {
    must(await this.db(scope).from("plan_subscriptions").insert(row))
  }
  async updateSubscription(scope: DbScope, id: string, patch: Partial<Pick<SubRow, "vence_at" | "estado" | "plan">>) {
    must(await this.db(scope).from("plan_subscriptions").update(patch).eq("id", id))
  }
  async endCourtesy(scope: DbScope, householdId: string) {
    must(await this.db(scope).from("plan_subscriptions").update({ estado: "vencida", vence_at: new Date().toISOString() }).eq("household_id", householdId).eq("estado", "cortesia"))
  }
  async payments(scope: DbScope, o: { householdIds?: string[]; limit?: number } = {}): Promise<PayRow[]> {
    if (o.householdIds && !o.householdIds.length) return []
    let q = this.db(scope).from("plan_payments").select("id,household_id,plan,proveedor,referencia,periodo,monto,estado,metodo,pagador,paid_at,created_at,factura_ref,cupon")
    if (o.householdIds) q = q.in("household_id", o.householdIds)
    return (must(await q.order("created_at", { ascending: false }).limit(o.limit ?? 500)) ?? []) as PayRow[]
  }
  async updatePayment(scope: DbScope, id: string, patch: { estado?: string; factura_ref?: string; nota?: string }) {
    must(await this.db(scope).from("plan_payments").update(patch).eq("id", id))
  }
  async owners(scope: DbScope, householdId: string) {
    return (must(await this.db(scope).from("household_members").select("user_id").eq("household_id", householdId).eq("role", "owner")) ?? []).map((o) => o.user_id)
  }
  async notify(scope: DbScope, rows: Notice[]) {
    for (let i = 0; i < rows.length; i += 500) must(await this.db(scope).from("notifications").insert(rows.slice(i, i + 500)))
  }

  async insertBroadcast(scope: DbScope, b: { titulo: string; cuerpo: string; href: string | null; segmento: string; enviados: number; created_by: string }) {
    must(await this.db(scope).from("broadcasts").insert(b))
  }
  async auditLog(scope: DbScope, limit: number) {
    return must(await this.db(scope).from("admin_audit").select("*").order("created_at", { ascending: false }).limit(limit)) ?? []
  }
  async settings(scope: DbScope) {
    return must(await this.db(scope).from("platform_settings").select("*").single()) as Record<string, unknown> | null
  }
  async saveSettings(scope: DbScope, patch: Record<string, unknown>) {
    must(await this.db(scope).from("platform_settings").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", true))
  }
  async migrations(scope: DbScope) {
    const { data } = await this.db(scope).rpc("admin_migrations")
    return (data ?? []) as { name: string; applied_at: string }[]
  }
  async orphanCount(scope: DbScope) {
    const { data } = await this.db(scope).rpc("count_orphan_households")
    return Number(data ?? 0)
  }
  async deleteOrphans(scope: DbScope) {
    const { data, error } = await this.db(scope).rpc("delete_orphan_households")
    if (error) throw DomainError.fromPg(error)
    return Number(data ?? 0)
  }
  async referralCounts(scope: DbScope) {
    const db = this.db(scope)
    const [a, b] = await Promise.all([db.from("referrals").select("id", { count: "exact", head: true }), db.from("referrals").select("id", { count: "exact", head: true }).eq("estado", "recompensado")])
    return { total: a.count ?? 0, premiados: b.count ?? 0 }
  }
  async adsenseMode(scope: DbScope) {
    return must(await this.db(scope).from("platform_integrations").select("modo").eq("kind", "adsense").maybeSingle())?.modo ?? null
  }
  async updateFeedback(scope: UserScope, id: string, patch: { estado?: string; respuesta?: string }) {
    must(await this.db(scope).from("feedback").update(patch).eq("id", id))
  }
  async signedFeedbackUrls(scope: DbScope, paths: string[], seconds: number): Promise<Map<string, string>> {
    if (!paths.length) return new Map()
    const { data } = await this.db(scope).storage.from("feedback").createSignedUrls(paths, seconds)
    const out = new Map<string, string>()
    for (const s of data ?? []) if (s.path && s.signedUrl) out.set(s.path, s.signedUrl)
    return out
  }
  async notifyLog(scope: DbScope, limit: number) {
    return (must(await this.db(scope).from("notification_log").select("*").order("created_at", { ascending: false }).limit(limit)) ?? []) as Record<string, unknown>[]
  }
  async whatsappTo(scope: DbScope, userId: string) {
    return must(await this.db(scope).from("notification_rules").select("whatsapp_to").eq("user_id", userId).not("whatsapp_to", "is", null).limit(1).maybeSingle())?.whatsapp_to ?? null
  }
}
