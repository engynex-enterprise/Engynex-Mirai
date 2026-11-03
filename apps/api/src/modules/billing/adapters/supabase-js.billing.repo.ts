// Mismas consultas que apps/web/lib/payments/apply.ts, features/planes/actions.ts y app/api/pagos/*, con la clave del
// sistema (SystemScope). (Cloud SQL, fase 4: adaptador pg-kysely con las mismas firmas.)
import { Injectable } from "@nestjs/common"
import type { Json } from "@mirai/db"
import type { ApplyResult } from "@mirai/domain/billing"
import type { Coupon } from "@mirai/domain/plans"
import type { DbScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { DomainError } from "../../../core/errors/domain-error"
import { BillingRepo, type ApplyArgs, type PlanPrice, type Renewal } from "../billing.repository"

type PgErr = { code?: string; message?: string } | null
/** Datos de la respuesta o DomainError (fromPg) si PostgREST devolvió error. */
const must = <R extends { data: unknown; error: PgErr }>(r: R): R["data"] => {
  if (r.error) throw DomainError.fromPg(r.error)
  return r.data
}

@Injectable()
export class SupabaseJsBillingRepo extends BillingRepo {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }
  private db(scope: DbScope) {
    return this.sb.for(scope)
  }

  async plan(scope: DbScope, planId: string): Promise<PlanPrice | null> {
    return must(await this.db(scope).from("plans").select("nombre,precio_mes,precio_anio,activo").eq("id", planId).maybeSingle())
  }
  async coupon(scope: DbScope, codigo: string) {
    return must(await this.db(scope).from("coupons").select("*").eq("codigo", codigo).maybeSingle()) as Coupon | null
  }
  async subscriptionByRef(scope: DbScope, proveedor: string, ref: string) {
    return must(await this.db(scope).from("plan_subscriptions").select("id").eq("proveedor", proveedor).eq("proveedor_ref", ref).maybeSingle())
  }
  async insertSubscription(scope: DbScope, row: { household_id: string; plan: string; proveedor: string; proveedor_ref: string; periodo: string; estado: string; created_by?: string | null }) {
    must(await this.db(scope).from("plan_subscriptions").insert(row))
  }
  async setSubscriptionState(scope: DbScope, id: string, estado: string) {
    must(await this.db(scope).from("plan_subscriptions").update({ estado }).eq("id", id))
  }
  async renewals(scope: DbScope, householdId: string, createdBy?: string): Promise<Renewal[]> {
    let q = this.db(scope).from("plan_subscriptions").select("id,proveedor_ref,vence_at,created_by").eq("household_id", householdId).eq("proveedor", "mercadopago").in("estado", ["activa", "pendiente"])
    if (createdBy) q = q.eq("created_by", createdBy)
    return must(await q) ?? []
  }
  async insertPendingPayment(scope: DbScope, row: { household_id: string; proveedor: string; referencia: string; periodo: string; plan: string; cupon: string | null; monto: number; estado: string; pagador: string | null }) {
    must(await this.db(scope).from("plan_payments").insert(row))
  }
  async paymentByRef(scope: DbScope, proveedor: string, referencia: string) {
    return must(await this.db(scope).from("plan_payments").select("household_id,periodo,monto,plan,cupon").eq("proveedor", proveedor).eq("referencia", referencia).maybeSingle())
  }
  async applyPlanPayment(scope: DbScope, p: ApplyArgs): Promise<ApplyResult> {
    const { data, error } = await this.db(scope).rpc("apply_plan_payment", {
      p_household: p.householdId, p_proveedor: p.proveedor, p_referencia: p.referencia, p_periodo: p.periodo, p_monto: Math.round(p.monto), p_estado: p.estado,
      p_metodo: p.metodo ?? undefined, p_pagador: p.pagador ?? undefined, p_raw: (p.raw ?? {}) as Json, p_subscription_ref: p.subscriptionRef ?? undefined,
      p_plan: p.plan, p_cupon: p.cupon ?? undefined, p_nota: p.nota ?? undefined,
    })
    if (error) throw DomainError.fromPg(error)
    return data as unknown as ApplyResult
  }
  async owners(scope: DbScope, householdId: string) {
    return (must(await this.db(scope).from("household_members").select("user_id").eq("household_id", householdId).eq("role", "owner")) ?? []).map((m) => m.user_id)
  }
  async notifyUsers(scope: DbScope, userIds: string[], n: { titulo: string; cuerpo: string; dedupe: string }) {
    if (!userIds.length) return
    must(await this.db(scope).from("notifications").upsert(userIds.map((user_id) => ({ user_id, kind: "plan", titulo: n.titulo, cuerpo: n.cuerpo, href: "/ajustes?tab=plan", dedupe: n.dedupe })), { onConflict: "user_id,dedupe", ignoreDuplicates: true }))
  }
}
