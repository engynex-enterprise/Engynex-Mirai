// API de Mercado Pago (suscripciones = "preapproval"), detrás de un puerto para probar sin red ni cobros reales.
// Misma lógica que apps/web/lib/payments/mercadopago.ts. Docs: https://www.mercadopago.com.co/developers/es/reference
import { Injectable } from "@nestjs/common"
import { DomainError } from "../../core/errors/domain-error"
import { BillingConfig } from "./billing.config"

export type Preapproval = { id: string; status: "pending" | "authorized" | "paused" | "cancelled"; init_point?: string; external_reference?: string; payer_email?: string; next_payment_date?: string; auto_recurring?: { transaction_amount: number; frequency: number; frequency_type: string } }
export type AuthorizedPayment = { id: number | string; preapproval_id: string; status: string; transaction_amount: number; external_reference?: string; payment?: { id: number | string; status: string; status_detail?: string }; debit_date?: string }
export type MpPayment = { id: number | string; status: string; transaction_amount: number; external_reference?: string; payment_method_id?: string; payer?: { email?: string }; metadata?: Record<string, unknown> }
export type NewPreapproval = { reason: string; externalReference: string; payerEmail: string; amount: number; months: number; backUrl: string }

export abstract class MercadoPagoClient {
  /** Crea la suscripción (pendiente) y devuelve el enlace de pago. */
  abstract createPreapproval(input: NewPreapproval): Promise<Preapproval>
  abstract getPreapproval(id: string): Promise<Preapproval>
  abstract cancelPreapproval(id: string): Promise<Preapproval>
  abstract getAuthorizedPayment(id: string): Promise<AuthorizedPayment>
  abstract getPayment(id: string): Promise<MpPayment>
}

const API = "https://api.mercadopago.com"

@Injectable()
export class HttpMercadoPagoClient extends MercadoPagoClient {
  constructor(private readonly cfg: BillingConfig) {
    super()
  }

  private async mp<T>(path: string, init?: RequestInit): Promise<T> {
    const token = this.cfg.env.mercadopagoToken
    if (!token) throw DomainError.upstream("Mercado Pago no está configurado en este despliegue.")
    const r = await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(15000) })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) throw DomainError.upstream(`Mercado Pago ${r.status}: ${(body as { message?: string }).message ?? "error"}`)
    return body as T
  }

  createPreapproval(input: NewPreapproval) {
    return this.mp<Preapproval>("/preapproval", {
      method: "POST",
      body: JSON.stringify({
        reason: input.reason, external_reference: input.externalReference, payer_email: input.payerEmail, back_url: input.backUrl, status: "pending",
        auto_recurring: { frequency: input.months, frequency_type: "months", transaction_amount: input.amount, currency_id: "COP" },
      }),
    })
  }
  getPreapproval(id: string) {
    return this.mp<Preapproval>(`/preapproval/${encodeURIComponent(id)}`)
  }
  cancelPreapproval(id: string) {
    return this.mp<Preapproval>(`/preapproval/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) })
  }
  getAuthorizedPayment(id: string) {
    return this.mp<AuthorizedPayment>(`/authorized_payments/${encodeURIComponent(id)}`)
  }
  getPayment(id: string) {
    return this.mp<MpPayment>(`/v1/payments/${encodeURIComponent(id)}`)
  }
}
