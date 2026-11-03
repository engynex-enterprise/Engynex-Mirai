// Puerto de billing. Todo va con SystemScope (en la web es supabaseAdmin()): precios, cupones, suscripciones y pagos
// del plan solo los escriben la API (checkout del dueño, ya revisado) y los webhooks con la firma verificada.
import type { Coupon } from "@mirai/domain/plans"
import type { ApplyResult, PayState, Periodo, Proveedor } from "@mirai/domain/billing"
import type { DbScope } from "../../core/db/scope"

export type PlanPrice = { nombre: string; precio_mes: number; precio_anio: number; activo: boolean }
export type Renewal = { id: string; proveedor_ref: string | null; vence_at: string | null; created_by: string | null }
export type ApplyArgs = {
  householdId: string; proveedor: Proveedor; referencia: string; periodo: Periodo; monto: number; estado: PayState
  metodo?: string | null; pagador?: string | null; raw?: unknown; subscriptionRef?: string | null; plan: string; cupon?: string | null; nota?: string | null
}

export abstract class BillingRepo {
  abstract plan(scope: DbScope, planId: string): Promise<PlanPrice | null>
  abstract coupon(scope: DbScope, codigo: string): Promise<Coupon | null>
  /** Suscripción de Mercado Pago por su id en la pasarela. */
  abstract subscriptionByRef(scope: DbScope, proveedor: string, ref: string): Promise<{ id: string } | null>
  abstract insertSubscription(scope: DbScope, row: { household_id: string; plan: string; proveedor: string; proveedor_ref: string; periodo: string; estado: string; created_by?: string | null }): Promise<void>
  abstract setSubscriptionState(scope: DbScope, id: string, estado: string): Promise<void>
  /** Renovaciones automáticas (Mercado Pago, activas o pendientes) del hogar; con `createdBy`, solo las de esa persona. */
  abstract renewals(scope: DbScope, householdId: string, createdBy?: string): Promise<Renewal[]>
  /** Pago de Wompi guardado ANTES de pagar (referencia, plan y monto). */
  abstract insertPendingPayment(scope: DbScope, row: { household_id: string; proveedor: string; referencia: string; periodo: string; plan: string; cupon: string | null; monto: number; estado: string; pagador: string | null }): Promise<void>
  abstract paymentByRef(scope: DbScope, proveedor: string, referencia: string): Promise<{ household_id: string | null; periodo: string | null; monto: number; plan: string | null; cupon: string | null } | null>
  /** RPC apply_plan_payment: UNA transacción con candado por referencia y por hogar (idempotente). */
  abstract applyPlanPayment(scope: DbScope, a: ApplyArgs): Promise<ApplyResult>
  abstract owners(scope: DbScope, householdId: string): Promise<string[]>
  /** Aviso en la app; `dedupe` evita repetidos (upsert ignorando duplicados). */
  abstract notifyUsers(scope: DbScope, userIds: string[], n: { titulo: string; cuerpo: string; dedupe: string }): Promise<void>
}
