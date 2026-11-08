// Chat en streaming por la API: POST /v1/books/:b/chat/messages (mismo origen, cookie de sesión) con Idempotency-Key.
// Protocolo NDJSON (un ChatEvent por línea; la API agrega un latido {"t":"ping"} cada 15 s que el lector ignora). Los
// errores de las guardas (rol, plan, límite `chat`) llegan como JSON antes del streaming y se convierten en ApiError
// con el mensaje en español de la API.
import { ApiError } from "./errors"
import { apiSession } from "./session"

export type ChatSendBody = { threadId: string | null; text: string; tono: string; editId?: string; regenerate?: string }

export async function apiChatSend(body: ChatSendBody, signal: AbortSignal): Promise<Response & { body: ReadableStream<Uint8Array> }> {
  const s = apiSession()
  if (!s) throw new Error("No hay un libro activo")
  const { browserRawFetch } = await import("./client")
  const res = await browserRawFetch()({
    url: `${window.location.origin}/v1/books/${s.bookId}/chat/messages`,
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/x-ndjson" },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) throw ApiError.from(res.status, await res.json().catch(() => null), res.headers)
  return res as Response & { body: ReadableStream<Uint8Array> }
}
