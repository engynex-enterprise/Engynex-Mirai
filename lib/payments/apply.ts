import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import type { Json } from "@/lib/supabase/database.types"
import { precio } from "@/lib/plans"
import { payEffect, type PayState } from "./state"

export type { PayState }
export type Periodo = "mes" | "anio"
export type Proveedor = "mercadopago" | "wompi" | "manual"

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

/** Lo que devuelve apply_plan_payment (la transacción de la base). */
export type ApplyResult = {
  subscription_id: string | null; payment_id: string; prev_estado: PayState | null; estado: PayState
  first_approval: boolean; revoked: boolean; vence_at: string | null; cupon_contado: boolean
}

const fechaLarga = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" })

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
  const fx = payEffect(r.prev_estado, r.estado)

  if (r.first_approval && r.vence_at) {
    const { data: pl } = await db.from("plans").select("nombre").eq("id", plan).maybeSingle()
    await notifyOwners(p.householdId, `¡Bienvenido a Mirai ${pl?.nombre ?? "Premium"}!`, `Recibimos tu pago de ${precio(p.monto)}. Tu plan está activo hasta el ${fechaLarga(r.vence_at)}.`, `pay-ok-${p.proveedor}-${p.referencia}`)
  } else if (r.revoked) {
    await notifyOwners(p.householdId, r.estado === "anulado" ? "Tu pago se anuló" : "Tu pago fue reembolsado", r.vence_at && new Date(r.vence_at) > new Date()
      ? `Quitamos ese periodo de tu plan: ahora está activo hasta el ${fechaLarga(r.vence_at)}.`
      : "Quitamos ese periodo de tu plan y volviste al plan Gratis. Tus datos siguen intactos; puedes pagar de nuevo en Ajustes › Mi plan.", `pay-rev-${p.proveedor}-${p.referencia}`)
  } else if (fx.rejected) {
    await notifyOwners(p.householdId, "Tu pago no se aprobó", "El banco o la pasarela rechazó el pago de tu plan. Intenta de nuevo o usa otro medio en Ajustes › Mi plan.", `pay-ko-${p.proveedor}-${p.referencia}`)
  }
  return { subscriptionId: r.subscription_id, firstApproval: r.first_approval, revoked: r.revoked, estado: r.estado }
}
