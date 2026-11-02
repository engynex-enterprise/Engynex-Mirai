"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowUp, FileText, Mic, Paperclip, Square, X } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { ChatHints } from "@/lib/chat/types"
import { sendAttachment, sendChat, stopChat, useChat } from "./store"

const MAX = 6 * 1024 * 1024

type Rec = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null }
const recCtor = () => (typeof window === "undefined" ? null : ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition ?? null))
const noop = () => () => {}

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
  const [file, setFile] = useState<{ f: File; url: string | null } | null>(null)
  const [listening, setListening] = useState(false)
  const rec = useRef<Rec | null>(null)
  const voice = useSyncExternalStore(noop, () => !!recCtor(), () => false)

  // Alto automático (hasta ~8 líneas).
  useEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(220, el.scrollHeight)}px`
  }, [draft])
  useEffect(() => { if (autoFocus) setTimeout(() => ta.current?.focus({ preventScroll: true }), 60) }, [autoFocus])
  useEffect(() => () => { rec.current?.stop() }, [])
  useEffect(() => () => { if (file?.url) URL.revokeObjectURL(file.url) }, [file])

  const queued = useChat((s) => s.queued)
  const send = () => {
    if (busy) { if (draft.trim() && !file) sendChat(qc, { text: draft }); return }
    if (file) { const f = file.f; setFile(null); sendAttachment(qc, f, draft.trim()); return }
    if (!draft.trim()) return
    sendChat(qc, { text: draft })
    ta.current?.focus()
  }
  const pick = (f: File | undefined) => {
    if (!f) return
    if (f.size > MAX) return toast.warning("El archivo pesa más de 6 MB")
    if (!/^image\/|application\/pdf/.test(f.type)) return toast.warning("Usa una foto (JPG, PNG) o un PDF")
    setFile({ f, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null })
    ta.current?.focus()
  }
  const toggleVoice = () => {
    if (listening) { rec.current?.stop(); return }
    const C = recCtor()
    if (!C) return
    const r = new C()
    r.lang = "es-CO"; r.interimResults = true; r.continuous = false
    const base = String(useChat.getState().draft ?? "").trim()
    r.onresult = (e) => {
      let t = ""
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
      setDraft(`${base ? `${base} ` : ""}${t}`.trimStart())
    }
    r.onend = () => { setListening(false); rec.current = null; ta.current?.focus() }
    r.onerror = (e) => { if (e.error === "not-allowed") toast.warning("Permite el micrófono en tu navegador para dictar"); setListening(false) }
    rec.current = r
    try { r.start(); setListening(true) } catch { setListening(false) }
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
      <div className={cn("grid rounded-[26px] bg-card shadow-[0_2px_12px_rgba(31,43,75,.10),0_0_0_1px_rgba(0,0,0,.06)] transition-shadow focus-within:shadow-[0_2px_16px_rgba(31,43,75,.14),0_0_0_2px_var(--brand)] dark:shadow-[0_0_0_1px_rgba(255,255,255,.1)]", listening && "shadow-[0_0_0_2px_#D0243F]")}>
        {file && (
          <div className="flex items-center gap-2 px-3 pt-3">
            <span className="relative flex max-w-full items-center gap-2 rounded-xl bg-secondary py-1.5 pr-8 pl-1.5 text-[13px]">
              {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) del adjunto */}
              {file.url ? <img src={file.url} alt="" className="size-10 rounded-lg object-cover" /> : <span className="grid size-10 place-items-center rounded-lg bg-danger-soft text-danger"><FileText className="size-5" /></span>}
              <span className="grid min-w-0"><span className="truncate font-medium">{file.f.name}</span><span className="text-[11.5px] text-muted-foreground">Factura, recibo, comprobante o extracto</span></span>
              <button type="button" aria-label="Quitar adjunto" onClick={() => setFile(null)} className="absolute top-1 right-1 grid size-6 place-items-center rounded-full hover:bg-hover"><X className="size-3.5" /></button>
            </span>
          </div>
        )}
        <textarea ref={ta} rows={1} value={draft} aria-label="Escribe tu pregunta" enterKeyHint="send"
          placeholder={listening ? "Te escucho…" : file ? "Cuéntame qué es (opcional): factura, comprobante, extracto…" : compact ? "Pregúntale a Mirai…" : "Pregunta lo que quieras o cuéntame una decisión: ¿me conviene…?"}
          className="max-h-[220px] min-h-[52px] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-6 outline-none placeholder:text-placeholder"
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => { const f = [...e.clipboardData.files][0]; if (f) { e.preventDefault(); pick(f) } }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }} />
        <div className="flex items-center gap-1 px-2 pb-2">
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" aria-label="Adjuntar archivo" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = "" }} />
          {hints?.canEdit !== false && <Btn label="Adjuntar foto o PDF" disabled={busy} onClick={() => fileRef.current?.click()}><Paperclip className="size-[18px]" /></Btn>}
          {voice && (
            <Btn label={listening ? "Detener dictado" : "Dictar por voz"} pressed={listening} onClick={toggleVoice} className={cn(listening && "bg-danger-soft text-danger hover:bg-danger-soft hover:text-danger")}>
              {listening ? <span className="flex h-4 items-center gap-[2px]" aria-hidden>{[0, 1, 2, 3].map((i) => <span key={i} className="chat-wave h-full w-[3px] rounded-full bg-current" style={{ animationDelay: `${i * 0.12}s` }} />)}</span> : <Mic className="size-[18px]" />}
            </Btn>
          )}
          <span className="flex-1" />
          {!compact && <span className="hidden pr-1 text-[11.5px] text-muted-foreground lg:inline">Enter para enviar · Shift + Enter, nueva línea</span>}
          {busy ? (
            <button type="button" aria-label="Detener respuesta" onClick={stopChat} className="grid size-9 place-items-center rounded-full bg-foreground text-background transition-transform hover:scale-105"><Square className="size-3.5 fill-current" /></button>
          ) : (
            <button type="button" aria-label="Enviar" disabled={!draft.trim() && !file} onClick={send} className="grid size-9 place-items-center rounded-full bg-brand text-white shadow-[0_2px_6px_rgba(42,127,20,.35)] transition-all hover:scale-105 hover:bg-primary-hover disabled:scale-100 disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none"><ArrowUp className="size-[18px]" /></button>
          )}
        </div>
      </div>
      {queued && <p className="px-3 text-center text-[12px] font-medium text-link" role="status">Tu mensaje “{queued.slice(0, 60)}” se enviará cuando Mirai termine esta respuesta.</p>}
      <p className="px-3 text-center text-[11px] leading-snug text-muted-foreground">{note ?? "Mirai puede equivocarse. Es orientación con tus datos y no reemplaza a un asesor certificado."}</p>
    </div>
  )
}
