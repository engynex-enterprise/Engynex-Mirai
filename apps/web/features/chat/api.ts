// Chat por la API (v6 F2-H-5/H-6, interruptor `chat`): acciones sin streaming (sugerencias, confirmar/cancelar
// propuestas, adjuntos, título, duplicar, detalles) y los hilos que el navegador leía y escribía directo en
// chat_threads / chat_messages. Misma firma y misma forma que ./actions.ts y que las consultas de ./hooks.ts; con el
// interruptor apagado es exactamente lo de siempre. El streaming está en ./store.ts (@/lib/api/chat).
import { createClient } from "@/utils/supabase/client"
import { readWithFallback } from "@/lib/api/book-tables"
import { failure, isApiError } from "@/lib/api/errors"
import { activeBookId, apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import { MSG_COLS, THREAD_COLS, toMsg, type ChatMsg, type ChatThread } from "@/lib/chat/types"
import { fileRefOf } from "@/features/ai/api"
import * as actions from "./actions"

const on = () => apiOn("chat")
/** viaApiOr con la forma de la respuesta fijada por la acción (la versión de la API tiene que devolver lo mismo). */
const wrap = <A extends unknown[], R>(action: (...a: A) => Promise<R>, api: (...a: A) => Promise<NoInfer<R>>) => viaApiOr(on, action, api)
const client = () => import("@/lib/api/client")
const book = () => ({ bookId: activeBookId() })
const thread = (threadId: string) => ({ bookId: activeBookId(), threadId })

export const chatHints = wrap(actions.chatHints, async () => {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().chat.hints({ params: book() }))
})

export const chatConfirm = wrap(actions.chatConfirm, async (messageId, propId) => {
  try {
    const { browserApi, unwrapData } = await client()
    return { ok: true as const, ...unwrapData(await browserApi().chat.confirm({ params: { ...book(), messageId, propId } })) }
  } catch (e) {
    return failure(e)
  }
})

export const chatCancel = wrap(actions.chatCancel, async (messageId, propId) => {
  try {
    const { browserApi, unwrapData } = await client()
    return { ok: true, propuesta: unwrapData(await browserApi().chat.cancel({ params: { ...book(), messageId, propId } })).propuesta }
  } catch (e) {
    // La acción respondía { ok:false } si la propuesta ya no estaba pendiente; los demás errores se lanzan como antes.
    if (isApiError(e) && (e.code === "CONFLICT" || e.code === "NOT_FOUND")) return { ok: false }
    throw e
  }
})

export const chatAttach = wrap(actions.chatAttach, async (fd) => {
  try {
    const file = await fileRefOf(fd)
    if (!file) return { ok: false as const, msg: "Elige una foto o un PDF." }
    const text = String(fd.get("text") ?? "")
    const threadId = String(fd.get("threadId") ?? "") || null
    const { browserApi, unwrapData } = await client()
    return { ok: true as const, ...unwrapData(await browserApi().chat.attach({ params: book(), body: { file, ...(text ? { text } : {}), threadId } })) }
  } catch (e) {
    return failure(e)
  }
})

export const chatTitle = wrap(actions.chatTitle, async (threadId) => {
  try {
    const { browserApi, unwrapData } = await client()
    return { ok: true as const, ...unwrapData(await browserApi().chat.title({ params: thread(threadId) })) }
  } catch (e) {
    return failure(e)
  }
})

export const chatDuplicate = wrap(actions.chatDuplicate, async (threadId) => {
  try {
    const { browserApi, unwrapData } = await client()
    return { ok: true as const, ...unwrapData(await browserApi().chat.duplicate({ params: thread(threadId) })) }
  } catch (e) {
    return failure(e)
  }
})

export const chatThreadInfo = wrap(actions.chatThreadInfo, async (threadId) => {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().chat.info({ params: thread(threadId) }))
})

// ── Hilos (antes supabase-js directo en ./hooks.ts) ──────────────────────────────────────────────────────────────

async function threadsFromDb(bookId: string, userId: string): Promise<ChatThread[]> {
  const { data, error } = await createClient().from("chat_threads").select(THREAD_COLS).eq("book_id", bookId).eq("user_id", userId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(200)
  if (error) throw new Error(error.message)
  return (data ?? []) as ChatThread[]
}

async function messagesFromDb(threadId: string): Promise<ChatMsg[]> {
  const { data, error } = await createClient().from("chat_messages").select(MSG_COLS).eq("thread_id", threadId).is("deleted_at", null).order("created_at")
  if (error) throw new Error(error.message)
  return (data ?? []).map(toMsg)
}

/** Conversaciones propias del libro (también las archivadas), la más reciente primero. */
export function listThreads(bookId: string, userId: string): Promise<ChatThread[]> {
  if (!on()) return threadsFromDb(bookId, userId)
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await client()
    return unwrap(await browserApi().chat.threads({ params: { bookId }, query: { limit: 200 } })).items as ChatThread[]
  }, () => threadsFromDb(bookId, userId))
}

/** Mensajes de una conversación (vacío si ya no existe, como la consulta directa). */
export function listMessages(threadId: string): Promise<ChatMsg[]> {
  if (!on()) return messagesFromDb(threadId)
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await client()
    try {
      return unwrap(await browserApi().chat.messages({ params: thread(threadId) })).items as ChatMsg[]
    } catch (e) {
      if (isApiError(e) && e.code === "NOT_FOUND") return []
      throw e
    }
  }, () => messagesFromDb(threadId))
}

/**
 * Cambia varias conversaciones como el `update(...).in("id", ids)` de siempre: `titulo`, `fijado`, `archivado` o
 * `deleted_at` (fecha = borrar, null = deshacer). Devuelve el mensaje de error o null.
 */
export async function updateThreads(ids: string[], v: Record<string, unknown>): Promise<string | null> {
  if (!on()) {
    const { error } = await createClient().from("chat_threads").update(v as never).in("id", ids)
    return error ? error.message : null
  }
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
