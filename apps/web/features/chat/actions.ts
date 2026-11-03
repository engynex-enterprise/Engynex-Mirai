"use server"

import "@/lib/services"
import { getAppContext } from "@/lib/dal"
import { limitError } from "@/lib/security/rate-limit"
import { supabaseServer } from "@/utils/supabase/server"
import { attachProblem, chatAttachWith, chatCancelWith, chatConfirmWith, chatDuplicateWith, chatHintsWith, chatThreadInfoWith, chatTitleWith, type AttachResult, type ConfirmResult, type ThreadInfo, type TitleResult } from "@mirai/ai/server/chat-actions"
import type { ChatHints, Propuesta } from "@/lib/chat/types"

// Acciones del chat que no van por streaming: datos para las sugerencias, confirmar o cancelar una propuesta y leer un
// adjunto (foto o PDF de una factura, recibo, comprobante o extracto). El streaming está en app/api/chat/route.ts.
// Renombrar, fijar, borrar y calificar se hacen desde el navegador (RLS "chat propio").
// Los casos de uso viven en packages/ai (@mirai/ai/server/chat-actions), los mismos de la API: aquí solo la sesión.

/** Nombre, rol, banderas del libro y estado de la IA (créditos) para la pantalla del chat. */
export async function chatHints(): Promise<ChatHints> {
  const ctx = await getAppContext()
  return chatHintsWith(ctx, await supabaseServer())
}

/**
 * Confirma una propuesta del chat: recién aquí se escribe en el libro. El permiso depende del tipo (lib/chat/permisos.ts:
 * "Registra sus gastos" confirma gastos e ingresos; Colabora y superiores, todo) y la escritura valida y recalcula los
 * datos con el libro de hoy (features/chat/confirm.ts).
 */
export async function chatConfirm(messageId: string, propId: string): Promise<ConfirmResult> {
  const ctx = await getAppContext()
  return chatConfirmWith(ctx, await supabaseServer(), messageId, propId)
}

/** Cancela una propuesta (no escribe nada en el libro). */
export async function chatCancel(messageId: string, propId: string): Promise<{ ok: boolean; propuesta?: Propuesta }> {
  await getAppContext()
  return chatCancelWith(await supabaseServer(), messageId, propId)
}

/**
 * Adjunto del chat (foto o PDF). Usa las lecturas que ya existen (features/ai/actions.ts): factura o recibo → tarjeta
 * para registrar el gasto; comprobante → resumen; extracto o documento de préstamo → resumen con enlace a Le debo.
 */
export async function chatAttach(fd: FormData): Promise<AttachResult> {
  const ctx = await getAppContext()
  const f = fd.get("file")
  const file = f instanceof File ? { name: f.name, type: f.type, size: f.size, data: "" } : null
  const bad = attachProblem(ctx, file)
  if (bad) return { ok: false, msg: bad }
  const lim = await limitError("chatAdjunto", ctx.user.id, "Enviaste muchos archivos seguidos")
  if (lim) return { ok: false, msg: lim }
  file!.data = Buffer.from(await (f as File).arrayBuffer()).toString("base64")
  return chatAttachWith(ctx, await supabaseServer(), { file, text: String(fd.get("text") ?? ""), threadId: String(fd.get("threadId") ?? "") || null })
}

/** Título nuevo para una conversación: con IA (modelo barato) si se puede; si no, con un algoritmo. */
export async function chatTitle(threadId: string): Promise<TitleResult> {
  const ctx = await getAppContext()
  return chatTitleWith(ctx, await supabaseServer(), threadId)
}

/** Copia una conversación con todos sus mensajes ("… (copia)"). */
export async function chatDuplicate(threadId: string): Promise<{ ok: true; id: string; titulo: string } | { ok: false; msg: string }> {
  const ctx = await getAppContext()
  return chatDuplicateWith(ctx, await supabaseServer(), threadId)
}

/** Detalles de una conversación: mensajes, preguntas y créditos de IA que costó. */
export async function chatThreadInfo(threadId: string): Promise<ThreadInfo> {
  await getAppContext()
  return chatThreadInfoWith(await supabaseServer(), threadId)
}
