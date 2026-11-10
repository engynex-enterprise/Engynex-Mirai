// Chat por la API: acciones sin streaming (sugerencias, confirmar/cancelar propuestas, adjuntos, título, duplicar,
// detalles) y los hilos (listar, buscar, cambiar, calificar). El streaming está en ./store.ts (@/lib/api/chat).
import { failure, isApiError } from "@/lib/api/errors"
import { activeBookId } from "@/lib/api/session"
import type { ChatHints, ChatMsg, ChatThread, Propuesta } from "@/lib/chat/types"
import type { AttachResult, ConfirmResult, ThreadInfo, TitleResult } from "@mirai/ai/server/chat-actions"
import { toBase64 } from "@/features/ai/api"

const client = () => import("@/lib/api/client")
const book = () => ({ bookId: activeBookId() })
const thread = (threadId: string) => ({ bookId: activeBookId(), threadId })

/** Nombre, rol, banderas del libro y estado de la IA (créditos) para la pantalla del chat. */
export async function chatHints(): Promise<ChatHints> {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().chat.hints({ params: book() }))
}

/** Confirma una propuesta del chat: recién aquí se escribe en el libro. */
export async function chatConfirm(messageId: string, propId: string): Promise<ConfirmResult> {
  try {
    const { browserApi, unwrapData } = await client()
    return { ok: true as const, ...unwrapData(await browserApi().chat.confirm({ params: { ...book(), messageId, propId } })) }
  } catch (e) {
    return failure(e)
  }
}

/** Cancela una propuesta (no escribe nada en el libro). */
export async function chatCancel(messageId: string, propId: string): Promise<{ ok: boolean; propuesta?: Propuesta }> {
  try {
    const { browserApi, unwrapData } = await client()
    return { ok: true, propuesta: unwrapData(await browserApi().chat.cancel({ params: { ...book(), messageId, propId } })).propuesta }
  } catch (e) {
    // Si la propuesta ya no estaba pendiente responde { ok:false }; los demás errores se lanzan.
    if (isApiError(e) && (e.code === "CONFLICT" || e.code === "NOT_FOUND")) return { ok: false }
    throw e
  }
}

/**
 * Adjuntos del chat (fotos, PDF o documentos ya preparados por ./files.ts): la IA los lee con la instrucción de la
 * persona y prepara una tarjeta por cada movimiento.
 */
export async function chatAttach(files: File[], text: string, threadId: string | null, tono?: "simple" | "fin"): Promise<AttachResult> {
  try {
    if (!files.length) return { ok: false as const, msg: "Elige una foto, un PDF o un documento." }
    const refs = await Promise.all(files.map(async (f) => ({ name: f.name || "archivo", type: f.type || "application/octet-stream", data: await toBase64(f) })))
    const { browserApi, unwrapData } = await client()
    return { ok: true as const, ...unwrapData(await browserApi().chat.attach({ params: book(), body: { files: refs, ...(text ? { text } : {}), threadId, ...(tono ? { tono } : {}) } })) }
  } catch (e) {
    return failure(e)
  }
}

/** Voz a texto con la IA (cuando el navegador no dicta). Lanza un Error con el mensaje para la persona. */
export async function chatTranscribe(wav: Blob): Promise<string> {
  const { browserApi, unwrapData } = await client()
  try {
    return unwrapData(await browserApi().chat.transcribe({ params: book(), body: { file: { name: "voz.wav", type: "audio/wav", data: await toBase64(wav) } } })).text
  } catch (e) {
    throw new Error(failure(e).msg)
  }
}

/** Título nuevo para una conversación: con IA si se puede; si no, con un algoritmo. */
export async function chatTitle(threadId: string): Promise<TitleResult> {
  try {
    const { browserApi, unwrapData } = await client()
    return { ok: true as const, ...unwrapData(await browserApi().chat.title({ params: thread(threadId) })) }
  } catch (e) {
    return failure(e)
  }
}

/** Copia una conversación con todos sus mensajes ("… (copia)"). */
export async function chatDuplicate(threadId: string): Promise<{ ok: true; id: string; titulo: string } | { ok: false; msg: string }> {
  try {
    const { browserApi, unwrapData } = await client()
    return { ok: true as const, ...unwrapData(await browserApi().chat.duplicate({ params: thread(threadId) })) }
  } catch (e) {
    return failure(e)
  }
}

/** Detalles de una conversación: mensajes, preguntas y créditos de IA que costó. */
export async function chatThreadInfo(threadId: string): Promise<ThreadInfo> {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().chat.info({ params: thread(threadId) }))
}

// ── Hilos ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Conversaciones propias del libro (también las archivadas), la más reciente primero. */
export async function listThreads(bookId: string): Promise<ChatThread[]> {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().chat.threads({ params: { bookId }, query: { limit: 200 } })).items as ChatThread[]
}

/** Mensajes de una conversación (vacío si ya no existe). */
export async function listMessages(threadId: string): Promise<ChatMsg[]> {
  const { browserApi, unwrap } = await client()
  try {
    return unwrap(await browserApi().chat.messages({ params: thread(threadId) })).items as ChatMsg[]
  } catch (e) {
    if (isApiError(e) && e.code === "NOT_FOUND") return []
    throw e
  }
}

/**
 * Cambia varias conversaciones: `titulo`, `fijado`, `archivado` o `deleted_at` (fecha = borrar, null = deshacer).
 * Devuelve el mensaje de error o null.
 */
export async function updateThreads(ids: string[], v: Record<string, unknown>): Promise<string | null> {
  try {
    const { browserApi, unwrapData } = await client()
    const api = browserApi()
    const patch: { titulo?: string; fijado?: boolean; archivado?: boolean } = {}
    if (typeof v.titulo === "string") patch.titulo = v.titulo
    if (typeof v.fijado === "boolean") patch.fijado = v.fijado
    if (typeof v.archivado === "boolean") patch.archivado = v.archivado
    await Promise.all(ids.map(async (id) => {
      const params = thread(id)
      if ("deleted_at" in v) unwrapData(v.deleted_at ? await api.chat.deleteThread({ params }) : await api.chat.restoreThread({ params }))
      if (Object.keys(patch).length) unwrapData(await api.chat.patchThread({ params, body: patch }))
    }))
    return null
  } catch (e) {
    return failure(e).msg
  }
}

// ── Buscar en las conversaciones y calificar una respuesta ──────────────────────────────────────────────────────

/** Ids de conversaciones propias cuyo texto contiene `t`. */
export async function searchThreads(bookId: string, t: string): Promise<Set<string>> {
  const { browserApi, unwrap } = await client()
  return new Set(unwrap(await browserApi().chat.search({ params: { bookId }, query: { q: t.slice(0, 100) } })).threadIds)
}

/** 👍 (1), 👎 (-1) o quitar (null) la calificación de una respuesta. Devuelve el mensaje de error o null. */
export async function rateMessage(messageId: string, feedback: 1 | -1 | null): Promise<string | null> {
  try {
    const { browserApi, unwrapData } = await client()
    unwrapData(await browserApi().chat.rateMessage({ params: { ...book(), messageId }, body: { feedback } }))
    return null
  } catch (e) {
    return failure(e).msg
  }
}
