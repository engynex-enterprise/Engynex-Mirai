import "server-only"
// Proxy de los webhooks de pagos hacia la API: app/api/pagos/{mercadopago,wompi} reenvían el cuerpo CRUDO, la consulta
// y los encabezados de la firma a POST /v1/webhooks/<proveedor> y devuelven lo que responda la API (Mercado Pago y
// Wompi reintentan ante un 5xx). Si la API no responde se devuelve 502 (el proveedor reintenta). La firma, el pago y su
// aplicación (idempotente) los maneja la API.
import { NextResponse, type NextRequest } from "next/server"
import { apiUrl } from "./config"
import { publicRawFetch } from "./server"

/** Encabezados que la API necesita para verificar la firma o seguir la petición (el resto no se reenvía). */
export const FORWARD_HEADERS = ["content-type", "x-signature", "x-request-id", "x-event-checksum", "user-agent", "traceparent"] as const

export function forwardHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of FORWARD_HEADERS) {
    const v = h.get(k)
    if (v) out[k] = v
  }
  return out
}

/** URL de la API con la misma consulta (`?type=…&data.id=…` de Mercado Pago). */
export const webhookUrl = (apiUrl: string, provider: "mercadopago" | "wompi", search: string) => `${apiUrl}/v1/webhooks/${provider}${search}`

/** Reenvía la notificación a la API y devuelve su respuesta. */
export async function proxyWebhook(req: NextRequest, provider: "mercadopago" | "wompi"): Promise<NextResponse> {
  const base = apiUrl()
  if (!base) return NextResponse.json({ error: "La API de Mirai no está configurada" }, { status: 503 })
  const body = await req.arrayBuffer()
  try {
    const res = await publicRawFetch()({ url: webhookUrl(base, provider, req.nextUrl.search), method: "POST", headers: forwardHeaders(req.headers), body })
    const text = await res.text()
    return new NextResponse(text, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } })
  } catch {
    return NextResponse.json({ error: "No se pudo procesar la notificación" }, { status: 502 })
  }
}
