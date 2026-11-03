import "server-only"

// API de Mercado Pago (suscripciones = "preapproval"). Docs: https://www.mercadopago.com.co/developers/es/reference

const API = "https://api.mercadopago.com"

async function mp<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!token) throw new Error("Mercado Pago no está configurado en este despliegue.")
  const r = await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store", signal: AbortSignal.timeout(15000) })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Mercado Pago ${r.status}: ${(body as { message?: string }).message ?? "error"}`)
  return body as T
}

export type Preapproval = { id: string; status: "pending" | "authorized" | "paused" | "cancelled"; init_point?: string; external_reference?: string; payer_email?: string; next_payment_date?: string; auto_recurring?: { transaction_amount: number; frequency: number; frequency_type: string } }
export type AuthorizedPayment = { id: number | string; preapproval_id: string; status: string; transaction_amount: number; external_reference?: string; payment?: { id: number | string; status: string; status_detail?: string }; debit_date?: string }
export type MpPayment = { id: number | string; status: string; transaction_amount: number; external_reference?: string; payment_method_id?: string; payer?: { email?: string }; metadata?: Record<string, unknown> }

/** Crea la suscripción (pendiente) y devuelve el enlace de pago de Mercado Pago. */
export function createPreapproval(input: { reason: string; externalReference: string; payerEmail: string; amount: number; months: number; backUrl: string }) {
  return mp<Preapproval>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: input.reason, external_reference: input.externalReference, payer_email: input.payerEmail, back_url: input.backUrl, status: "pending",
      auto_recurring: { frequency: input.months, frequency_type: "months", transaction_amount: input.amount, currency_id: "COP" },
    }),
  })
}
export const getPreapproval = (id: string) => mp<Preapproval>(`/preapproval/${encodeURIComponent(id)}`)
export const cancelPreapproval = (id: string) => mp<Preapproval>(`/preapproval/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) })
export const getAuthorizedPayment = (id: string) => mp<AuthorizedPayment>(`/authorized_payments/${encodeURIComponent(id)}`)
export const getPayment = (id: string) => mp<MpPayment>(`/v1/payments/${encodeURIComponent(id)}`)

/** external_reference de Mirai: "mirai:{hogar}:{periodo}:{plan}[:{cupón}]" (en @mirai/domain/billing). */
export { mpRef, parseMpRef } from "@mirai/domain/billing"
