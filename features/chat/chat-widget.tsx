"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { usePathname, useRouter } from "next/navigation"
import { History, Maximize2, MessageCircle, MessageSquarePlus, X } from "lucide-react"
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { useShell } from "@/components/app/shell-store"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Conversation } from "./conversation"
import { HeaderTitle, ThreadHeaderMenu, ThreadList } from "./history"
import { newChat, useChatHotkeys } from "./hotkeys"
import { MiraiAvatar } from "./message"
import { restoreChat, useChat } from "./store"

const POS_KEY = "mirai-chat-pos"
const noop = () => () => {}

/** Burbuja flotante arrastrable con el isotipo de Mirai. Se aparta al desplazar la página y avisa si hay respuesta lista. */
function Fab({ onClick }: { onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [away, setAway] = useState(false)
  const unread = useChat((s) => s.unread)
  const busy = useChat((s) => s.live.status !== "idle")
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
  const left = pos ? pos.x < (typeof window === "undefined" ? 9999 : innerWidth / 2) : false
  return (
    <button ref={ref} type="button" aria-label={unread ? "Pregúntale a Mirai (tienes una respuesta lista)" : "Pregúntale a Mirai"}
      className={cn(
        "group fixed z-40 grid size-[52px] touch-none place-items-center rounded-full bg-[linear-gradient(145deg,#2B3F6E,#1F2B4B_55%,#24561A)] shadow-[0_10px_28px_rgba(31,43,75,.38),0_2px_6px_rgba(0,0,0,.12)] ring-4 ring-background transition-all duration-300 hover:-translate-y-0.5 hover:scale-105 md:size-[60px]",
        !pos && "right-3 bottom-[5.5rem] md:right-6 md:bottom-6", away && "pointer-events-none translate-y-4 scale-75 opacity-0", (unread || busy) && "chat-halo",
      )}
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
      <IsoIcon k="mirai" size={34} className="transition-transform duration-300 group-hover:rotate-[-8deg] md:size-[38px]" />
      <span aria-hidden className="absolute -right-1 -bottom-1 grid size-[22px] place-items-center rounded-full bg-lime text-navy ring-[3px] ring-background md:size-6"><MessageCircle className="size-3 fill-current md:size-3.5" /></span>
      {unread && <span aria-hidden className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-danger ring-2 ring-background" />}
      <span aria-hidden className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full bg-navy px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap text-white opacity-0 shadow-lg transition-all duration-200 group-hover:opacity-100 max-md:hidden", left ? "left-full ml-3" : "right-full mr-3")}>
        {unread ? "Tu respuesta está lista" : busy ? "Mirai está respondiendo…" : "Pregúntale a Mirai"}
      </span>
    </button>
  )
}

function HeadBtn({ label, onClick, children, className }: { label: string; onClick?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><button type="button" aria-label={label} onClick={onClick} className={cn("grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground", className)}>{children}</button></TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Contenido de la ventana: encabezado con avatar, historial rápido, nueva conversación y pantalla completa. */
function Panel({ onClose, onExpand }: { onClose: () => void; onExpand: () => void }) {
  const [view, setView] = useState<"chat" | "history">("chat")
  const [editing, setEditing] = useState(false)
  const busy = useChat((s) => s.live.status !== "idle")
  useChatHotkeys({ enabled: true })
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-1 border-b border-border/70 px-2.5 py-2">
        <MiraiAvatar size={38} live className="ml-0.5" />
        <div className="ml-1.5 min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[15.5px] leading-tight font-bold">Mirai <span className="rounded-full bg-brand-soft px-1.5 py-px text-[10.5px] font-bold text-link">Asesor</span></p>
          {view === "history" ? <p className="text-[12px] text-muted-foreground">Tus conversaciones</p> : busy ? <p className="text-[12px] text-muted-foreground">Escribiendo…</p>
            : <HeaderTitle editing={editing} onDone={() => setEditing(false)} className="text-[12px] text-muted-foreground" fallback={<p className="text-[12px] text-muted-foreground">Tu asesor financiero · en línea</p>} />}
        </div>
        <HeadBtn label={view === "history" ? "Volver al chat" : "Historial"} onClick={() => setView(view === "history" ? "chat" : "history")} className={cn(view === "history" && "bg-brand-soft text-link")}><History className="size-[18px]" /></HeadBtn>
        <HeadBtn label="Nueva conversación" onClick={() => { newChat(); setView("chat") }}><MessageSquarePlus className="size-[18px]" /></HeadBtn>
        <ThreadHeaderMenu onRename={() => { setView("chat"); setEditing(true) }} />
        <HeadBtn label="Abrir en pantalla completa" onClick={onExpand}><Maximize2 className="size-4" /></HeadBtn>
        <HeadBtn label="Cerrar chat" onClick={onClose}><X className="size-[18px]" /></HeadBtn>
      </header>
      {view === "history" ? <ThreadList className="min-h-0 flex-1" onPick={() => setView("chat")} /> : <Conversation compact autoFocus />}
    </div>
  )
}

export function ChatWidget() {
  const path = usePathname()
  const router = useRouter()
  const open = useShell((s) => s.chat)
  const preQ = useShell((s) => s.chatQ)
  const openChat = useShell((s) => s.openChat)
  const setOpen = useShell((s) => s.setChat)
  const live = useIsMobile()
  const hydrated = useSyncExternalStore(noop, () => true, () => false)
  // Igual que ResponsiveDialog: el modo (ventana o panel inferior) queda fijo mientras está abierto.
  const [lock, setLock] = useState<boolean | null>(null)
  if (open && hydrated && lock === null) setLock(live)
  if (!open && lock !== null) setLock(null)
  const mobile = lock ?? live
  const hidden = path.startsWith("/consejero") || path.startsWith("/sistema-diseno")

  useEffect(() => { restoreChat() }, [])
  useEffect(() => { if (open && typeof preQ === "string" && preQ) useChat.getState().setDraft(preQ) }, [open, preQ])
  // En /consejero el chat ya ocupa la pantalla: la burbuja no se muestra.
  useEffect(() => { if (hidden && open) setOpen(false) }, [hidden, open, setOpen])
  useEffect(() => {
    if (!open || hidden) return
    useChat.getState().setVisible(1)
    return () => useChat.getState().setVisible(-1)
  }, [open, hidden])
  useEffect(() => {
    if (!open || mobile) return
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[role=menu],[role=alertdialog],[data-slot=dialog-content]")) setOpen(false) }
    addEventListener("keydown", k); return () => removeEventListener("keydown", k)
  }, [open, mobile, setOpen])

  if (hidden) return null
  const expand = () => {
    const id = useChat.getState().threadId
    setOpen(false)
    router.push(id ? `/consejero?c=${id}` : "/consejero")
  }
  return (
    <>
      {!open && <Fab onClick={() => openChat()} />}
      {open && mobile && (
        <Drawer open onOpenChange={(o) => !o && setOpen(false)} repositionInputs={false}>
          <DrawerContent className="h-[94dvh] max-h-[94dvh]! bg-popover">
            <DrawerTitle className="sr-only">Chat con Mirai</DrawerTitle>
            <DrawerDescription className="sr-only">Pregúntale a Mirai sobre tu plata</DrawerDescription>
            <div className="min-h-0 flex-1" data-vaul-no-drag><Panel onClose={() => setOpen(false)} onExpand={expand} /></div>
          </DrawerContent>
        </Drawer>
      )}
      {open && !mobile && (
        <div role="dialog" aria-label="Chat con Mirai"
          className="chat-pop fixed right-5 bottom-5 z-50 flex h-[min(720px,calc(100dvh-40px))] w-[min(440px,calc(100vw-40px))] flex-col overflow-hidden rounded-[22px] bg-popover text-popover-foreground shadow-[0_24px_60px_rgba(31,43,75,.28),0_4px_12px_rgba(0,0,0,.08)] ring-1 ring-black/5 dark:ring-white/10">
          <Panel onClose={() => setOpen(false)} onExpand={expand} />
        </div>
      )}
    </>
  )
}
