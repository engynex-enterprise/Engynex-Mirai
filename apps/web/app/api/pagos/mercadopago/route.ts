import type { NextRequest } from "next/server"
import { proxyWebhook } from "@/lib/api/webhook-proxy"

/** Notificaciones de Mercado Pago (suscripciones y pagos): las verifica y aplica la API (POST /v1/webhooks/mercadopago). */
export async function POST(req: NextRequest) {
  return proxyWebhook(req, "mercadopago")
}
