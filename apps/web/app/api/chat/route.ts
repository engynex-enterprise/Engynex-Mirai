import "@/lib/services"
import { getAppContext } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { ChatTurnBody, runChatTurn } from "@mirai/ai/server/chat-turn"
import type { ChatEvent } from "@/lib/chat/types"
import { limitError } from "@/lib/security/rate-limit"

// Chat de Mirai en streaming (burbuja y /consejero). Responde una línea JSON por evento (lib/chat/types.ts › ChatEvent).
// El turno completo (decisión → registrar → preguntas de datos → aviso sin IA → IA con herramientas) vive en
// packages/ai (@mirai/ai/server/chat-turn), el mismo que usa la API (POST /v1/books/:b/chat/messages). Aquí quedan la
// sesión, el límite de tasa, la validación y el stream.

export const maxDuration = 60

/** Solo peticiones desde Mirai (defensa extra contra CSRF: las cookies ya son SameSite=Lax). */
function sameOrigin(req: Request) {
  const origin = req.headers.get("origin")
  if (!origin) return true
  try { return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host")) } catch { return false }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ msg: "Origen no permitido" }, { status: 403 })
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return Response.json({ msg: "Solicitud inválida" }, { status: 415 })
  const ctx = await getAppContext()
  const lim = await limitError("chat", ctx.user.id, "Enviaste muchos mensajes seguidos")
  if (lim) return Response.json({ msg: lim }, { status: 429 })
  const parsed = ChatTurnBody.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ msg: "Solicitud inválida" }, { status: 400 })
  const body = parsed.data
  const sb = await supabaseServer()
  const ac = new AbortController()
  req.signal.addEventListener("abort", () => ac.abort())
  const enc = new TextEncoder()
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: ChatEvent) => {
        if (closed) return
        try { controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`)) } catch { closed = true }
      }
      try {
        await runChatTurn({ ctx, sb, body, emit, signal: ac.signal })
      } finally {
        if (!closed) { closed = true; try { controller.close() } catch { /* ya cerrado */ } }
      }
    },
    cancel() { closed = true; ac.abort() },
  })
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } })
}
