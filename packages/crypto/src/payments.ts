// Firmas de las pasarelas de pago (Wompi y Mercado Pago). Puras (node:crypto, sin red): las usan apps/web
// (lib/payments/signatures.ts) y apps/api (webhooks de billing). Solo servidor.
import { createHash, createHmac, timingSafeEqual } from "node:crypto"

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Wompi: firma de integridad del checkout = SHA-256(referencia + monto en centavos + moneda + secreto de integridad). */
export function wompiIntegrity(reference: string, amountInCents: number, currency: string, secret: string) {
  return createHash("sha256").update(`${reference}${amountInCents}${currency}${secret}`).digest("hex")
}

type WompiEvent = { data?: Record<string, unknown>; signature?: { properties?: string[]; checksum?: string }; timestamp?: number | string }

/** Wompi: verifica el checksum de un evento (valores de signature.properties dentro de data + timestamp + secreto de eventos). */
export function wompiVerifyEvent(body: WompiEvent, eventsSecret: string) {
  const props = body.signature?.properties ?? []
  const checksum = body.signature?.checksum ?? ""
  if (!props.length || !checksum || body.timestamp === undefined) return false
  const pick = (path: string) => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), body.data)
  const plain = props.map((p) => String(pick(p) ?? "")).join("") + String(body.timestamp) + eventsSecret
  return same(createHash("sha256").update(plain).digest("hex").toUpperCase(), checksum.toUpperCase())
}

/**
 * Mercado Pago: verifica el encabezado x-signature ("ts=…,v1=…") de una notificación.
 * Plantilla firmada: "id:{data.id};request-id:{x-request-id};ts:{ts};" con HMAC-SHA256 y la clave secreta del webhook.
 */
export function mercadoPagoVerify({ xSignature, xRequestId, dataId, secret }: { xSignature: string | null; xRequestId: string | null; dataId: string | null; secret: string }) {
  if (!xSignature) return false
  const parts = Object.fromEntries(xSignature.split(",").map((p) => p.trim().split("=", 2) as [string, string]))
  const ts = parts.ts, v1 = parts.v1
  if (!ts || !v1) return false
  let manifest = ""
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`
  if (xRequestId) manifest += `request-id:${xRequestId};`
  manifest += `ts:${ts};`
  return same(createHmac("sha256", secret).update(manifest).digest("hex"), v1)
}
