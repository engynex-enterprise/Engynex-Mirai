import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { extendVence, precio } from "@/lib/plans"

export type Periodo = "mes" | "anio"
export type PayState = "pendiente" | "aprobado" | "rechazado" | "reembolsado" | "anulado"
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

/**
 * Registra un pago y, si quedó aprobado por primera vez, extiende Premium del hogar un mes o un año.
 * Es idempotente: las pasarelas reenvían la misma notificación varias veces.
 */
export async function applyPayment(p: {
  householdId: string; proveedor: Proveedor; referencia: string; periodo: Periodo; monto: number; estado: PayState
  metodo?: string | null; pagador?: string | null; raw?: unknown; subscriptionRef?: string | null; plan?: string; cupon?: string | null; nota?: string | null
}) {
  const plan = p.plan ?? "premium"
  const db = supabaseAdmin()
  const { data: prev } = await db.from("plan_payments").select("id,estado,subscription_id,cupon").eq("proveedor", p.proveedor).eq("referencia", p.referencia).maybeSingle()
  const firstApproval = p.estado === "aprobado" && prev?.estado !== "aprobado"

  // Suscripción a la que pertenece el pago: la de Mercado Pago por su id, o la del hogar con esa pasarela.
  let subId = prev?.subscription_id ?? null
  if (!subId) {
    const q = db.from("plan_subscriptions").select("id").eq("household_id", p.householdId).eq("proveedor", p.proveedor)
    const { data: sub } = await (p.subscriptionRef ? q.eq("proveedor_ref", p.subscriptionRef) : q.order("created_at", { ascending: false })).limit(1).maybeSingle()
    subId = sub?.id ?? null
  }
  if (!subId && p.estado === "aprobado") {
    const { data: sub, error } = await db.from("plan_subscriptions").insert({ household_id: p.householdId, plan, proveedor: p.proveedor, proveedor_ref: p.subscriptionRef ?? null, periodo: p.periodo, estado: "activa" }).select("id").single()
    if (error) throw new Error(error.message)
    subId = sub.id
  }

  const row = {
    household_id: p.householdId, subscription_id: subId, proveedor: p.proveedor, referencia: p.referencia, periodo: p.periodo, monto: Math.round(p.monto),
    estado: p.estado, metodo: p.metodo ?? null, pagador: p.pagador ?? null, raw: (p.raw ?? {}) as never, paid_at: p.estado === "aprobado" ? new Date().toISOString() : null,
    plan, cupon: p.cupon ?? prev?.cupon ?? null, ...(p.nota ? { nota: p.nota } : {}),
  }
  const { error } = await db.from("plan_payments").upsert(row, { onConflict: "proveedor,referencia" })
  if (error) throw new Error(error.message)

  if (firstApproval && subId) {
    // Se extiende desde el vencimiento más lejano del hogar (si paga antes de que se acabe, no pierde días).
    const { data: subs } = await db.from("plan_subscriptions").select("vence_at").eq("household_id", p.householdId).in("estado", ["activa", "cancelada", "cortesia"]).order("vence_at", { ascending: false, nullsFirst: false }).limit(1)
    const vence = extendVence(subs?.[0]?.vence_at ?? null, p.periodo)
    await db.from("plan_subscriptions").update({ estado: "activa", plan, periodo: p.periodo, vence_at: vence.toISOString() }).eq("id", subId)
    const cupon = p.cupon ?? prev?.cupon
    if (cupon) { const { data: c } = await db.from("coupons").select("usos").eq("codigo", cupon).maybeSingle(); if (c) await db.from("coupons").update({ usos: c.usos + 1 }).eq("codigo", cupon) }
    const { data: pl } = await db.from("plans").select("nombre").eq("id", plan).maybeSingle()
    await notifyOwners(p.householdId, `¡Bienvenido a Mirai ${pl?.nombre ?? "Premium"}!`, `Recibimos tu pago de ${precio(p.monto)}. Tu plan está activo hasta el ${vence.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}.`, `pay-ok-${p.proveedor}-${p.referencia}`)
  } else if (p.estado === "rechazado" && prev?.estado !== "rechazado") {
    await notifyOwners(p.householdId, "Tu pago no se aprobó", "El banco o la pasarela rechazó el pago de tu plan. Intenta de nuevo o usa otro medio en Ajustes › Mi plan.", `pay-ko-${p.proveedor}-${p.referencia}`)
  }
  return { subscriptionId: subId, firstApproval }
}
