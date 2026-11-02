"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowDown } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { ChatMsg } from "@/lib/chat/types"
import { Composer } from "./composer"
import { useChatHints, useThreadMessages } from "./hooks"
import { AssistantMessage, UserMessage } from "./message"
import { sendChat, useChat } from "./store"
import { Welcome } from "./welcome"

/**
 * La conversación (mensajes + caja de texto). La misma pieza va en la burbuja (`compact`) y en /consejero: comparten la
 * conversación actual y la respuesta en curso (features/chat/store.ts).
 */
export function Conversation({ compact, autoFocus }: { compact?: boolean; autoFocus?: boolean }) {
  const qc = useQueryClient()
  const threadId = useChat((s) => s.threadId)
  const live = useChat((s) => s.live)
  const { data: hints } = useChatHints()
  const msgs = useThreadMessages(threadId)
  const busy = live.status !== "idle"
  const here = busy && live.threadId === threadId

  let list: ChatMsg[] = threadId ? msgs.data ?? [] : []
  if (here && live.cutFrom) { const i = list.findIndex((m) => m.id === live.cutFrom); if (i >= 0) list = list.slice(0, i) }
  const items = [...list, ...(here && live.user && !list.some((m) => m.id === live.user!.id) ? [live.user] : [])]
  const liveMsg: ChatMsg | null = here ? { id: "local-live", role: "assistant", content: live.text, meta: { propuestas: live.propuestas, ...(live.decision ? { decision: live.decision } : {}) }, feedback: null, adjuntos: [], created_at: "" } : null
  const lastA = [...items].reverse().find((m) => m.role === "assistant")
  const empty = !items.length && !liveMsg

  // Se queda abajo mientras llega la respuesta, salvo que la persona haya subido a leer.
  const box = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const stick = useRef(true)
  const toEnd = (smooth = false) => { const el = box.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" }) }
  useLayoutEffect(() => { stick.current = true; toEnd() }, [threadId, msgs.isPending])
  useLayoutEffect(() => { if (stick.current) toEnd() }, [items.length, live.text, live.propuestas.length, live.decision, live.status])

  // Aviso para lectores de pantalla al terminar una respuesta.
  const [announce, setAnnounce] = useState("")
  const prev = useRef(live.status)
  useEffect(() => {
    if (prev.current !== "idle" && live.status === "idle") queueMicrotask(() => setAnnounce("Mirai respondió"))
    else if (live.status === "thinking") queueMicrotask(() => setAnnounce("Mirai está pensando"))
    prev.current = live.status
  }, [live.status])

  const follow = (q: string) => sendChat(qc, { text: q })
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={box} role="log" aria-label="Conversación con Mirai" aria-busy={busy}
        onScroll={(e) => { const el = e.currentTarget; const b = el.scrollHeight - el.scrollTop - el.clientHeight < 48; stick.current = b; if (b !== atBottom) setAtBottom(b) }}
        className={cn("min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain", compact ? "px-3" : "px-3 sm:px-6")}>
        <div className={cn("mx-auto grid w-full gap-4", compact ? "py-3" : "max-w-3xl py-5", empty && "h-full")}>
          {threadId && msgs.isPending && !here ? (
            <div className="grid gap-4" aria-label="Cargando la conversación">
              <Skeleton className="ml-auto h-10 w-2/3 rounded-[20px]" /><div className="flex gap-2.5"><Skeleton className="size-8 rounded-full" /><Skeleton className="h-24 flex-1 rounded-[20px]" /></div>
              <Skeleton className="ml-auto h-10 w-1/2 rounded-[20px]" /><div className="flex gap-2.5"><Skeleton className="size-8 rounded-full" /><Skeleton className="h-16 flex-1 rounded-[20px]" /></div>
            </div>
          ) : empty ? (
            <Welcome hints={hints} compact={compact} />
          ) : (
            <>
              {items.map((m) => m.role === "user"
                ? <UserMessage key={m.id} m={m} threadId={threadId} busy={busy} />
                : <AssistantMessage key={m.id} m={m} threadId={threadId} last={!liveMsg && m.id === lastA?.id} busy={busy} onFollow={follow} />)}
              {liveMsg && <AssistantMessage m={liveMsg} threadId={threadId} streaming tool={live.tool} />}
            </>
          )}
        </div>
      </div>
      {!atBottom && !empty && (
        <button type="button" aria-label="Ir al final de la conversación" onClick={() => { stick.current = true; toEnd(true) }}
          className="appear absolute left-1/2 z-10 grid size-9 -translate-x-1/2 place-items-center rounded-full bg-card shadow-[0_4px_12px_rgba(0,0,0,.15)] ring-1 ring-black/5 hover:bg-hover" style={{ bottom: compact ? 132 : 150 }}>
          <ArrowDown className="size-4" />
        </button>
      )}
      <div className={cn("relative shrink-0 bg-gradient-to-t from-popover via-popover to-transparent pt-2", compact ? "px-3 pb-3" : "px-3 pb-3 sm:px-6 sm:pb-4")}>
        <div className={cn("mx-auto w-full", !compact && "max-w-3xl")}><Composer hints={hints} autoFocus={autoFocus} compact={compact} /></div>
      </div>
      <p className="sr-only" aria-live="polite">{announce}</p>
    </div>
  )
}
