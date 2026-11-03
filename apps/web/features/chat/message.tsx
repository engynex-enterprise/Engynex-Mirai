"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowUpRight, Calculator, Check, Copy, FileText, Image as ImageIcon, Pencil, RefreshCw, Search, Square, ThumbsDown, ThumbsUp } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { DecisionCard } from "@/features/advisor/decision-card"
import { plainText } from "@/lib/chat/markdown"
import { cn } from "@/lib/utils"
import type { ChatMsg } from "@/lib/chat/types"
import { AvisoAction, ConfirmCard } from "./cards"
import { Markdown } from "./markdown"
import { useThreadActions } from "./hooks"
import { sendChat, useChat } from "./store"

/** Avatar del asistente: el isotipo de Mirai (sol que sale) en un círculo. */
export function MiraiAvatar({ size = 32, className, live }: { size?: number; className?: string; live?: boolean }) {
  return (
    <span className={cn("relative grid shrink-0 place-items-center rounded-full bg-white shadow-[0_1px_3px_rgba(31,43,75,.18)] ring-1 ring-black/5 dark:bg-[#242526] dark:ring-white/10", className)} style={{ width: size, height: size }}>
      <IsoIcon k="mirai" size={Math.round(size * 0.72)} />
      {live && <span aria-hidden className="absolute -right-0.5 -bottom-0.5 size-[30%] rounded-full bg-[#31A24C] ring-2 ring-background" />}
    </span>
  )
}

function Act({ label, onClick, children, pressed }: { label: string; onClick: () => void; children: React.ReactNode; pressed?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} aria-pressed={pressed} onClick={onClick}
          className={cn("grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground", pressed && "bg-brand-soft text-link")}>{children}</button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

const copy = async (text: string) => {
  try { await navigator.clipboard.writeText(plainText(text)); toast.success("Copiado") } catch { toast.error("No se pudo copiar") }
}

export function UserMessage({ m, threadId, busy }: { m: ChatMsg; threadId: string | null; busy: boolean }) {
  const qc = useQueryClient()
  const [edit, setEdit] = useState<string | null>(null)
  const local = m.id.startsWith("local")
  if (edit !== null)
    return (
      <div className="ml-auto grid w-full max-w-[85%] gap-2 rounded-[20px] bg-secondary p-2.5">
        <Textarea autoFocus value={edit} aria-label="Edita tu mensaje" className="min-h-16 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0" onChange={(e) => setEdit(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if ((edit ?? "").trim()) { setEdit(null); sendChat(qc, { text: edit, editId: m.id }) } } if (e.key === "Escape") setEdit(null) }} />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
          <Button size="sm" disabled={!(edit ?? "").trim() || busy} onClick={() => { const t = edit; setEdit(null); sendChat(qc, { text: t, editId: m.id }) }}>Enviar</Button>
        </div>
      </div>
    )
  return (
    <div className="group/msg ml-auto flex max-w-[88%] flex-col items-end gap-1">
      {!!m.adjuntos.length && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {m.adjuntos.map((a) => (
            <span key={a.nombre} className="flex max-w-56 items-center gap-2 rounded-xl bg-card px-2.5 py-1.5 text-[12.5px] shadow-card ring-1 ring-black/5">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-link">{a.tipo.startsWith("image") ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}</span>
              <span className="truncate">{a.nombre}</span>
            </span>
          ))}
        </div>
      )}
      <div className="rounded-[20px] rounded-br-md bg-brand px-3.5 py-2 text-[15px] leading-relaxed whitespace-pre-wrap text-white [overflow-wrap:anywhere] shadow-[0_1px_2px_rgba(0,0,0,.12)]">{m.content}</div>
      {!local && (
        <div className="flex gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover/msg:opacity-100 md:focus-within:opacity-100">
          <Act label="Copiar" onClick={() => copy(m.content)}><Copy className="size-3.5" /></Act>
          {threadId && !busy && <Act label="Editar y volver a enviar" onClick={() => setEdit(m.content)}><Pencil className="size-3.5" /></Act>}
        </div>
      )}
    </div>
  )
}

const FUENTE: Record<string, { l: string; I: typeof Calculator } | undefined> = {
  algoritmo: { l: "Calculado con tus datos", I: Calculator },
  consejero: { l: "Calculado con tus datos", I: Calculator },
}

export function AssistantMessage({ m, threadId, last, streaming, busy, onFollow, tool }: {
  m: ChatMsg; threadId: string | null; last?: boolean; streaming?: boolean; busy?: boolean; onFollow?: (q: string) => void; tool?: string | null
}) {
  const qc = useQueryClient()
  const { feedback } = useThreadActions()
  const f = m.meta.fuente ? FUENTE[m.meta.fuente] : undefined
  const local = m.id.startsWith("local")
  const thinking = streaming && !m.content && !m.meta.decision && !m.meta.propuestas?.length
  return (
    <div className="group/msg flex w-full min-w-0 items-start gap-2.5">
      <MiraiAvatar size={30} className="mt-0.5" />
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] justify-items-start gap-2">
        {!!m.meta.consultas?.length && !streaming && (
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Search className="size-3" /> Revisé {m.meta.consultas.join(", ")}</p>
        )}
        {thinking ? (
          <div className="flex items-center gap-2 rounded-[20px] rounded-tl-md bg-secondary/80 px-4 py-3 text-[13.5px] text-muted-foreground" role="status">
            <span className="flex gap-1" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-brand/70" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>
            <span className="animate-pulse">{tool ? `${tool}…` : "Pensando…"}</span>
          </div>
        ) : null}
        {!!m.content && (
          <div className={cn("max-w-full rounded-[20px] rounded-tl-md bg-secondary/80 px-3.5 py-2.5 dark:bg-white/[.06]", streaming && "chat-caret")}>
            <Markdown text={m.content} />
          </div>
        )}
        {/* En una decisión, primero la respuesta en palabras y después la tarjeta con el análisis. */}
        {m.meta.decision && <DecisionCard c={m.meta.decision} />}
        {streaming && m.content && tool && tool !== "Pensando" && <p className="animate-pulse text-[12px] text-muted-foreground">{tool}…</p>}
        {m.meta.propuestas?.map((p) => <ConfirmCard key={p.id} p={p} msg={local || streaming ? null : m} threadId={threadId} />)}
        {m.meta.aviso && !streaming && <AvisoAction aviso={m.meta.aviso} />}
        {!streaming && (
          <div className="flex flex-wrap items-center gap-0.5">
            {f && <span className="mr-1.5 inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11.5px] font-semibold text-link" title="Respuesta instantánea: Mirai la calculó con tus datos, sin usar IA"><f.I className="size-3" /> {f.l}</span>}
            {m.meta.detenido && <span className="mr-1.5 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground"><Square className="size-2.5 fill-current" /> Detenido</span>}
            {!local && !!m.content && <Act label="Copiar" onClick={() => copy(m.content)}><Copy className="size-3.5" /></Act>}
            {!local && last && !busy && threadId && <Act label="Regenerar respuesta" onClick={() => sendChat(qc, { text: "", regenerate: m.id })}><RefreshCw className="size-3.5" /></Act>}
            {!local && threadId && <>
              <Act label="Buena respuesta" pressed={m.feedback === 1} onClick={() => feedback(threadId, m, 1)}>{m.feedback === 1 ? <Check className="size-3.5" /> : <ThumbsUp className="size-3.5" />}</Act>
              <Act label="Mala respuesta" pressed={m.feedback === -1} onClick={() => feedback(threadId, m, -1)}><ThumbsDown className="size-3.5" /></Act>
            </>}
          </div>
        )}
        {last && !streaming && !busy && !!m.meta.sugerencias?.length && onFollow && (
          <div className="flex flex-wrap gap-1.5 pt-0.5" aria-label="Preguntas sugeridas">
            {m.meta.sugerencias.map((q) => (
              <button key={q} type="button" onClick={() => onFollow(q)} className="press flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-left text-[13px] font-medium shadow-[0_1px_2px_rgba(0,0,0,.08)] ring-1 ring-black/5 transition-colors hover:bg-hover dark:ring-white/10">
                {q}<ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Texto para lectores de pantalla cuando termina una respuesta. */
export function useAnnounce() {
  return useChat((s) => (s.live.status === "idle" ? "" : s.live.status === "thinking" ? "Mirai está pensando" : "Mirai está respondiendo"))
}
