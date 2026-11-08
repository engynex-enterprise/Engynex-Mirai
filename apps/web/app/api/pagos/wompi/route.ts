import type { NextRequest } from "next/server"
import { proxyWebhook } from "@/lib/api/webhook-proxy"

/** Notificaciones de Wompi (transaction.updated): las verifica y aplica la API (POST /v1/webhooks/wompi). */
export async function POST(req: NextRequest) {
  return proxyWebhook(req, "wompi")
}
