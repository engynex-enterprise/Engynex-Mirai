"use client"

import { useState } from "react"
import { formatDistanceToNowStrict } from "date-fns"
import { es } from "date-fns/locale"
import { Send } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { IconButton } from "@/components/mirai/tip"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export type Note = { id: string; autor: string; texto: string; created_at: string }

/** Lista de notas entre el titular y el contador, con caja para responder. */
export function NotesThread({ notes, me, other, onSend, limit }: { notes: Note[]; me: "titular" | "contador"; other: string; onSend: (t: string) => Promise<void>; limit?: number }) {
  const [t, setT] = useState("")
  const [busy, setBusy] = useState(false)
  const list = limit ? notes.slice(-limit) : notes
  const send = async () => {
    if (!t.trim() || busy) return
    setBusy(true)
    try { await onSend(t.trim()); setT("") } catch (e) { toast.error((e as Error).message) }
    setBusy(false)
  }
  return (
    <div className="grid gap-3">
      {!list.length && <p className="text-sm text-muted-foreground">Aún no hay notas. Escribe la primera para pedir un documento o resolver una duda.</p>}
      {limit && notes.length > limit && <p className="text-center text-xs text-muted-foreground">Mostramos las últimas {limit} de {notes.length} notas.</p>}
      {list.map((n) => (
        <div key={n.id} className={cn("max-w-[85%] rounded-[18px] px-3.5 py-2 text-sm", n.autor === me ? "ml-auto rounded-br-sm bg-brand text-white" : "rounded-bl-sm bg-muted")}>
          <p className="whitespace-pre-wrap">{n.texto}</p>
          <p className={cn("mt-1 text-[11px]", n.autor === me ? "text-white/70" : "text-muted-foreground")}>{n.autor === me ? "Tú" : other} · {formatDistanceToNowStrict(new Date(n.created_at), { locale: es, addSuffix: true })}</p>
        </div>
      ))}
      <div className="flex items-end gap-2">
        <Textarea rows={2} value={t} maxLength={2000} onChange={(e) => setT(e.target.value)} placeholder={`Escribe una nota para ${other}…`} aria-label={`Nota para ${other}`}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send() } }} />
        <IconButton variant={t.trim() ? "soft" : "secondary"} size="icon-lg" label="Enviar nota" icon={busy ? <Spinner /> : <Send />} aria-busy={busy || undefined} disabled={!t.trim() || busy} onClick={send} />
      </div>
    </div>
  )
}
