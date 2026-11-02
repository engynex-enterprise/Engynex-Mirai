"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { CircleHelp, Crown, History, MessageSquarePlus, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Segmented } from "@/components/mirai/choice-cards"
import { Crumbs } from "@/components/mirai/crumbs"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { useApp } from "@/components/app/app-context"
import { useShell } from "@/components/app/shell-store"
import { crumbsFor } from "@/lib/nav"
import { can } from "@/lib/plans"
import { cn } from "@/lib/utils"
import type { Tono } from "@/lib/chat/types"
import { Conversation } from "@/features/chat/conversation"
import { ThreadList } from "@/features/chat/history"
import { HeaderTitle, ThreadHeaderMenu } from "@/features/chat/history"
import { newChat, useChatHotkeys } from "@/features/chat/hotkeys"
import { restoreChat, useChat } from "@/features/chat/store"

// /consejero: el chat de Mirai a pantalla completa (estilo ChatGPT/Claude). Historial a la izquierda (en celular, en un
// panel), la conversación al centro con la caja de texto fija abajo. Es la misma conversación de la burbuja.
// Las decisiones ("¿me conviene…?") ya no usan formulario: se escriben en el chat y el análisis sale como tarjeta.

const SIDE_KEY = "mirai-consejero-side"

/** Alto disponible: desde donde empieza la caja hasta abajo (encima de la barra inferior en celular). */
function useFill() {
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState<number | null>(null)
  useLayoutEffect(() => {
    const main = document.getElementById("main")
    const prevPb = main?.style.paddingBottom ?? ""
    if (main) main.style.paddingBottom = "0px"
    const fit = () => {
      const el = ref.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      const tab = document.querySelector<HTMLElement>('nav[aria-label="Navegación principal"]')
      const bottom = window.innerWidth < 768 ? (tab?.offsetHeight ?? 64) + 8 : 16
      const next = Math.max(420, Math.round((window.visualViewport?.height ?? window.innerHeight) - top - bottom))
      setH((p) => (p === next ? p : next))
    }
    fit()
    // El anuncio o el aviso de arriba pueden aparecer después: se recalcula cuando cambia el contenido de la página.
    const ro = new ResizeObserver(fit)
    ro.observe(document.body)
    if (main) ro.observe(main)
    if (ref.current?.parentElement) ro.observe(ref.current.parentElement)
    addEventListener("resize", fit)
    window.visualViewport?.addEventListener("resize", fit)
    return () => { ro.disconnect(); removeEventListener("resize", fit); window.visualViewport?.removeEventListener("resize", fit); if (main) main.style.paddingBottom = prevPb }
  }, [])
  return { ref, h }
}

function HeadBtn({ label, onClick, children, className }: { label: string; onClick?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><button type="button" aria-label={label} onClick={onClick} className={cn("grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground", className)}>{children}</button></TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Plan gratis: invitación amable (el chat sigue funcionando con respuestas de algoritmo). */
function FreeBanner() {
  return (
    <div className="appear flex items-center gap-3 rounded-2xl bg-card p-2.5 pr-3 sm:p-3 sm:pr-4 shadow-card ring-1 ring-black/5 dark:ring-white/10" data-testid="premium-upsell">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#FFD36B,#E08A00)] sm:size-10 text-white shadow-[0_4px_12px_rgba(224,138,0,.35)]"><Crown className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="leading-snug font-semibold max-sm:text-[14px]">Inteligencia artificial es parte de Mirai Premium</p>
        <p className="text-[13.5px] text-muted-foreground max-sm:hidden">Con tu plan te respondo al instante con tus datos, analizo compras y deudas con tus números y registro gastos con una frase. Con Premium conversas de todo y lees facturas con una foto.</p>
        <p className="text-[12.5px] text-muted-foreground sm:hidden">Hoy te respondo con tus datos. Con Premium, de todo.</p>
      </div>
      <Button asChild size="sm" className="shrink-0"><Link href="/planes?f=ia"><Crown /> Ver planes</Link></Button>
    </div>
  )
}

export function AdvisorView() {
  const params = useSearchParams()
  const { plan } = useApp()
  const setHelp = useShell((s) => s.setHelp)
  const threadId = useChat((s) => s.threadId)
  const tono = useChat((s) => s.tono)
  const setTono = useChat((s) => s.setTono)
  const [side, setSide] = useState(true)
  const [sheet, setSheet] = useState(false)
  const [editing, setEditing] = useState(false)
  const { ref, h } = useFill()
  // Ctrl/⌘ + K busca en el historial (abre el panel si está oculto); Ctrl/⌘ + Shift + O, conversación nueva.
  useChatHotkeys({
    enabled: true,
    onSearch: () => {
      const focus = () => document.querySelector<HTMLInputElement>(window.innerWidth < 768 ? '[role="dialog"] [data-chat-search]' : 'aside [data-chat-search]')?.focus()
      if (window.innerWidth < 768) { setSheet(true); setTimeout(focus, 250) }
      else { if (!side) setSide(true); setTimeout(focus, side ? 0 : 320) }
    },
  })

  // La conversación llega en la dirección (?c=…) desde la burbuja; si no, se sigue la que estaba abierta.
  useEffect(() => {
    restoreChat()
    const c = params.get("c")
    if (c && /^[0-9a-f-]{36}$/.test(c)) useChat.getState().setThread(c)
    try { if (localStorage.getItem(SIDE_KEY) === "0") queueMicrotask(() => setSide(false)) } catch { /* sin almacenamiento */ }
    useChat.getState().setVisible(1)
    return () => useChat.getState().setVisible(-1)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // La dirección refleja la conversación abierta (para compartirla o recargar la página).
  useEffect(() => {
    const u = new URL(window.location.href)
    if (threadId) u.searchParams.set("c", threadId); else u.searchParams.delete("c")
    if (u.href !== window.location.href) window.history.replaceState(window.history.state, "", u)
  }, [threadId])
  const toggleSide = () => { const v = !side; setSide(v); try { localStorage.setItem(SIDE_KEY, v ? "1" : "0") } catch { /* sin almacenamiento */ } }

  return (
    <div className="grid gap-3">
      {!can(plan, "ia") && <FreeBanner />}
      <div ref={ref} style={h ? { height: h } : undefined} className="flex min-h-[420px] overflow-hidden rounded-[24px] bg-popover shadow-card ring-1 ring-black/5 max-md:h-[calc(100dvh-9rem)] dark:ring-white/10">
        <aside aria-label="Historial" className={cn("hidden shrink-0 flex-col overflow-hidden border-border/70 bg-sidebar/60 transition-[width] duration-300 ease-[var(--ease-fb-enter)] md:flex", side ? "w-[288px] border-r" : "w-0")}>
          <div className="flex w-[288px] items-center gap-2.5 px-4 pt-4 pb-1">
            <IsoIcon k="consejero" size={30} />
            <div className="min-w-0"><p className="text-[15px] leading-tight font-bold">Tus conversaciones</p><p className="text-[12px] text-muted-foreground">Con Mirai, tu asesor</p></div>
          </div>
          <ThreadList className="min-h-0 w-[288px] flex-1" />
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-1 border-b border-border/70 px-2 py-2 sm:px-3">
            <HeadBtn label={side ? "Ocultar historial" : "Mostrar historial"} onClick={toggleSide} className="max-md:hidden">{side ? <PanelLeftClose className="size-[18px]" /> : <PanelLeftOpen className="size-[18px]" />}</HeadBtn>
            <HeadBtn label="Historial" onClick={() => setSheet(true)} className="md:hidden"><History className="size-[18px]" /></HeadBtn>
            <div className="min-w-0 flex-1 px-1">
              <Crumbs items={crumbsFor("consejero")} className="max-sm:hidden" />
              <h1 className="truncate text-[17px] leading-tight font-bold">Consejero</h1>
              <HeaderTitle editing={editing} onDone={() => setEditing(false)} className="text-[12px] text-muted-foreground" />
            </div>
            <Segmented value={tono} onChange={(v) => setTono(v as Tono)} className="max-lg:hidden [&_button]:h-8 [&_button]:px-3 [&_button]:text-[13px]" items={[{ value: "simple", label: "Sencillo" }, { value: "fin", label: "Financiero" }]} />
            <HeadBtn label="Cómo funciona" onClick={() => setHelp("consejero")}><CircleHelp className="size-[18px]" /></HeadBtn>
            <HeadBtn label="Nueva conversación" onClick={newChat}><MessageSquarePlus className="size-[18px]" /></HeadBtn>
            <ThreadHeaderMenu onRename={() => setEditing(true)} />
          </header>
          <Conversation autoFocus />
        </section>
      </div>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="left" className="w-[86vw] max-w-sm gap-0 bg-popover p-0">
          <SheetTitle className="px-4 pt-4 text-[17px]">Tus conversaciones</SheetTitle>
          <SheetDescription className="sr-only">Historial de conversaciones con Mirai</SheetDescription>
          <ThreadList className="min-h-0 flex-1" onPick={() => setSheet(false)} />
        </SheetContent>
      </Sheet>
    </div>
  )
}

/** Esqueleto de /consejero mientras carga. */
export function AdvisorSkeleton() {
  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[420px] overflow-hidden rounded-[24px] bg-popover shadow-card ring-1 ring-black/5 md:h-[calc(100dvh-2rem)]">
      <div className="hidden w-[288px] shrink-0 flex-col gap-2 border-r p-4 md:flex"><Skeleton className="h-10 rounded-xl" /><Skeleton className="h-9 rounded-full" />{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>
      <div className="flex flex-1 flex-col"><div className="border-b p-3"><Skeleton className="h-9 w-48" /></div>
        <div className="grid flex-1 content-center justify-items-center gap-3 p-6"><Skeleton className="size-20 rounded-full" /><Skeleton className="h-8 w-64" /><div className="grid w-full max-w-2xl grid-cols-2 gap-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[84px] rounded-2xl" />)}</div></div>
        <div className="p-4"><Skeleton className="mx-auto h-[92px] max-w-3xl rounded-[26px]" /></div>
      </div>
    </div>
  )
}
