import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import type { Json } from "@/lib/supabase/database.types"
import { paymentNotice, type ApplyResult, type PayState, type Periodo, type Proveedor } from "@mirai/domain/billing"

export type { ApplyResult, PayState, Periodo, Proveedor }

/** Pasarelas configuradas en este despliegue (si faltan las llaves, los botones de pago se muestran deshabilitados). */
export const payConfig = () => ({
  mercadopago: !!process.env.MERCADOPAGO_ACCESS_TOKEN,
  wompi: !!(process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY && process.env.WOMPI_INTEGRITY_SECRET),
})

/** Precio vigente de un plan comprable (tabla plans, editable en la consola). */
export async function planPrice(planId: string, periodo: Periodo) {
  const { data } = await supabaseAdmin().from("plans").select("nombre,precio_mes,precio_anio,activo").eq("id", planId).maybeSingle()
  if (!data || !data.activo || !data.precio_mes) throw new Error("Ese plan no está disponible.")
  return { nombre: data.nombre, monto: periodo === "anio" ? data.precio_anio : data.precio_mes }
}

async function owners(householdId: string) {
  const { data } = await supabaseAdmin().from("household_members").select("user_id").eq("household_id", householdId).eq("role", "owner")
  return (data ?? []).map((m) => m.user_id)
}

/** Aviso en la app a los dueños del hogar. */
export async function notifyOwners(householdId: string, titulo: string, cuerpo: string, dedupe: string) {
  const ids = await owners(householdId)
  if (!ids.length) return
  await supabaseAdmin().from("notifications").upsert(ids.map((user_id) => ({ user_id, kind: "plan", titulo, cuerpo, href: "/ajustes?tab=plan", dedupe })), { onConflict: "user_id,dedupe", ignoreDuplicates: true })
}

/**
 * Registra un pago y, si quedó aprobado por primera vez, extiende el plan del hogar un mes o un año.
 * Todo pasa en UNA transacción de la base (apply_plan_payment, con candado por referencia y por hogar): dos
 * notificaciones simultáneas de la pasarela extienden una sola vez; un aviso viejo no retrocede el estado; el cupón
 * cuenta en el primer pago de la suscripción; un reembolso o una anulación quita el periodo.
 * Solo lo llaman los webhooks con la firma verificada (app/api/pagos/*) y la consola.
 */
export async function applyPayment(p: {
  householdId: string; proveedor: Proveedor; referencia: string; periodo: Periodo; monto: number; estado: PayState
  metodo?: string | null; pagador?: string | null; raw?: unknown; subscriptionRef?: string | null; plan?: string; cupon?: string | null; nota?: string | null
}) {
  const plan = p.plan ?? "premium"
  const db = supabaseAdmin()
  const { data, error } = await db.rpc("apply_plan_payment", {
    p_household: p.householdId, p_proveedor: p.proveedor, p_referencia: p.referencia, p_periodo: p.periodo, p_monto: Math.round(p.monto), p_estado: p.estado,
    p_metodo: p.metodo ?? undefined, p_pagador: p.pagador ?? undefined, p_raw: (p.raw ?? {}) as Json, p_subscription_ref: p.subscriptionRef ?? undefined,
    p_plan: plan, p_cupon: p.cupon ?? undefined, p_nota: p.nota ?? undefined,
  })
  if (error) throw new Error(error.message)
  const r = data as unknown as ApplyResult
  // Textos y dedupe en @mirai/domain/billing (los comparte la API).
  const planNombre = r.first_approval && r.vence_at ? (await db.from("plans").select("nombre").eq("id", plan).maybeSingle()).data?.nombre : null
  const aviso = paymentNotice(r, { proveedor: p.proveedor, referencia: p.referencia, monto: p.monto, planNombre })
  if (aviso) await notifyOwners(p.householdId, aviso.titulo, aviso.cuerpo, aviso.dedupe)
  return { subscriptionId: r.subscription_id, firstApproval: r.first_approval, revoked: r.revoked, estado: r.estado }
}
