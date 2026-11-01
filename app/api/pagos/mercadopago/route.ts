import { NextResponse, type NextRequest } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { applyPayment } from "@/lib/payments/apply"
import { getAuthorizedPayment, getPayment, getPreapproval, parseMpRef } from "@/lib/payments/mercadopago"
import { mercadoPagoVerify } from "@/lib/payments/signatures"

const SUB_STATE = { pending: "pendiente", authorized: "activa", paused: "vencida", cancelled: "cancelada" } as const
const payState = (s?: string) => (s === "approved" ? "aprobado" : s === "rejected" || s === "cancelled" ? "rechazado" : s === "refunded" || s === "charged_back" ? "reembolsado" : "pendiente")

/**
 * Notificaciones de Mercado Pago (suscripciones y pagos). Se verifica x-signature y luego se consulta el recurso
 * en la API de Mercado Pago: lo que dice la API es la fuente de verdad, no el cuerpo de la notificación.
 */
export async function POST(req: NextRequest) {
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) return NextResponse.json({ error: "Mercado Pago no está configurado" }, { status: 503 })
  const body = await req.json().catch(() => ({}))
  const type = String(body.type ?? req.nextUrl.searchParams.get("type") ?? req.nextUrl.searchParams.get("topic") ?? "")
  const id = String(body.data?.id ?? req.nextUrl.searchParams.get("data.id") ?? req.nextUrl.searchParams.get("id") ?? "")
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET
  if (secret && !mercadoPagoVerify({ xSignature: req.headers.get("x-signature"), xRequestId: req.headers.get("x-request-id"), dataId: req.nextUrl.searchParams.get("data.id") ?? id, secret }))
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 })
  if (!id) return NextResponse.json({ ok: true, ignorado: "sin id" })
  const db = supabaseAdmin()
  try {
    if (type === "subscription_preapproval" || type === "preapproval") {
      const pre = await getPreapproval(id)
      const ref = parseMpRef(pre.external_reference)
      if (!ref) return NextResponse.json({ ok: true, ignorado: "referencia ajena" })
      const estado = SUB_STATE[pre.status] ?? "pendiente"
      const { data: sub } = await db.from("plan_subscriptions").select("id").eq("proveedor", "mercadopago").eq("proveedor_ref", pre.id).maybeSingle()
      if (sub) await db.from("plan_subscriptions").update({ estado }).eq("id", sub.id)
      else await db.from("plan_subscriptions").insert({ household_id: ref.householdId, plan: ref.plan, proveedor: "mercadopago", proveedor_ref: pre.id, periodo: ref.periodo, estado })
    } else if (type === "subscription_authorized_payment") {
      const ap = await getAuthorizedPayment(id)
      const pre = await getPreapproval(ap.preapproval_id)
      const ref = parseMpRef(pre.external_reference ?? ap.external_reference)
      if (!ref) return NextResponse.json({ ok: true, ignorado: "referencia ajena" })
      await applyPayment({
        householdId: ref.householdId, proveedor: "mercadopago", referencia: String(ap.payment?.id ?? ap.id), periodo: ref.periodo, monto: ap.transaction_amount,
        estado: payState(ap.payment?.status), metodo: "tarjeta", pagador: pre.payer_email ?? null, raw: ap, subscriptionRef: pre.id, plan: ref.plan, cupon: ref.cupon,
      })
    } else if (type === "payment") {
      const p = await getPayment(id)
      const ref = parseMpRef(p.external_reference)
      if (!ref) return NextResponse.json({ ok: true, ignorado: "referencia ajena" })
      await applyPayment({ householdId: ref.householdId, proveedor: "mercadopago", referencia: String(p.id), periodo: ref.periodo, monto: p.transaction_amount, estado: payState(p.status), metodo: p.payment_method_id ?? null, pagador: p.payer?.email ?? null, raw: p, plan: ref.plan, cupon: ref.cupon })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    // 500 para que Mercado Pago reintente más tarde.
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
