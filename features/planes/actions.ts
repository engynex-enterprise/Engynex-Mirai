"use server"

import { randomUUID } from "node:crypto"
import { z } from "zod"
import { requireRole } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { siteUrl } from "@/lib/site-url"
import { payConfig, premiumPrice } from "@/lib/payments/apply"
import { cancelPreapproval, createPreapproval, mpRef } from "@/lib/payments/mercadopago"
import { wompiIntegrity } from "@/lib/payments/signatures"

const Periodo = z.enum(["mes", "anio"])

/** Qué pasarelas están listas en este despliegue. */
export async function paymentOptions() {
  return payConfig()
}

/**
 * Inicia el pago de Premium y devuelve la URL de la pasarela.
 * Mercado Pago: suscripción automática con tarjeta. Wompi: pago único (Nequi, PSE, Bancolombia, tarjeta) por un mes o un año.
 */
export async function startCheckout(proveedor: "mercadopago" | "wompi", periodoIn: "mes" | "anio"): Promise<{ ok: boolean; url?: string; msg?: string }> {
  const ctx = await requireRole("owner")
  const periodo = Periodo.parse(periodoIn)
  const cfg = payConfig()
  const monto = await premiumPrice(periodo)
  const back = `${siteUrl()}/ajustes?tab=plan&pago=${proveedor}`
  const db = supabaseAdmin()
  try {
    if (proveedor === "mercadopago") {
      if (!cfg.mercadopago) return { ok: false, msg: "El pago con tarjeta todavía no está disponible. Intenta más tarde." }
      const pre = await createPreapproval({
        reason: `Mirai Premium ${periodo === "anio" ? "anual" : "mensual"}`, externalReference: mpRef(ctx.household.id, periodo),
        payerEmail: ctx.user.email, amount: monto, months: periodo === "anio" ? 12 : 1, backUrl: back,
      })
      await db.from("plan_subscriptions").insert({ household_id: ctx.household.id, proveedor: "mercadopago", proveedor_ref: pre.id, periodo, estado: "pendiente", created_by: ctx.user.id })
      return pre.init_point ? { ok: true, url: pre.init_point } : { ok: false, msg: "Mercado Pago no devolvió el enlace de pago." }
    }
    if (!cfg.wompi) return { ok: false, msg: "El pago con Nequi, PSE o Bancolombia todavía no está disponible. Intenta más tarde." }
    // La referencia y el monto quedan guardados antes de pagar: el webhook solo aprueba si el monto coincide.
    const reference = `mirai-${randomUUID()}`
    const cents = monto * 100
    const { error } = await db.from("plan_payments").insert({ household_id: ctx.household.id, proveedor: "wompi", referencia: reference, periodo, monto, estado: "pendiente", pagador: ctx.user.email })
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

/** Cancela la renovación automática (Mercado Pago). Premium sigue hasta la fecha de vencimiento. */
export async function cancelRenewal(): Promise<{ ok: boolean; msg: string }> {
  const ctx = await requireRole("owner")
  const db = supabaseAdmin()
  const { data: subs } = await db.from("plan_subscriptions").select("id,proveedor_ref,vence_at").eq("household_id", ctx.household.id).eq("proveedor", "mercadopago").in("estado", ["activa", "pendiente"])
  if (!subs?.length) return { ok: false, msg: "No tienes una renovación automática activa." }
  try {
    for (const s of subs) {
      if (s.proveedor_ref) await cancelPreapproval(s.proveedor_ref)
      await db.from("plan_subscriptions").update({ estado: "cancelada" }).eq("id", s.id)
    }
    const hasta = subs.map((s) => s.vence_at).filter(Boolean).sort().pop()
    return { ok: true, msg: hasta ? `Listo: no te cobraremos más. Sigues con Premium hasta el ${new Date(hasta).toLocaleDateString("es-CO", { day: "numeric", month: "long" })}.` : "Listo: cancelamos la renovación." }
  } catch (e) {
    return { ok: false, msg: (e as Error).message }
  }
}
