import { NextResponse, type NextRequest } from "next/server"
import { proxyWebhook } from "@/lib/api/webhook-proxy"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { applyPayment, type PayState } from "@/lib/payments/apply"
import { wompiVerifyEvent } from "@/lib/payments/signatures"

const STATE: Record<string, PayState> = { APPROVED: "aprobado", DECLINED: "rechazado", ERROR: "rechazado", VOIDED: "anulado", PENDING: "pendiente" }

/** Eventos de Wompi (transaction.updated). Se valida el checksum y que el monto sea el que Mirai generó. */
export async function POST(req: NextRequest) {
  // v6: con el interruptor `webhooks` en "on" lo procesa la API (cuerpo crudo y firma tal cual); si no, lo de siempre.
  const proxied = await proxyWebhook(req, "wompi")
  if (proxied) return proxied
  const secret = process.env.WOMPI_EVENTS_SECRET
  if (!secret) return NextResponse.json({ error: "Wompi no está configurado" }, { status: 503 })
  const body = await req.json().catch(() => null)
  if (!body || !wompiVerifyEvent(body, secret)) return NextResponse.json({ error: "Firma inválida" }, { status: 401 })
  if (body.event !== "transaction.updated") return NextResponse.json({ ok: true, ignorado: body.event })
  const tx = body.data?.transaction as { id: string; status: string; reference: string; amount_in_cents: number; payment_method_type?: string; customer_email?: string } | undefined
  if (!tx?.reference) return NextResponse.json({ ok: true, ignorado: "sin referencia" })
  const { data: pay } = await supabaseAdmin().from("plan_payments").select("household_id,periodo,monto,plan,cupon").eq("proveedor", "wompi").eq("referencia", tx.reference).maybeSingle()
  if (!pay?.household_id || !pay.periodo) return NextResponse.json({ ok: true, ignorado: "referencia desconocida" })
  const montoOk = tx.amount_in_cents === pay.monto * 100
  await applyPayment({
    householdId: pay.household_id, proveedor: "wompi", referencia: tx.reference, periodo: pay.periodo as "mes" | "anio", monto: pay.monto,
    estado: montoOk ? STATE[tx.status] ?? "pendiente" : "anulado", metodo: tx.payment_method_type ?? null, pagador: tx.customer_email ?? null,
    raw: { ...tx, ...(montoOk ? {} : { alerta: "El monto no coincide con el generado por Mirai" }) }, plan: pay.plan ?? "premium", cupon: pay.cupon,
  })
  return NextResponse.json({ ok: true })
}
