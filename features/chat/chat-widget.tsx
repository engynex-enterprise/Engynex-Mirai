"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowUp, History, MessageCirclePlus, Sparkles, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Segmented } from "@/components/mirai/choice-cards"
import { useApp } from "@/components/app/app-context"
import { useShell } from "@/components/app/shell-store"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/lib/utils"
import { chatSend } from "./actions"

type Msg = { id: string; role: string; content: string; meta?: { go?: string } }
const CHIPS = ["¿Cómo puedo ahorrar más cada mes?", "¿Qué deuda debería pagar primero?", "¿Me conviene sacar una tarjeta de crédito?", "Explícame qué es la tasa E.A.", "¿Cuánto debería tener en el fondo de emergencia?"]
const POS_KEY = "mirai-chat-pos"

/** Markdown mínimo (mdLite de la v4): **negrita**, listas con - o • y párrafos. */
function MdLite({ text }: { text: string }) {
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p))
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  const flush = () => { if (list.length) blocks.push(<ul key={blocks.length} className="my-1 list-disc space-y-0.5 pl-5">{list.map((l, i) => <li key={i}>{bold(l)}</li>)}</ul>); list = [] }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*[-•*]\s+(.*)/)
    if (m) list.push(m[1])
    else { flush(); if (line.trim()) blocks.push(<p key={blocks.length} className="my-1">{bold(line)}</p>) }
  }
  flush()
  return <>{blocks}</>
}

function group(fecha: string) {
  const d = (Date.now() - new Date(fecha).getTime()) / 864e5
  return d < 1 && new Date(fecha).toDateString() === new Date().toDateString() ? "Hoy" : d < 2 ? "Ayer" : d < 7 ? "Últimos 7 días" : d < 30 ? "Últimos 30 días" : "Anteriores"
}

/** Burbuja arrastrable que abre y cierra el chat. */
function Fab({ onClick }: { onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [away, setAway] = useState(false)
  const drag = useRef<{ sx: number; sy: number; x: number; y: number; moved: boolean } | null>(null)
  // Mientras desplazas la página la burbuja se aparta para no tapar botones; vuelve al quedarte quieto.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const on = () => { setAway(true); clearTimeout(t); t = setTimeout(() => setAway(false), 1500) }
    addEventListener("scroll", on, { passive: true, capture: true })
    return () => { removeEventListener("scroll", on, { capture: true }); clearTimeout(t) }
  }, [])
  useEffect(() => {
    queueMicrotask(() => { try { const p = JSON.parse(localStorage.getItem(POS_KEY) || "null"); if (p) setPos(p) } catch { /* sin posición guardada */ } })
    const fit = () => setPos((p) => (p ? { x: Math.min(Math.max(8, p.x), innerWidth - 64), y: Math.min(Math.max(8, p.y), innerHeight - 64) } : p))
    addEventListener("resize", fit); return () => removeEventListener("resize", fit)
  }, [])
  return (
    <button ref={ref} type="button" aria-label="Pregúntale a Mirai" title="Pregúntale a Mirai"
      className={cn("fixed z-40 grid size-12 touch-none place-items-center rounded-full bg-navy text-lime shadow-xl ring-4 ring-background transition-all duration-300 hover:scale-105 md:size-14", !pos && "right-3 bottom-[5.5rem] md:right-5 md:bottom-6", away && "pointer-events-none translate-y-4 scale-75 opacity-0")}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      onPointerDown={(e) => { const r = ref.current!.getBoundingClientRect(); drag.current = { sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, moved: false }; ref.current!.setPointerCapture(e.pointerId) }}
      onPointerMove={(e) => {
        const d = drag.current; if (!d) return
        const dx = e.clientX - d.sx, dy = e.clientY - d.sy
        if (!d.moved && Math.hypot(dx, dy) < 6) return
        d.moved = true
        setPos({ x: Math.min(Math.max(8, d.x + dx), innerWidth - 64), y: Math.min(Math.max(8, d.y + dy), innerHeight - 64) })
      }}
      onPointerUp={() => { const d = drag.current; drag.current = null; if (d?.moved) { try { localStorage.setItem(POS_KEY, JSON.stringify(pos)) } catch { /* sin almacenamiento */ } } else onClick() }}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden><path fill="currentColor" opacity=".18" d="M16 3C8.8 3 3 8.2 3 14.6c0 3.4 1.6 6.4 4.2 8.5L6 29l6.1-3.2c1.2.3 2.5.4 3.9.4 7.2 0 13-5.2 13-11.6S23.2 3 16 3Z" /><circle cx="10.5" cy="15" r="2" fill="currentColor" /><circle cx="16" cy="15" r="2" fill="currentColor" /><circle cx="21.5" cy="15" r="2" fill="currentColor" /></svg>
    </button>
  )
}

export function ChatWidget() {
  const { user, book } = useApp()
  const router = useRouter()
  const path = usePathname()
  const qc = useQueryClient()
  const open = useShell((s) => s.chat)
  const preQ = useShell((s) => s.chatQ)
  const openChat = useShell((s) => s.openChat)
  const setOpen = useShell((s) => s.setChat)
  const [cur, setCur] = useState<string | null>(null)
  const [side, setSide] = useState(false)
  const [tono, setTono] = useState<"simple" | "fin">("simple")
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Msg[]>([])
  const end = useRef<HTMLDivElement>(null)
  const ta = useRef<HTMLTextAreaElement>(null)

  const threads = useQuery({
    queryKey: ["chat-threads", user.id, book.id], enabled: open,
    queryFn: async () => (await createClient().from("chat_threads").select("id,titulo,updated_at").eq("book_id", book.id).eq("user_id", user.id).is("deleted_at", null).order("updated_at", { ascending: false }).limit(50)).data ?? [],
  })
  const msgs = useQuery({
    queryKey: ["chat-msgs", cur], enabled: !!cur,
    queryFn: async () => (await createClient().from("chat_messages").select("id,role,content,meta").eq("thread_id", cur!).is("deleted_at", null).order("created_at")).data as Msg[] ?? [],
  })
  const list = [...(cur ? msgs.data ?? [] : []), ...pending]

  useEffect(() => { if (open && innerWidth >= 900) queueMicrotask(() => setSide(true)) }, [open])
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }) }, [list.length, busy])
  useEffect(() => {
    if (open && preQ) queueMicrotask(() => { setCur(null); setQ(preQ); setTimeout(() => ta.current?.focus(), 50) })
  }, [open, preQ])
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[role=dialog]")) setOpen(false) }
    addEventListener("keydown", k); return () => removeEventListener("keydown", k)
  }, [open, setOpen])

  const goCons = (text: string) => {
    if (innerWidth < 900) setOpen(false)
    sessionStorage.setItem("mirai-cons-q", text)
    router.push("/consejero?desde=chat")
  }
  const send = async (text = q) => {
    const t = text.trim(); if (!t || busy) return
    setQ(""); setBusy(true); setPending([{ id: "tmp-u", role: "user", content: t }])
    try {
      const r = await chatSend({ threadId: cur, q: t, tono })
      setCur(r.threadId)
      await qc.invalidateQueries({ queryKey: ["chat-msgs", r.threadId] })
      await qc.refetchQueries({ queryKey: ["chat-msgs", r.threadId] })
      qc.invalidateQueries({ queryKey: ["chat-threads"] })
      if (r.go) setTimeout(() => goCons(r.go!), 1400)
    } catch (e) { toast.error((e as Error).message) }
    setPending([]); setBusy(false)
  }
  const del = async (id: string) => {
    await createClient().from("chat_threads").update({ deleted_at: new Date().toISOString() }).eq("id", id)
    if (cur === id) setCur(null)
    qc.invalidateQueries({ queryKey: ["chat-threads"] })
  }
  if (path.startsWith("/sistema-diseno")) return null
  const groups = [...new Set((threads.data ?? []).map((t) => group(t.updated_at)))]
  const title = threads.data?.find((t) => t.id === cur)?.titulo

  return (
    <>
      {!open && <Fab onClick={() => openChat()} />}
      {open && (
        <div role="dialog" aria-label="Asesor financiero" className="fixed inset-0 z-50 flex bg-background md:inset-auto md:right-5 md:bottom-5 md:h-[min(640px,calc(100dvh-40px))] md:w-[min(760px,calc(100vw-40px))] md:overflow-hidden md:rounded-xl md:border md:shadow-2xl">
          {side && (
            <aside className="absolute inset-0 z-10 flex w-full flex-col border-r bg-sidebar md:static md:w-60">
              <div className="flex items-center gap-2 p-3">
                <Button className="flex-1" variant="outline" onClick={() => { setCur(null); if (innerWidth < 700) setSide(false) }}><MessageCirclePlus /> Nueva conversación</Button>
                <Button size="icon" variant="ghost" className="md:hidden" aria-label="Cerrar historial" onClick={() => setSide(false)}><X /></Button>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-3">
                {!threads.data?.length && <p className="p-2 text-sm text-muted-foreground">Aún no tienes conversaciones.</p>}
                {groups.map((g) => (
                  <div key={g} className="grid gap-0.5 pt-2">
                    <p className="px-2 text-xs font-semibold text-muted-foreground">{g}</p>
                    {threads.data!.filter((t) => group(t.updated_at) === g).map((t) => (
                      <div key={t.id} className={cn("group flex items-center rounded-md hover:bg-hover", t.id === cur && "bg-brand-soft")}>
                        <button type="button" className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm" onClick={() => { setCur(t.id); if (innerWidth < 700) setSide(false) }}>{t.titulo}</button>
                        <button type="button" aria-label={`Borrar ${t.titulo}`} className="mr-1 grid size-7 place-items-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100" onClick={() => del(t.id)}><Trash2 className="size-3.5" /></button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </aside>
          )}
          <section className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center gap-2 border-b px-3 py-2">
              <Button size="icon" variant="ghost" aria-label="Historial" onClick={() => setSide(!side)}><History /></Button>
              <div className="min-w-0 flex-1"><p className="font-semibold">Asesor financiero</p>{title && <p className="truncate text-xs text-muted-foreground">{title}</p>}</div>
              <Segmented value={tono} onChange={(v) => setTono(v as "simple")} items={[{ value: "simple", label: "Sencillo" }, { value: "fin", label: "Financiero" }]} className="hidden sm:flex" />
              <Button size="icon" variant="ghost" aria-label="Cerrar chat" onClick={() => setOpen(false)}><X /></Button>
            </header>
            <div className="flex-1 overflow-y-auto p-4">
              {!list.length ? (
                <div className="grid h-full content-center justify-items-center gap-4 text-center">
                  <span className="grid size-14 place-items-center rounded-full bg-navy text-lime"><Sparkles /></span>
                  <p className="text-lg font-semibold">¿En qué te ayudo hoy?</p>
                  <div className="flex max-w-md flex-wrap justify-center gap-2">{CHIPS.map((c) => <button key={c} type="button" className="rounded-full border px-3 py-1.5 text-sm hover:bg-hover" onClick={() => send(c)}>{c}</button>)}</div>
                </div>
              ) : (
                <div className="grid gap-3">
                  {list.map((m) => m.role === "user" ? (
                    <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-3.5 py-2 text-sm text-white whitespace-pre-wrap">{m.content}</div>
                  ) : (
                    <div key={m.id} className="flex max-w-[92%] gap-2">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-navy text-lime"><Sparkles className="size-3.5" /></span>
                      <div className="rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2 text-sm"><MdLite text={m.content} />
                        {m.meta?.go && <Button size="sm" variant="soft" className="mt-2" onClick={() => goCons(m.meta!.go!)}>Abrir Consejo antes de gastar</Button>}
                      </div>
                    </div>
                  ))}
                  {busy && <div className="flex gap-2"><span className="grid size-7 place-items-center rounded-full bg-navy text-lime"><Sparkles className="size-3.5" /></span><div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-3" aria-label="Escribiendo">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 0.15}s` }} />)}</div></div>}
                  <div ref={end} />
                </div>
              )}
            </div>
            <footer className="border-t p-3">
              <Segmented value={tono} onChange={(v) => setTono(v as "simple")} items={[{ value: "simple", label: "Sencillo" }, { value: "fin", label: "Financiero" }]} className="mb-2 sm:hidden" />
              <div className="flex items-end gap-2">
                <Textarea ref={ta} rows={1} value={q} placeholder="Escribe tu pregunta…" aria-label="Tu pregunta" className="max-h-36 min-h-10 resize-none"
                  onChange={(e) => { setQ(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(140, e.target.scrollHeight)}px` }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }} />
                <Button size="icon-lg" aria-label="Enviar" disabled={!q.trim() || busy} onClick={() => send()}><ArrowUp /></Button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">Orientación basada en tus datos de Mirai. No reemplaza a un asesor certificado.</p>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}
