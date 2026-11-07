// Chat en streaming por la API (v6 F2-H-6): POST /v1/books/:b/chat/messages con Bearer e Idempotency-Key. Mismo
// protocolo NDJSON que /api/chat (un ChatEvent por línea; la API agrega un latido {"t":"ping"} cada 15 s que el
// lector ignora). Los errores de las guardas (rol, plan, límite `chat`) llegan como JSON antes del streaming y se
// convierten en ApiError con el mensaje en español de la API.
import { ApiError } from "./errors"
import { isMiraiAuth } from "@/lib/auth/provider"
import { apiSession } from "./session"

export type ChatSendBody = { threadId: string | null; text: string; tono: string; editId?: string; regenerate?: string }

export async function apiChatSend(body: ChatSendBody, signal: AbortSignal): Promise<Response & { body: ReadableStream<Uint8Array> }> {
  const s = apiSession()
  // V7-H3: con AUTH_PROVIDER=mirai la sesión es la cookie del mismo origen (como browserApi): /v1 va por la web.
  const base = isMiraiAuth() ? window.location.origin : s?.cfg.url
  if (!s || !base) throw new Error("La API de Mirai no está configurada")
  const { browserRawFetch } = await import("./client")
  const res = await browserRawFetch()({
    url: `${base}/v1/books/${s.bookId}/chat/messages`,
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/x-ndjson" },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) throw ApiError.from(res.status, await res.json().catch(() => null), res.headers)
  return res as Response & { body: ReadableStream<Uint8Array> }
}
