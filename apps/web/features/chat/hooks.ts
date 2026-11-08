"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { toast } from "@/components/mirai/toast"
import { useApp } from "@/components/app/app-context"
import type { ChatMsg, ChatThread } from "@/lib/chat/types"
import { threadMarkdown, threadPlain } from "@/lib/chat/history"
import { chatDuplicate, chatHints, chatTitle, listMessages, listThreads, rateMessage, searchThreads, updateThreads } from "./api"
import { THREADS_KEY, msgsKey, useChat } from "./store"
import { saveFile } from "@/lib/pwa/save-file"

/** Conversaciones de la persona en el libro activo, también las archivadas (más recientes primero). */
export function useThreads(enabled = true) {
  const { user, book } = useApp()
  return useQuery({
    queryKey: [...THREADS_KEY, user.id, book.id], enabled,
    // GET /v1/books/:b/chat/threads (./api.ts).
    queryFn: () => listThreads(book.id),
  })
}

/** Mensajes de una conversación. */
export function useThreadMessages(threadId: string | null) {
  return useQuery({
    queryKey: msgsKey(threadId), enabled: !!threadId && !threadId.startsWith("local"),
    queryFn: () => listMessages(threadId!),
  })
}

/** Nombre, rol, banderas del libro y créditos de IA (para sugerencias y avisos). */
export function useChatHints(enabled = true) {
  const { book } = useApp()
  return useQuery({ queryKey: ["chat-hints", book.id], enabled, queryFn: () => chatHints(), staleTime: 120_000 })
}

/** Ids de conversaciones cuyo contenido coincide con la búsqueda (además del título). */
export function useThreadSearch(q: string) {
  const { book } = useApp()
  const t = String(q ?? "").trim()
  return useQuery({
    queryKey: ["chat-search", book.id, t], enabled: t.length >= 3, staleTime: 30_000,
    queryFn: () => searchThreads(book.id, t),
  })
}

const fileName = (t: ChatThread, ext: string) => `mirai-${t.titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 50) || "conversacion"}.${ext}`
const download = (name: string, text: string, type: string) => {
  void saveFile(new Blob([text], { type }), name)
}
/** Mensajes para exportar (por la API: ./api.ts). */
const threadMsgs = (id: string) => listMessages(id)

/** Acciones del historial (menú ⋯, clic derecho y encabezado): fijar, renombrar, título, duplicar, archivar, exportar y borrar. */
export function useThreadActions() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: THREADS_KEY })
  const patchList = (ids: string[], v: Record<string, unknown>) =>
    qc.setQueriesData<ChatThread[]>({ queryKey: THREADS_KEY }, (old) => old?.map((t) => (ids.includes(t.id) ? { ...t, ...v } : t)).filter((t) => !(ids.includes(t.id) && v.deleted_at)))
  const upd = async (ids: string[], v: Record<string, unknown>) => {
    patchList(ids, v) // cambio optimista: se siente inmediato
    const error = await updateThreads(ids, v)
    if (error) toast.error("No se pudo guardar", { description: error })
    refresh()
    return !error
  }
  const leaveIf = (ids: string[]) => { if (ids.includes(useChat.getState().threadId ?? "")) useChat.getState().setThread(null) }
  return {
    rename: async (t: ChatThread, titulo: string) => {
      const v = String(titulo ?? "").trim().slice(0, 80)
      if (!v || v === t.titulo) return
      if (await upd([t.id], { titulo: v, titulo_auto: false })) toast.success("Conversación renombrada")
    },
    pin: async (t: ChatThread) => { if (await upd([t.id], { fijado: !t.fijado })) toast.success(t.fijado ? "Ya no está fijada" : "Conversación fijada arriba") },
    archive: async (ts: ChatThread[], value = true) => {
      const ids = ts.map((t) => t.id)
      if (!(await upd(ids, { archivado: value }))) return
      if (value) leaveIf(ids)
      toast(value ? (ids.length > 1 ? `${ids.length} conversaciones archivadas` : "Conversación archivada") : "Conversación desarchivada", {
        description: value ? "Las encuentras en Archivadas." : undefined,
        action: { label: "Deshacer", onClick: () => { upd(ids, { archivado: !value }) } },
      })
    },
    remove: async (ts: ChatThread[]) => {
      const ids = ts.map((t) => t.id)
      if (!(await upd(ids, { deleted_at: new Date().toISOString() }))) return
      leaveIf(ids)
      toast(ids.length > 1 ? `${ids.length} conversaciones eliminadas` : "Conversación eliminada", {
        description: ids.length === 1 ? `“${ts[0].titulo}”` : undefined,
        action: { label: "Deshacer", onClick: async () => { if (await upd(ids, { deleted_at: null })) toast.success("Listo, la recuperamos") } },
      })
    },
    retitle: async (t: ChatThread) => {
      const id = toast.loading("Pensando un buen título…")
      const r = await chatTitle(t.id)
      toast.dismiss(id)
      if (!r.ok) return toast.error("No se pudo cambiar el título", { description: r.msg })
      refresh()
      toast.success(`Nuevo título: “${r.titulo}”`, { description: r.fuente === "ia" ? "Sugerido por la IA." : "Calculado con lo que preguntaste." })
    },
    duplicate: async (t: ChatThread) => {
      const r = await chatDuplicate(t.id)
      if (!r.ok) return toast.error("No se pudo duplicar", { description: r.msg })
      refresh()
      useChat.getState().setThread(r.id)
      toast.success("Conversación duplicada", { description: `“${r.titulo}”` })
    },
    copyText: async (t: ChatThread) => {
      try { await navigator.clipboard.writeText(threadPlain(t, await threadMsgs(t.id))); toast.success("Conversación copiada como texto") } catch { toast.error("No se pudo copiar") }
    },
    markdown: async (t: ChatThread) => { download(fileName(t, "md"), threadMarkdown(t, await threadMsgs(t.id)), "text/markdown;charset=utf-8"); toast.success("Descargamos la conversación en Markdown") },
    pdf: async (t: ChatThread) => {
      const id = toast.loading("Preparando el PDF…")
      try {
        const { downloadChatPdf } = await import("./chat-pdf")
        await downloadChatPdf(t.titulo, await threadMsgs(t.id), fileName(t, "pdf"))
        toast.dismiss(id); toast.success("Descargamos la conversación en PDF")
      } catch (e) { toast.dismiss(id); toast.error("No se pudo crear el PDF", { description: (e as Error).message }) }
    },
    copyLink: async (t: ChatThread) => {
      try { await navigator.clipboard.writeText(`${location.origin}/consejero?c=${t.id}`); toast.success("Enlace copiado", { description: "Solo tú puedes abrir esta conversación." }) } catch { toast.error("No se pudo copiar el enlace") }
    },
    feedback: async (threadId: string, m: ChatMsg, v: 1 | -1) => {
      const next = m.feedback === v ? null : v
      qc.setQueryData<ChatMsg[]>(msgsKey(threadId), (old) => old?.map((x) => (x.id === m.id ? { ...x, feedback: next } : x)))
      const error = await rateMessage(m.id, next)
      if (error) toast.error("No se pudo guardar tu calificación")
      else if (next) toast.success(next === 1 ? "Gracias, nos ayuda a mejorar" : "Gracias por contarnos. Intenta regenerar la respuesta o pregúntalo de otra forma.")
    },
  }
}
