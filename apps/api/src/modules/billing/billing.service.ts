// Casos de uso de billing (F2-I-3): mismos pasos y mensajes que features/planes/actions.ts, lib/payments/apply.ts y
// app/api/pagos/* de apps/web. La lógica pura (estados, referencias, avisos, cupones) viene de @mirai/domain y las
// firmas de @mirai/crypto/payments. Nunca se cobra ni se llama a una pasarela en las pruebas (puerto MercadoPagoClient).
import { randomUUID } from "node:crypto"
import { Inject, Injectable } from "@nestjs/common"
import type { Logger } from "pino"
import { MP_SUB_STATE, mpPayState, mpRef, parseMpRef, paymentNotice, WOMPI_STATE, type Periodo } from "@mirai/domain/billing"
import { couponProblem, precio, withCoupon, type Coupon } from "@mirai/domain/plans"
import { mercadoPagoVerify, wompiIntegrity, wompiVerifyEvent } from "@mirai/crypto/payments"
import { systemScope } from "../../core/db/scope"
import { DomainError } from "../../core/errors/domain-error"
import { LOGGER } from "../../core/logging/logger"
import { HouseholdAccess } from "../households/household-access"
import { SiteUrl } from "../households/site-url"
import { BillingConfig } from "./billing.config"
import { BillingRepo, type ApplyArgs } from "./billing.repository"
import { MercadoPagoClient } from "./mercadopago.client"

const SYS = systemScope("billing: planes y pagos")
const hoyCo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
const OWNER_MSG = "Solo el dueño del hogar puede cambiar o pagar el plan."

export type Ack = { ok: true; ignorado?: string }
type Headers = Record<string, string | string[] | undefined>
const header = (h: Headers, k: string) => {
  const v = h[k]
  return (Array.isArray(v) ? v[0] : v) ?? null
}

/** Cuerpo JSON exacto que llegó (la firma se calcula sobre lo que mandó la pasarela, no sobre un objeto re-serializado). */
export function parseRaw(raw: Buffer | string | undefined, parsed: unknown): Record<string, unknown> | null {
  if (raw !== undefined) {
    try {
      const v = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : raw)
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null
}

@Injectable()
export class BillingService {
  constructor(
    private readonly repo: BillingRepo,
    private readonly mp: MercadoPagoClient,
    private readonly cfg: BillingConfig,
    private readonly access: HouseholdAccess,
    private readonly site: SiteUrl,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  paymentOptions() {
    return this.cfg.options
  }

  // ── Precio y cupón ──

  /** Precio vigente de un plan comprable (tabla plans, editable en la consola). */
  async planPrice(planId: string, periodo: Periodo) {
    const p = await this.repo.plan(SYS, planId)
    if (!p || !p.activo || !p.precio_mes) throw DomainError.validation("Ese plan no está disponible.")
    return { nombre: p.nombre, monto: periodo === "anio" ? p.precio_anio : p.precio_mes }
  }

  private async loadCoupon(code: string | null | undefined, plan: string, periodo: Periodo): Promise<Coupon | null> {
    const codigo = code?.trim().toUpperCase()
    if (!codigo) return null
    const c = await this.repo.coupon(SYS, codigo)
    const problem = couponProblem(c, plan, periodo, hoyCo())
    if (problem) throw DomainError.validation(problem)
    return c
  }

  async previewCoupon(householdId: string, b: { code: string; plan: string; periodo: Periodo }) {
    await this.access.atLeast(householdId, "owner", OWNER_MSG)
    const coupon = await this.loadCoupon(b.code, b.plan, b.periodo)
    if (!coupon) throw DomainError.validation("Ese cupón no existe.")
    const { monto } = await this.planPrice(b.plan, b.periodo)
    const final = withCoupon(monto, coupon)
    return { monto: final, msg: `Cupón aplicado: pagas ${precio(final)} en vez de ${precio(monto)}${b.periodo === "mes" ? " cada mes" : " por el año"}.` }
  }

  // ── Checkout ──

  /** Mercado Pago: suscripción automática con tarjeta. Wompi: pago único (Nequi, PSE, Bancolombia, tarjeta). */
  async checkout(householdId: string, b: { proveedor: "mercadopago" | "wompi"; periodo: Periodo; plan: string; cupon?: string | null }): Promise<{ url: string }> {
    const h = await this.access.atLeast(householdId, "owner", OWNER_MSG)
    const back = this.site.to(`/ajustes?tab=plan&pago=${b.proveedor}`)
    const { nombre, monto: base } = await this.planPrice(b.plan, b.periodo)
    const coupon = await this.loadCoupon(b.cupon, b.plan, b.periodo)
    const monto = withCoupon(base, coupon)
    if (b.proveedor === "mercadopago") {
      if (!this.cfg.options.mercadopago) throw DomainError.upstream("El pago con tarjeta todavía no está disponible. Intenta más tarde.")
      const pre = await this.mp.createPreapproval({
        reason: `Mirai ${nombre} ${b.periodo === "anio" ? "anual" : "mensual"}`, externalReference: mpRef(h.household.id, b.periodo, b.plan, coupon?.codigo),
        payerEmail: h.user.email, amount: monto, months: b.periodo === "anio" ? 12 : 1, backUrl: back,
      })
      await this.repo.insertSubscription(SYS, { household_id: h.household.id, plan: b.plan, proveedor: "mercadopago", proveedor_ref: pre.id, periodo: b.periodo, estado: "pendiente", created_by: h.user.id })
      if (!pre.init_point) throw DomainError.upstream("Mercado Pago no devolvió el enlace de pago.")
      return { url: pre.init_point }
    }
    if (!this.cfg.options.wompi) throw DomainError.upstream("El pago con Nequi, PSE o Bancolombia todavía no está disponible. Intenta más tarde.")
    // La referencia, el plan y el monto quedan guardados antes de pagar: el webhook solo aprueba si el monto coincide.
    const reference = `mirai-${randomUUID()}`
    const cents = monto * 100
    await this.repo.insertPendingPayment(SYS, { household_id: h.household.id, proveedor: "wompi", referencia: reference, periodo: b.periodo, plan: b.plan, cupon: coupon?.codigo ?? null, monto, estado: "pendiente", pagador: h.user.email })
    const u = new URL("https://checkout.wompi.co/p/")
    u.search = new URLSearchParams({
      "public-key": this.cfg.env.wompiPublicKey!, currency: "COP", "amount-in-cents": String(cents), reference,
      "signature:integrity": wompiIntegrity(reference, cents, "COP", this.cfg.env.wompiIntegritySecret!), "redirect-url": back, "customer-data:email": h.user.email,
    }).toString()
    return { url: u.toString() }
  }

  // ── Renovación automática ──

  /** ¿Pagas tú una renovación automática de este hogar? (quien pasó el hogar puede cancelarla aunque ya no sea dueño). */
  async paysRenewal(householdId: string) {
    const h = await this.access.of(householdId)
    return { paga: (await this.repo.renewals(SYS, h.household.id, h.user.id)).length > 0 }
  }

  /** Renovaciones activas o pendientes del hogar (de una persona, si se pasa). */
  activeRenewals(householdId: string, createdBy?: string) {
    return this.repo.renewals(SYS, householdId, createdBy)
  }

  /** Cancela en Mercado Pago y marca canceladas. `tolerant`: sigue aunque una falle (el dueño nuevo lo ve en Mi plan). */
  async cancelRenewals(householdId: string, createdBy?: string, o: { tolerant?: boolean } = {}) {
    const subs = await this.repo.renewals(SYS, householdId, createdBy)
    for (const s of subs) {
      try {
        if (s.proveedor_ref) await this.mp.cancelPreapproval(s.proveedor_ref)
        await this.repo.setSubscriptionState(SYS, s.id, "cancelada")
      } catch (e) {
        if (!o.tolerant) throw e
        this.log.warn({ error: e, householdId }, "no se pudo cancelar una renovación")
      }
    }
    return subs
  }

  /** Cancela la renovación automática: el dueño, cualquiera del hogar; los demás, la que pagan ellos. */
  async cancelRenewal(householdId: string) {
    const h = await this.access.of(householdId)
    const subs = await this.cancelRenewals(h.household.id, h.access === "owner" ? undefined : h.user.id)
    if (!subs.length) throw DomainError.notFound("No tienes una renovación automática activa.")
    const hasta = subs.map((s) => s.vence_at).filter(Boolean).sort().pop()
    return { msg: hasta ? `Listo: no te cobraremos más. Sigues con tu plan hasta el ${new Date(hasta).toLocaleDateString("es-CO", { day: "numeric", month: "long" })}.` : "Listo: cancelamos la renovación." }
  }

  // ── Aplicar un pago (webhooks y consola) ──

  /**
   * Registra un pago y, si quedó aprobado por primera vez, extiende el plan. Todo pasa en UNA transacción de la base
   * (apply_plan_payment, con candado): un aviso repetido extiende una sola vez y un aviso viejo no retrocede el estado.
   */
  async applyPayment(p: Omit<ApplyArgs, "plan"> & { plan?: string }) {
    const plan = p.plan ?? "premium"
    const r = await this.repo.applyPlanPayment(SYS, { ...p, plan })
    const planNombre = r.first_approval && r.vence_at ? (await this.repo.plan(SYS, plan))?.nombre : null
    const aviso = paymentNotice(r, { proveedor: p.proveedor, referencia: p.referencia, monto: p.monto, planNombre })
    if (aviso) await this.repo.notifyUsers(SYS, await this.repo.owners(SYS, p.householdId), aviso)
    return { subscriptionId: r.subscription_id, firstApproval: r.first_approval, revoked: r.revoked, estado: r.estado }
  }

  /**
   * Webhook de Mercado Pago. Se verifica x-signature y luego se consulta el recurso en la API de Mercado Pago: lo que
   * dice la API es la fuente de verdad, no el cuerpo. Un error lanza 5xx para que Mercado Pago reintente.
   */
  async mercadopagoWebhook(i: { query: Record<string, string | undefined>; raw?: Buffer | string; body: unknown; headers: Headers }): Promise<Ack> {
    if (!this.cfg.env.mercadopagoToken) throw DomainError.upstream("Mercado Pago no está configurado.")
    const body = parseRaw(i.raw, i.body) ?? {}
    const data = (body.data ?? {}) as { id?: unknown }
    const type = String(body.type ?? i.query.type ?? i.query.topic ?? "")
    const id = String(data.id ?? i.query["data.id"] ?? i.query.id ?? "")
    const secret = this.cfg.env.mercadopagoWebhookSecret
    if (!secret && this.cfg.env.production) throw DomainError.upstream("Falta MERCADOPAGO_WEBHOOK_SECRET.")
    if (secret && !mercadoPagoVerify({ xSignature: header(i.headers, "x-signature"), xRequestId: header(i.headers, "x-request-id"), dataId: i.query["data.id"] ?? id, secret }))
      throw DomainError.unauthenticated("Firma inválida.")
    if (!id) return { ok: true, ignorado: "sin id" }
    try {
      if (type === "subscription_preapproval" || type === "preapproval") {
        const pre = await this.mp.getPreapproval(id)
        const ref = parseMpRef(pre.external_reference)
        if (!ref) return { ok: true, ignorado: "referencia ajena" }
        const estado = MP_SUB_STATE[pre.status] ?? "pendiente"
        const sub = await this.repo.subscriptionByRef(SYS, "mercadopago", pre.id)
        if (sub) await this.repo.setSubscriptionState(SYS, sub.id, estado)
        else await this.repo.insertSubscription(SYS, { household_id: ref.householdId, plan: ref.plan, proveedor: "mercadopago", proveedor_ref: pre.id, periodo: ref.periodo, estado })
      } else if (type === "subscription_authorized_payment") {
        const ap = await this.mp.getAuthorizedPayment(id)
        const pre = await this.mp.getPreapproval(ap.preapproval_id)
        const ref = parseMpRef(pre.external_reference ?? ap.external_reference)
        if (!ref) return { ok: true, ignorado: "referencia ajena" }
        await this.applyPayment({
          householdId: ref.householdId, proveedor: "mercadopago", referencia: String(ap.payment?.id ?? ap.id), periodo: ref.periodo, monto: ap.transaction_amount,
          estado: mpPayState(ap.payment?.status), metodo: "tarjeta", pagador: pre.payer_email ?? null, raw: ap, subscriptionRef: pre.id, plan: ref.plan, cupon: ref.cupon,
        })
      } else if (type === "payment") {
        const p = await this.mp.getPayment(id)
        const ref = parseMpRef(p.external_reference)
        if (!ref) return { ok: true, ignorado: "referencia ajena" }
        await this.applyPayment({ householdId: ref.householdId, proveedor: "mercadopago", referencia: String(p.id), periodo: ref.periodo, monto: p.transaction_amount, estado: mpPayState(p.status), metodo: p.payment_method_id ?? null, pagador: p.payer?.email ?? null, raw: p, plan: ref.plan, cupon: ref.cupon })
      }
      return { ok: true }
    } catch (e) {
      // 500 para que Mercado Pago reintente más tarde (el detalle solo en el log).
      throw DomainError.internal(e)
    }
  }

  /** Eventos de Wompi (transaction.updated): checksum sobre el cuerpo crudo y monto igual al que generó Mirai. */
  async wompiWebhook(i: { raw?: Buffer | string; body: unknown }): Promise<Ack> {
    const secret = this.cfg.env.wompiEventsSecret
    if (!secret) throw DomainError.upstream("Wompi no está configurado.")
    const body = parseRaw(i.raw, i.body)
    if (!body || !wompiVerifyEvent(body, secret)) throw DomainError.unauthenticated("Firma inválida.")
    if (body.event !== "transaction.updated") return { ok: true, ignorado: String(body.event ?? "") }
    const tx = (body.data as { transaction?: { id: string; status: string; reference: string; amount_in_cents: number; payment_method_type?: string; customer_email?: string } } | undefined)?.transaction
    if (!tx?.reference) return { ok: true, ignorado: "sin referencia" }
    const pay = await this.repo.paymentByRef(SYS, "wompi", tx.reference)
    if (!pay?.household_id || !pay.periodo) return { ok: true, ignorado: "referencia desconocida" }
    const montoOk = tx.amount_in_cents === pay.monto * 100
    await this.applyPayment({
      householdId: pay.household_id, proveedor: "wompi", referencia: tx.reference, periodo: pay.periodo as Periodo, monto: pay.monto,
      estado: montoOk ? WOMPI_STATE[tx.status] ?? "pendiente" : "anulado", metodo: tx.payment_method_type ?? null, pagador: tx.customer_email ?? null,
      raw: { ...tx, ...(montoOk ? {} : { alerta: "El monto no coincide con el generado por Mirai" }) }, plan: pay.plan ?? "premium", cupon: pay.cupon,
    })
    return { ok: true }
  }
}
