"use client"

import { create } from "zustand"
import type { QueryClient } from "@tanstack/react-query"
import { toast } from "@/components/mirai/toast"
import type { ChatEvent, ChatMsg, Consulta, Propuesta, Tono } from "@/lib/chat/types"
import { chatAttach } from "./actions"

// Un solo motor de chat para la burbuja y /consejero: la conversación actual, la respuesta en curso (streaming) y el
// tono viven aquí (zustand), así la respuesta sigue llegando aunque cierres la ventana o abras la pantalla completa.

export const msgsKey = (threadId: string | null) => ["chat-msgs", threadId] as const
export const THREADS_KEY = ["chat-threads"] as const
const THREAD_KEY = "mirai-chat-thread"
const TONO_KEY = "mirai-chat-tono"

export type Live = {
  status: "idle" | "thinking" | "streaming"
  /** Conversación a la que pertenece la respuesta en curso. */
  threadId: string | null
  /** Mensaje de la persona (local hasta que el servidor lo guarda). */
  user: ChatMsg | null
  text: string
  tool: string | null
  propuestas: Propuesta[]
  decision: Consulta | null
  /** Al editar o regenerar: los mensajes desde este id se ocultan (el servidor los borra). */
  cutFrom: string | null
  /** Hay un adjunto leyéndose (sin streaming). */
  attach: boolean
}

const IDLE: Live = { status: "idle", threadId: null, user: null, text: "", tool: null, propuestas: [], decision: null, cutFrom: null, attach: false }

type ChatStore = {
  threadId: string | null
  setThread: (id: string | null) => void
  tono: Tono
  setTono: (t: Tono) => void
  live: Live
  /** Llegó una respuesta con la ventana cerrada (punto en la burbuja). */
  unread: boolean
  setUnread: (v: boolean) => void
  /** Texto del cuadro de escribir (se conserva entre la burbuja y la pantalla completa). */
  draft: string
  setDraft: (v: string) => void
  /** Mensaje escrito mientras Mirai respondía: se envía apenas termine. */
  queued: string | null
  /** ¿La ventana o la pantalla del chat está a la vista? (para el aviso de "respuesta lista"). */
  visible: number
  setVisible: (d: 1 | -1) => void
}

const read = (k: string) => { try { return sessionStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string | null) => { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k) } catch { /* sin almacenamiento */ } }

export const useChat = create<ChatStore>((set) => ({
  threadId: null,
  setThread: (threadId) => { write(THREAD_KEY, threadId); set({ threadId }) },
  tono: "simple",
  setTono: (tono) => { try { localStorage.setItem(TONO_KEY, tono) } catch { /* sin almacenamiento */ } set({ tono }) },
  live: IDLE,
  unread: false,
  setUnread: (unread) => set({ unread }),
  draft: "",
  queued: null,
  // Siempre texto: un valor raro (p. ej. el evento de un clic pasado a openChat) no debe tumbar la caja de texto.
  setDraft: (draft) => set({ draft: typeof draft === "string" ? draft : "" }),
  visible: 0,
  setVisible: (d) => set((s) => ({ visible: Math.max(0, s.visible + d), ...(d > 0 ? { unread: false } : {}) })),
}))

/** Recupera la conversación y el tono de la sesión (una vez, ya en el navegador). */
export function restoreChat() {
  const s = useChat.getState()
  const t = read(THREAD_KEY)
  let tono: Tono | null = null
  try { tono = localStorage.getItem(TONO_KEY) as Tono | null } catch { /* sin almacenamiento */ }
  useChat.setState({ ...(typeof s.draft !== "string" ? { draft: "" } : {}), ...(t && !s.threadId ? { threadId: t } : {}), ...(tono === "fin" || tono === "simple" ? { tono } : {}) })
}

let ctrl: AbortController | null = null
const patch = (p: Partial<Live>) => useChat.setState((s) => ({ live: { ...s.live, ...p } }))

/** Mezcla la respuesta guardada en la caché de mensajes (sin esperar a volver a consultar). */
function commit(qc: QueryClient, threadId: string, cutFrom: string | null, add: ChatMsg[]) {
  qc.setQueryData<ChatMsg[]>(msgsKey(threadId), (prev = []) => {
    const i = cutFrom ? prev.findIndex((m) => m.id === cutFrom) : -1
    const base = i >= 0 ? prev.slice(0, i) : prev
    return [...base.filter((m) => !add.some((a) => a.id === m.id)), ...add]
  })
  qc.invalidateQueries({ queryKey: THREADS_KEY })
}

/** Envía un mensaje (o edita uno anterior, o regenera la última respuesta) y recibe la respuesta en streaming. */
export async function sendChat(qc: QueryClient, input: { text: string; editId?: string; regenerate?: string }) {
  const st = useChat.getState()
  const text = String(input.text ?? "").trim()
  if (st.live.status !== "idle") {
    // Mientras responde, lo nuevo queda en cola y se envía al terminar (no se pierde lo que escribiste).
    if (text && !input.editId && !input.regenerate) useChat.setState({ queued: text, draft: "" })
    return
  }
  if (!text && !input.regenerate) return
  const now = new Date().toISOString()
  const cutFrom = input.editId ?? input.regenerate ?? null
  const localUser: ChatMsg | null = input.regenerate ? null : { id: `local-${Date.now()}`, role: "user", content: text, meta: {}, feedback: null, adjuntos: [], created_at: now }
  useChat.setState({ live: { ...IDLE, status: "thinking", threadId: st.threadId, user: localUser, cutFrom }, draft: input.editId ? st.draft : "" })
  ctrl = new AbortController()
  let threadId = st.threadId
  let user: ChatMsg | null = null
  let done: ChatMsg | null = null
  let failed: string | null = null
  try {
    const res = await fetch("/api/chat", {
      method: "POST", headers: { "content-type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ threadId, text, tono: st.tono, editId: input.editId, regenerate: input.regenerate }),
    })
    if (res.status === 429) throw new Error(((await res.json().catch(() => ({}))) as { msg?: string }).msg ?? "Enviaste muchos mensajes seguidos. Espera un momento.")
    if (!res.ok || !res.body) throw new Error(res.status === 401 ? "Tu sesión se cerró. Vuelve a entrar." : "No pudimos conectarnos con Mirai. Revisa tu conexión.")
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ""
    const handle = (e: ChatEvent) => {
      if (e.t === "thread") {
        threadId = e.id
        patch({ threadId: e.id })
        if (useChat.getState().threadId !== e.id) { useChat.getState().setThread(e.id); if (e.nuevo) qc.setQueryData(msgsKey(e.id), []) }
        if (e.nuevo) qc.invalidateQueries({ queryKey: THREADS_KEY })
      } else if (e.t === "user") { user = e.msg; patch({ user: e.msg }) }
      else if (e.t === "tool") patch({ tool: e.label })
      else if (e.t === "delta") useChat.setState((s) => ({ live: { ...s.live, status: "streaming", text: s.live.text + e.text } }))
      else if (e.t === "card") useChat.setState((s) => ({ live: { ...s.live, ...(e.propuesta ? { propuestas: [...s.live.propuestas, e.propuesta] } : {}), ...(e.decision ? { decision: e.decision } : {}) } }))
      else if (e.t === "done") done = e.msg
      else if (e.t === "error") failed = e.msg
    }
    for (;;) {
      const { value, done: end } = await reader.read()
      if (end) break
      buf += dec.decode(value, { stream: true })
      let i: number
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (line) try { handle(JSON.parse(line)) } catch { /* línea incompleta */ }
      }
    }
  } catch (e) {
    if ((e as Error).name !== "AbortError") failed = (e as Error).message
  }
  const stopped = ctrl?.signal.aborted
  ctrl = null
  const live = useChat.getState().live
  if (threadId) {
    if (done) commit(qc, threadId, cutFrom, [...(user ? [user] : []), done])
    else if (stopped) {
      // Detenida: se muestra lo que alcanzó a llegar; el servidor guarda lo mismo y luego se vuelve a consultar.
      const partial: ChatMsg = { id: `local-a-${Date.now()}`, role: "assistant", content: live.text, meta: { detenido: true, fuente: "ia" }, feedback: null, adjuntos: [], created_at: new Date().toISOString() }
      commit(qc, threadId, cutFrom, [...(user ? [user] : []), partial])
      setTimeout(() => qc.invalidateQueries({ queryKey: msgsKey(threadId) }), 1500)
    } else qc.invalidateQueries({ queryKey: msgsKey(threadId) })
  }
  useChat.setState((s) => ({ live: IDLE, unread: !!done && s.visible === 0 ? true : s.unread }))
  if (failed) toast.error("No pudimos responder", { description: failed })
  const next = useChat.getState().queued
  if (next) { useChat.setState({ queued: null }); if (!stopped) void sendChat(qc, { text: next }); else useChat.setState({ draft: next }) }
}

/** Detiene la respuesta que se está escribiendo. */
export function stopChat() { ctrl?.abort() }

/** Envía una foto o PDF con un texto opcional (se lee con las funciones de IA de facturas y documentos). */
export async function sendAttachment(qc: QueryClient, file: File, text: string) {
  const st = useChat.getState()
  if (st.live.status !== "idle") return
  const now = new Date().toISOString()
  const localUser: ChatMsg = { id: `local-${Date.now()}`, role: "user", content: text || "Te comparto un documento.", meta: {}, feedback: null, adjuntos: [{ nombre: file.name, tipo: file.type, tam: file.size }], created_at: now }
  useChat.setState({ live: { ...IDLE, status: "thinking", threadId: st.threadId, user: localUser, tool: "Leyendo tu documento", attach: true }, draft: "" })
  const fd = new FormData()
  fd.set("file", file)
  fd.set("text", text)
  if (st.threadId) fd.set("threadId", st.threadId)
  try {
    const r = await chatAttach(fd)
    if (!r.ok) toast.error("No pudimos leer el documento", { description: r.msg })
    else {
      if (r.nuevo) { qc.setQueryData(msgsKey(r.threadId), []); useChat.getState().setThread(r.threadId) }
      commit(qc, r.threadId, null, [r.user, r.answer])
    }
  } catch (e) { toast.error("No pudimos leer el documento", { description: (e as Error).message }) }
  useChat.setState((s) => ({ live: IDLE, unread: s.visible === 0 ? true : s.unread }))
}
