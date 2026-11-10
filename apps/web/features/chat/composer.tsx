"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowUp, FileSpreadsheet, FileText, Loader2, Mic, Paperclip, Square, X } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { ChatHints } from "@/lib/chat/types"
import { sendAttachment, sendChat, stopChat, useChat } from "./store"
import { chatTranscribe } from "./api"
import { ACCEPT, MAX_FILES, MAX_TOTAL, kindOf, prepare, type Kind } from "./files"
import { useVoice } from "./voice"

type Adj = { id: string; name: string; kind: Kind; url: string | null; file: File | null; error?: string }
const KIND_LABEL: Record<Kind, string> = { foto: "Foto", pdf: "PDF", word: "Word", excel: "Excel", texto: "Texto" }

function Btn({ label, onClick, disabled, children, className, pressed }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; className?: string; pressed?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}
          className={cn("grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40", className)}>{children}</button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Caja de texto del chat (estilo ChatGPT/Claude): crece sola, Enter envía, Shift+Enter salto de línea, adjuntos y voz. */
export function Composer({ hints, autoFocus, compact }: { hints?: ChatHints; autoFocus?: boolean; compact?: boolean }) {
  const qc = useQueryClient()
  const draft = useChat((s) => (typeof s.draft === "string" ? s.draft : ""))
  const setDraft = useChat((s) => s.setDraft)
  const status = useChat((s) => s.live.status)
  const busy = status !== "idle"
  const ta = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [adj, setAdj] = useState<Adj[]>([])
  const [drag, setDrag] = useState(false)
  const preparing = adj.some((a) => !a.file && !a.error)
  const ready = adj.filter((a) => a.file).map((a) => a.file!)
  const voice = useVoice({
    base: () => String(useChat.getState().draft ?? ""),
    onText: (t) => setDraft(t),
    transcribe: chatTranscribe,
    onError: (msg) => toast.warning(msg),
    onDone: () => ta.current?.focus(),
  })
  const listening = voice.state === "listening" || voice.state === "recording"

  // Alto automático (hasta ~8 líneas).
  useEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(220, el.scrollHeight)}px`
  }, [draft])
  useEffect(() => { if (autoFocus) setTimeout(() => ta.current?.focus({ preventScroll: true }), 60) }, [autoFocus])
  const urls = useRef<string[]>([])
  useEffect(() => () => { for (const u of urls.current) URL.revokeObjectURL(u) }, [])

  const queued = useChat((s) => s.queued)
  const send = () => {
    if (busy) { if (draft.trim() && !adj.length) sendChat(qc, { text: draft }); return }
    if (preparing) return
    if (ready.length) {
      if (ready.reduce((a, f) => a + f.size, 0) > MAX_TOTAL) return toast.warning("Entre todos los archivos pasan de 6 MB", { description: "Quita alguno y envíalo después." })
      setAdj([]); sendAttachment(qc, ready, draft.trim()); return
    }
    if (!draft.trim()) return
    sendChat(qc, { text: draft })
    ta.current?.focus()
  }
  const pick = (list: File[]) => {
    if (!list.length) return
    const room = MAX_FILES - adj.length
    if (room <= 0) return toast.warning(`Puedes enviar hasta ${MAX_FILES} archivos a la vez`)
    if (list.length > room) toast.warning(`Agregué ${room} de ${list.length}: van hasta ${MAX_FILES} archivos a la vez`)
    for (const f of list.slice(0, room)) {
      const id = crypto.randomUUID()
      const kind = kindOf(f) ?? "texto"
      const url = kind === "foto" ? URL.createObjectURL(f) : null
      if (url) urls.current.push(url)
      setAdj((a) => [...a, { id, name: f.name, kind, url, file: null }])
      prepare(f)
        .then((file) => setAdj((a) => a.map((x) => (x.id === id ? { ...x, file } : x))))
        .catch((e: Error) => { setAdj((a) => a.filter((x) => x.id !== id)); toast.warning(e.message || "No pude leer ese archivo") })
    }
    ta.current?.focus()
  }

  const q = hints?.ia.quota
  const note = !hints ? null
    : !hints.ia.premium ? <>Plan Gratis: te respondo al instante con tus datos. <Link href="/planes?f=ia" className="font-semibold text-link hover:underline">La IA es Premium</Link></>
      : hints.ia.off ? <>La IA está apagada. <Link href="/ajustes?tab=ia" className="font-semibold text-link hover:underline">Actívala</Link></>
        : q?.nivel === "agotado" ? <>Usaste tus créditos de IA del mes: respondo con tus datos hasta que se renueven. <Link href="/ajustes?tab=usoia" className="font-semibold text-link hover:underline">Ver uso</Link></>
          : q?.nivel === "aviso" && q.quedan != null ? <>Te quedan <b>{Math.round(q.quedan).toLocaleString("es-CO")}</b> créditos de IA este mes.</>
            : null

  return (
    <div className="grid gap-1.5">
      <div onDragOver={(e) => { if (hints?.canEdit !== false && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrag(true) } }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { setDrag(false); if (hints?.canEdit === false || !e.dataTransfer.files.length) return; e.preventDefault(); pick([...e.dataTransfer.files]) }}
        className={cn("grid rounded-[26px] bg-card shadow-[0_2px_12px_rgba(31,43,75,.10),0_0_0_1px_rgba(0,0,0,.06)] transition-shadow focus-within:shadow-[0_2px_16px_rgba(31,43,75,.14),0_0_0_2px_var(--brand)] dark:shadow-[0_0_0_1px_rgba(255,255,255,.1)]", listening && "shadow-[0_0_0_2px_#D0243F]", drag && "shadow-[0_0_0_2px_var(--brand)]")}>
        {!!adj.length && (
          <div className="flex gap-2 overflow-x-auto px-3 pt-3" aria-label="Archivos adjuntos">
            {adj.map((a) => (
              <span key={a.id} className="relative flex max-w-[15rem] shrink-0 items-center gap-2 rounded-xl bg-secondary py-1.5 pr-8 pl-1.5 text-[13px]">
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) del adjunto */}
                {a.url ? <img src={a.url} alt="" className="size-10 rounded-lg object-cover" />
                  : <span className={cn("grid size-10 place-items-center rounded-lg", a.kind === "excel" ? "bg-success-soft text-success" : a.kind === "word" ? "bg-[#E6F0FB] text-[#1F5FAD]" : "bg-danger-soft text-danger")}>{a.kind === "excel" ? <FileSpreadsheet className="size-5" /> : <FileText className="size-5" />}</span>}
                <span className="grid min-w-0"><span className="truncate font-medium">{a.name}</span><span className="flex items-center gap-1 text-[11.5px] text-muted-foreground">{a.file ? KIND_LABEL[a.kind] : <><Loader2 className="size-3 animate-spin" /> Preparando…</>}</span></span>
                <button type="button" aria-label={`Quitar ${a.name}`} onClick={() => setAdj((x) => x.filter((y) => y.id !== a.id))} className="absolute top-1 right-1 grid size-6 place-items-center rounded-full hover:bg-hover"><X className="size-3.5" /></button>
              </span>
            ))}
          </div>
        )}
        <textarea ref={ta} rows={1} value={draft} aria-label="Escribe tu pregunta" enterKeyHint="send"
          placeholder={voice.state === "transcribing" ? "Pasando tu voz a texto…" : listening ? "Te escucho… habla con calma, espero tus pausas" : adj.length ? "Dime qué hago (opcional): «regístralos», «es un imprevisto», «lo pago el 15»…" : compact ? "Pregúntale a Mirai…" : "Pregunta lo que quieras o cuéntame una decisión: ¿me conviene…?"}
          className="max-h-[220px] min-h-[52px] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-6 outline-none placeholder:text-placeholder"
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => { const fs = [...e.clipboardData.files]; if (fs.length) { e.preventDefault(); pick(fs) } }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }} />
        <div className="flex items-center gap-1 px-2 pb-2">
          <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" aria-label="Adjuntar archivo" onChange={(e) => { pick([...(e.target.files ?? [])]); e.target.value = "" }} />
          {hints?.canEdit !== false && <Btn label="Adjuntar fotos, PDF, Word o Excel" disabled={busy} onClick={() => fileRef.current?.click()}><Paperclip className="size-[18px]" /></Btn>}
          {voice.supported && (
            <Btn label={voice.state === "transcribing" ? "Pasando tu voz a texto" : listening ? "Detener dictado" : "Dictar por voz"} pressed={listening} disabled={voice.state === "transcribing"} onClick={voice.toggle} className={cn(listening && "bg-danger-soft text-danger hover:bg-danger-soft hover:text-danger")}>
              {voice.state === "transcribing" ? <Loader2 className="size-[18px] animate-spin" /> : listening ? <span className="flex h-4 items-center gap-[2px]" aria-hidden>{[0, 1, 2, 3].map((i) => <span key={i} className="chat-wave h-full w-[3px] rounded-full bg-current" style={{ animationDelay: `${i * 0.12}s` }} />)}</span> : <Mic className="size-[18px]" />}
            </Btn>
          )}
          <span className="flex-1" />
          {!compact && <span className="hidden pr-1 text-[11.5px] text-muted-foreground lg:inline">Enter para enviar · Shift + Enter, nueva línea</span>}
          {busy ? (
            <button type="button" aria-label="Detener respuesta" onClick={stopChat} className="grid size-9 place-items-center rounded-full bg-foreground text-background transition-transform hover:scale-105"><Square className="size-3.5 fill-current" /></button>
          ) : (
            <button type="button" aria-label="Enviar" disabled={(!draft.trim() && !ready.length) || preparing} onClick={send} className="grid size-9 place-items-center rounded-full bg-brand text-white shadow-[0_2px_6px_rgba(42,127,20,.35)] transition-all hover:scale-105 hover:bg-primary-hover disabled:scale-100 disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none"><ArrowUp className="size-[18px]" /></button>
          )}
        </div>
      </div>
      {queued && <p className="px-3 text-center text-[12px] font-medium text-link" role="status">Tu mensaje “{queued.slice(0, 60)}” se enviará cuando Mirai termine esta respuesta.</p>}
      <p className="px-3 text-center text-[11px] leading-snug text-muted-foreground">{note ?? "Mirai puede equivocarse. Es orientación con tus datos y no reemplaza a un asesor certificado."}</p>
    </div>
  )
}
