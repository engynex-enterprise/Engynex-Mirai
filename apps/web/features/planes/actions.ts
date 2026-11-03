"use server"

import { randomUUID } from "node:crypto"
import { z } from "zod"
import { getAppContext, requireRole } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { siteUrl } from "@/lib/site-url"
import { couponProblem, precio, withCoupon, type Coupon } from "@/lib/plans"
import { payConfig, planPrice } from "@/lib/payments/apply"
import { cancelPreapproval, createPreapproval, mpRef } from "@/lib/payments/mercadopago"
import { wompiIntegrity } from "@/lib/payments/signatures"

const Periodo = z.enum(["mes", "anio"])
const PlanId = z.string().regex(/^[a-z0-9-]{2,30}$/)
const hoyCo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())

/** Qué pasarelas están listas en este despliegue. */
export async function paymentOptions() {
  return payConfig()
}

async function loadCoupon(code: string | null | undefined, plan: string, periodo: "mes" | "anio") {
  const codigo = code?.trim().toUpperCase()
  if (!codigo) return { coupon: null, problem: null }
  const { data } = await supabaseAdmin().from("coupons").select("*").eq("codigo", codigo).maybeSingle()
  const problem = couponProblem(data as Coupon | null, plan, periodo, hoyCo())
  return { coupon: problem ? null : (data as Coupon), problem }
}

/** Precio final con un cupón, para mostrarlo antes de pagar. */
export async function previewCoupon(code: string, planIn: string, periodoIn: "mes" | "anio"): Promise<{ ok: boolean; msg: string; monto?: number }> {
  await requireRole("owner")
  const plan = PlanId.parse(planIn), periodo = Periodo.parse(periodoIn)
  const { coupon, problem } = await loadCoupon(code, plan, periodo)
  if (problem || !coupon) return { ok: false, msg: problem ?? "Ese cupón no existe." }
  const { monto } = await planPrice(plan, periodo)
  const final = withCoupon(monto, coupon)
  return { ok: true, monto: final, msg: `Cupón aplicado: pagas ${precio(final)} en vez de ${precio(monto)}${periodo === "mes" ? " cada mes" : " por el año"}.` }
}

/**
 * Inicia el pago de un plan y devuelve la URL de la pasarela.
 * Mercado Pago: suscripción automática con tarjeta. Wompi: pago único (Nequi, PSE, Bancolombia, tarjeta) por un mes o un año.
 */
export async function startCheckout(proveedor: "mercadopago" | "wompi", periodoIn: "mes" | "anio", planIn = "premium", cupon?: string): Promise<{ ok: boolean; url?: string; msg?: string }> {
  const ctx = await requireRole("owner")
  const periodo = Periodo.parse(periodoIn), plan = PlanId.parse(planIn)
  const cfg = payConfig()
  const back = `${siteUrl()}/ajustes?tab=plan&pago=${proveedor}`
  const db = supabaseAdmin()
  try {
    const { nombre, monto: base } = await planPrice(plan, periodo)
    const { coupon, problem } = await loadCoupon(cupon, plan, periodo)
    if (problem) return { ok: false, msg: problem }
    const monto = withCoupon(base, coupon)
    if (proveedor === "mercadopago") {
      if (!cfg.mercadopago) return { ok: false, msg: "El pago con tarjeta todavía no está disponible. Intenta más tarde." }
      const pre = await createPreapproval({
        reason: `Mirai ${nombre} ${periodo === "anio" ? "anual" : "mensual"}`, externalReference: mpRef(ctx.household.id, periodo, plan, coupon?.codigo),
        payerEmail: ctx.user.email, amount: monto, months: periodo === "anio" ? 12 : 1, backUrl: back,
      })
      await db.from("plan_subscriptions").insert({ household_id: ctx.household.id, plan, proveedor: "mercadopago", proveedor_ref: pre.id, periodo, estado: "pendiente", created_by: ctx.user.id })
      return pre.init_point ? { ok: true, url: pre.init_point } : { ok: false, msg: "Mercado Pago no devolvió el enlace de pago." }
    }
    if (!cfg.wompi) return { ok: false, msg: "El pago con Nequi, PSE o Bancolombia todavía no está disponible. Intenta más tarde." }
    // La referencia, el plan y el monto quedan guardados antes de pagar: el webhook solo aprueba si el monto coincide.
    const reference = `mirai-${randomUUID()}`
    const cents = monto * 100
    const { error } = await db.from("plan_payments").insert({ household_id: ctx.household.id, proveedor: "wompi", referencia: reference, periodo, plan, cupon: coupon?.codigo ?? null, monto, estado: "pendiente", pagador: ctx.user.email })
    if (error) throw new Error(error.message)
    const u = new URL("https://checkout.wompi.co/p/")
    u.search = new URLSearchParams({
      "public-key": process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY!, currency: "COP", "amount-in-cents": String(cents), reference,
      "signature:integrity": wompiIntegrity(reference, cents, "COP", process.env.WOMPI_INTEGRITY_SECRET!), "redirect-url": back, "customer-data:email": ctx.user.email,
    }).toString()
    return { ok: true, url: u.toString() }
  } catch (e) {
    return { ok: false, msg: (e as Error).message }
  }
}

/** ¿Pagas tú una renovación automática de este hogar? (quien pasó el hogar puede cancelarla aunque ya no sea dueño). */
export async function paysRenewal(): Promise<boolean> {
  const ctx = await getAppContext()
  const { count } = await supabaseAdmin().from("plan_subscriptions").select("id", { count: "exact", head: true }).eq("household_id", ctx.household.id).eq("proveedor", "mercadopago").eq("created_by", ctx.user.id).in("estado", ["activa", "pendiente"])
  return (count ?? 0) > 0
}

/** Cancela la renovación automática (Mercado Pago). El plan sigue hasta la fecha de vencimiento. */
export async function cancelRenewal(): Promise<{ ok: boolean; msg: string }> {
  // El dueño cancela cualquier renovación del hogar; quien pasó el hogar y la sigue pagando puede cancelar la suya.
  const ctx = await getAppContext()
  const owner = ctx.household.access === "owner"
  const db = supabaseAdmin()
  let q = db.from("plan_subscriptions").select("id,proveedor_ref,vence_at").eq("household_id", ctx.household.id).eq("proveedor", "mercadopago").in("estado", ["activa", "pendiente"])
  if (!owner) q = q.eq("created_by", ctx.user.id)
  const { data: subs } = await q
  if (!subs?.length) return { ok: false, msg: "No tienes una renovación automática activa." }
  try {
    for (const s of subs) {
      if (s.proveedor_ref) await cancelPreapproval(s.proveedor_ref)
      await db.from("plan_subscriptions").update({ estado: "cancelada" }).eq("id", s.id)
    }
    const hasta = subs.map((s) => s.vence_at).filter(Boolean).sort().pop()
    return { ok: true, msg: hasta ? `Listo: no te cobraremos más. Sigues con tu plan hasta el ${new Date(hasta).toLocaleDateString("es-CO", { day: "numeric", month: "long" })}.` : "Listo: cancelamos la renovación." }
  } catch (e) {
    return { ok: false, msg: (e as Error).message }
  }
}
